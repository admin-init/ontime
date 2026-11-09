"""邮件导入：.eml/.mbox 解析 + 只读 IMAP 同步。

隐私约束：
- IMAP 凭证只写 ~/.ontime/imap.json（尽力设为 600），绝不入库、不回显、不写日志。
- 同步只用 BODY.PEEK（imap-tools 的 mark_seen=False），不标已读、不发信、不删信。
"""

from __future__ import annotations

import asyncio
import email
import hashlib
import imaplib
import io
import json
import os
from datetime import datetime, timedelta, timezone
from email import policy
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime
from pathlib import Path

from bs4 import BeautifulSoup
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import MEDIA_DIR, STORAGE_DIR, SessionLocal
from app.models import Job, Source, utcnow
from app.pipeline import INGEST_STEPS, run_ingest

IMAP_CONFIG_PATH = Path.home() / ".ontime" / "imap.json"
MAX_MBOX_MESSAGES = 50

# RFC 2971 ID：网易（163/126）要求登录后先声明客户端身份，否则 SELECT 会返回
# "Unsafe Login"。imaplib 未内置 ID 命令，需要先注册再发送。
imaplib.Commands.setdefault("ID", ("NONAUTH", "AUTH", "SELECTED"))
IMAP_CLIENT_ID = '("name" "ontime" "version" "1.0" "vendor" "ontime")'


# ---------------------------------------------------------------- 凭证文件


def load_imap_config() -> dict:
    try:
        data = json.loads(IMAP_CONFIG_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def save_imap_config(data: dict) -> None:
    IMAP_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    IMAP_CONFIG_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(IMAP_CONFIG_PATH, 0o600)
    except OSError:
        pass


def imap_status() -> dict:
    cfg = load_imap_config()
    return {
        "configured": bool(cfg.get("host") and cfg.get("username") and cfg.get("password")),
        "verified": bool(cfg.get("verified")),
        "last_sync_at": cfg.get("last_sync_at"),
        "error": cfg.get("error"),
    }


# ---------------------------------------------------------------- 邮件解析


def _decode_part(part) -> str:
    data = part.get_payload(decode=True) or b""
    charset = part.get_content_charset() or "utf-8"
    try:
        return data.decode(charset, errors="replace")
    except LookupError:
        return data.decode("utf-8", errors="replace")


def _html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style"]):
        tag.decompose()
    return soup.get_text("\n", strip=True)


def _header(msg, key: str) -> str | None:
    value = msg.get(key)
    if value is None:
        return None
    try:
        text = str(value)
        # imap_tools 用 compat32 解析，主题/发件人可能仍是 =?UTF-8?B?...?= 编码字。
        if "=?" in text:
            text = str(make_header(decode_header(text)))
        return text.strip() or None
    except Exception:  # noqa: BLE001
        return None


def parse_message(msg) -> dict:
    """把标准库 email.message.Message 解析成本项目要的邮件结构。"""
    subject = _header(msg, "Subject") or "(无主题)"
    sender = _header(msg, "From")
    date = None
    raw_date = _header(msg, "Date")
    if raw_date:
        try:
            parsed = parsedate_to_datetime(raw_date)
            date = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:  # noqa: BLE001
            date = None

    text_parts: list[str] = []
    html_parts: list[str] = []
    pdf_parts: list[str] = []
    images: list[dict] = []

    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        ctype = part.get_content_type()
        disposition = (part.get("Content-Disposition") or "").lower()
        filename = part.get_filename()
        is_attachment = "attachment" in disposition or bool(filename)

        if ctype == "application/pdf" or (filename or "").lower().endswith(".pdf"):
            try:
                reader = PdfReader(io.BytesIO(part.get_payload(decode=True) or b""))
                pages = [page.extract_text() or "" for page in reader.pages[:30]]
                pdf_text = "\n".join(p for p in pages if p.strip())
                if pdf_text.strip():
                    pdf_parts.append(f"[PDF 附件：{filename or '未命名'}\n{pdf_text.strip()}]")
            except Exception:  # noqa: BLE001
                pass
            continue

        if ctype.startswith("image/"):
            data = part.get_payload(decode=True) or b""
            if data:
                images.append({"filename": filename or "image", "data": data, "mime": ctype})
            continue

        if is_attachment:
            continue
        if ctype == "text/plain":
            text_parts.append(_decode_part(part))
        elif ctype == "text/html":
            html_parts.append(_html_to_text(_decode_part(part)))

    body = "\n\n".join(p.strip() for p in text_parts if p.strip())
    if not body:
        body = "\n\n".join(p.strip() for p in html_parts if p.strip())
    full_text = "\n\n".join([body, *pdf_parts]).strip()

    message_id = _header(msg, "Message-ID")
    if not message_id:
        try:
            raw = msg.as_bytes()
        except Exception:  # noqa: BLE001
            raw = f"{subject}{sender}{date}".encode("utf-8", "ignore")
        message_id = "sha256:" + hashlib.sha256(raw).hexdigest()

    return {
        "subject": subject[:500],
        "from": (sender or "")[:500] or None,
        "date": date,
        "message_id": message_id[:500],
        "text": full_text,
        "images": images,
    }


def parse_eml_bytes(raw: bytes, filename: str) -> list[dict]:
    if (filename or "").lower().endswith(".mbox") or raw.lstrip().startswith(b"From "):
        tmp = STORAGE_DIR / "mail" / f"import-{hashlib.sha1(raw).hexdigest()[:12]}.mbox"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_bytes(raw)
        import mailbox

        box = mailbox.mbox(str(tmp))
        out = [parse_message(m) for m in list(box)[:MAX_MBOX_MESSAGES]]
        tmp.unlink(missing_ok=True)
        return out
    return [parse_message(email.message_from_bytes(raw, policy=policy.default))]


# ---------------------------------------------------------------- 入库


def _store_raw(raw: bytes, message_id: str) -> str:
    folder = STORAGE_DIR / "mail"
    folder.mkdir(parents=True, exist_ok=True)
    name = hashlib.sha1(message_id.encode("utf-8", "ignore")).hexdigest()[:20] + ".eml"
    path = folder / name
    path.write_bytes(raw)
    return str(path.relative_to(STORAGE_DIR)).replace("\\", "/")


def _store_image(source_id: str, index: int, image: dict) -> str:
    ext = "png"
    mime = image.get("mime") or "image/png"
    if "jpeg" in mime or "jpg" in mime:
        ext = "jpg"
    elif "gif" in mime:
        ext = "gif"
    elif "webp" in mime:
        ext = "webp"
    rel = f"screenshots/mail-{source_id}-{index}.{ext}"
    path = MEDIA_DIR / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(image["data"])
    return rel


def import_parsed_message(db: Session, parsed: dict, *, raw: bytes | None = None) -> tuple[Source, Job] | None:
    message_id = parsed.get("message_id")
    if message_id:
        existing = db.scalar(
            select(Source).where(Source.kind == "mail", Source.message_id == message_id)
        )
        if existing:
            return None

    source = Source(
        kind="mail",
        title=parsed.get("subject"),
        org=parsed.get("from"),
        message_id=message_id,
        text=parsed.get("text") or "",
        published_at=parsed.get("date"),
        status="ready",
        meta={"from": parsed.get("from"), "subject": parsed.get("subject")},
    )
    db.add(source)
    db.flush()

    image_paths: list[str] = []
    for i, image in enumerate(parsed.get("images") or []):
        try:
            image_paths.append(_store_image(source.id, i, image))
        except Exception:  # noqa: BLE001
            continue
    if image_paths:
        source.image_path = image_paths[0]
        meta = dict(source.meta or {})
        meta["image_paths"] = image_paths
        source.meta = meta

    if raw is not None and message_id:
        source.raw_path = _store_raw(raw, message_id)
    elif message_id:
        source.raw_path = _store_raw((parsed.get("text") or "").encode("utf-8"), message_id)

    job = Job(
        type="parse",
        payload={
            "source_id": source.id,
            "has_image": bool(image_paths),
            "image_paths": image_paths,
            "mail": True,
        },
        state="queued",
        stage={
            "stage": "queued",
            "steps": [{"key": k, "label": l, "state": "todo"} for k, l in INGEST_STEPS],
            "message": "排队中…",
        },
    )
    db.add(job)
    db.commit()
    return source, job


# ---------------------------------------------------------------- IMAP


def _identify_client(client) -> None:
    """发送 RFC 2971 ID 声明客户端身份；服务器不支持 ID 时忽略。"""
    try:
        typ, data = client._simple_command("ID", IMAP_CLIENT_ID)
        client._untagged_response(typ, data, "ID")
    except imaplib.IMAP4.error:
        pass


def _login_readonly(mailbox, username: str, password: str):
    """登录后先发 ID 再选收件箱。

    imap_tools 的 login() 默认立刻 SELECT INBOX；网易要求 SELECT 前先 ID，
    因此这里以 initial_folder=None 登录，补齐 ID 后手动选收件箱。
    """
    mailbox.login(username, password, initial_folder=None)
    _identify_client(mailbox.client)
    mailbox.folder.set("INBOX")
    return mailbox


def _imap_test_sync(host: str, port: int, username: str, password: str) -> tuple[bool, str]:
    from imap_tools import MailBox

    try:
        with MailBox(host, port=port) as mailbox:
            _login_readonly(mailbox, username, password)
            folders = [f.name for f in mailbox.folder.list()]
            return True, f"连接成功，可见 {len(folders)} 个文件夹：{', '.join(folders[:8])}"
    except Exception as e:  # noqa: BLE001
        return False, f"连接失败：{str(e)[:200]}"


async def imap_test(host: str, port: int, username: str, password: str) -> tuple[bool, str]:
    return await asyncio.to_thread(_imap_test_sync, host, port, username, password)


def _imap_fetch_sync(
    host: str, port: int, username: str, password: str, since_days: int, query: str | None
) -> list[dict]:
    from imap_tools import AND, MailBox

    since = datetime.now(timezone.utc) - timedelta(days=max(1, since_days))
    out: list[dict] = []
    with MailBox(host, port=port) as mailbox:
        _login_readonly(mailbox, username, password)
        # mark_seen=False 即 BODY.PEEK，不改变邮件已读状态
        for msg in mailbox.fetch(AND(date_gte=since.date()), mark_seen=False, bulk=True):
            if query and query.strip() and query.strip().lower() not in (msg.subject or "").lower():
                continue
            try:
                parsed = parse_message(msg.obj)
            except Exception:  # noqa: BLE001
                continue
            try:
                parsed["raw"] = msg.obj.as_bytes()
            except Exception:  # noqa: BLE001
                parsed["raw"] = None
            out.append(parsed)
            if len(out) >= 20:
                break
    return out


async def imap_fetch_messages(
    host: str, port: int, username: str, password: str, since_days: int, query: str | None
) -> list[dict]:
    return await asyncio.to_thread(
        _imap_fetch_sync, host, port, username, password, since_days, query
    )


async def run_mail_sync(job_id: str) -> None:
    db: Session = SessionLocal()
    job = db.get(Job, job_id)
    if job is None:
        db.close()
        return
    cfg = load_imap_config()
    try:
        job.state = "running"
        job.stage = {
            "stage": "fetch",
            "steps": [
                {"key": "fetch", "label": "只读拉取邮件", "state": "active"},
                {"key": "extract", "label": "整理事项", "state": "todo"},
                {"key": "done", "label": "完成", "state": "todo"},
            ],
            "message": "正在只读拉取邮件…",
        }
        db.commit()

        messages = await imap_fetch_messages(
            cfg.get("host", ""),
            int(cfg.get("port", 993)),
            cfg.get("username", ""),
            cfg.get("password", ""),
            int(job.payload.get("since_days", 7)),
            job.payload.get("query"),
        )

        imported = 0
        skipped = 0
        parse_jobs: list[str] = []
        for parsed in messages:
            raw = parsed.pop("raw", None)
            result = import_parsed_message(db, parsed, raw=raw)
            if result is None:
                skipped += 1
                continue
            imported += 1
            parse_jobs.append(result[1].id)

        for i, parse_job_id in enumerate(parse_jobs):
            job.stage = {
                "stage": "extract",
                "steps": [
                    {"key": "fetch", "label": "只读拉取邮件", "state": "done"},
                    {"key": "extract", "label": f"整理事项（{i + 1}/{len(parse_jobs)}）", "state": "active"},
                    {"key": "done", "label": "完成", "state": "todo"},
                ],
                "message": "正在抽取邮件中的截止与材料…",
            }
            db.commit()
            await run_ingest(parse_job_id)

        job.result = {"imported": imported, "skipped": skipped, "fetched": len(messages)}
        job.state = "done"
        job.stage = {
            "stage": "done",
            "steps": [
                {"key": "fetch", "label": "只读拉取邮件", "state": "done"},
                {"key": "extract", "label": "整理事项", "state": "done"},
                {"key": "done", "label": "完成", "state": "done"},
            ],
            "message": f"导入 {imported} 封，跳过 {skipped} 封",
        }
        cfg.update({"verified": True, "last_sync_at": utcnow().isoformat(), "error": None})
        save_imap_config(cfg)
        db.commit()
    except Exception as e:  # noqa: BLE001
        db.rollback()
        job = db.get(Job, job_id)
        if job:
            job.state = "failed"
            job.last_error = str(e)[:800]
            job.stage = {
                "stage": "fetch",
                "steps": [
                    {"key": "fetch", "label": "只读拉取邮件", "state": "failed"},
                    {"key": "extract", "label": "整理事项", "state": "todo"},
                    {"key": "done", "label": "完成", "state": "todo"},
                ],
                "message": "同步失败",
            }
        cfg.update({"verified": False, "error": str(e)[:300]})
        save_imap_config(cfg)
        db.commit()
    finally:
        db.close()
