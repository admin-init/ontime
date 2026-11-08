"""官网同步：拉列表页 → 解析文章链接 → 抓正文 → 去重入库 → 走抽取流水线。

设计约束：
- 只抓同一域名下的文章页；选择器可选，缺省用「URL 像文章 + 标题像通知」的启发式。
- 单次同步最多处理 10 篇新文章；重复 URL 不再新建来源。
- 同一 URL 正文变化时，只把失配的旧 claim 标 stale 并生成 pending change，
  新正文照常重新抽取，旧值绝不静默覆盖。
"""

from __future__ import annotations

import hashlib
from urllib.parse import urljoin, urlparse

import httpx
import trafilatura
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import STORAGE_DIR, SessionLocal
from app.models import Change, Claim, Job, Source, SyncRun, WatchTarget, utcnow
from app.pipeline import QuoteIndex, normalize, run_ingest
from app.verify import UA, _decode_html

MAX_NEW_PER_RUN = 10
MAX_CHANGE_CHECKS = 30

CRAWL_STEPS = [
    ("list", "读取栏目列表"),
    ("fetch", "抓取文章正文"),
    ("extract", "整理事项"),
    ("done", "完成"),
]

# 标题里出现这些词，更像通知/活动/招聘，而不是导航
_TITLE_HINTS = (
    "通知", "公告", "讲座", "活动", "招聘", "宣讲", "报名", "评选", "比赛", "竞赛",
    "招生", "课程", "会议", "论坛", "学术", "毕业", "开放日", "申请", "奖学金",
    "news", "event", "notice", "seminar", "lecture", "career", "job", "vacancy",
)
_URL_HINTS = (
    "article", "news", "detail", "event-details", "notice", "announcement",
    "/info/", "/info.", "info.php", "info.aspx",
)
_NAV_HINTS = (
    "english", "关于", "了解", "学院", "部门", "研究", "招生", "培训", "校园",
    "就业指导办公室", "访问就业办", "下载", "首页", "登录",
)
# 这些路径是学校官网的栏目导航页，不是文章；即使标题里带「奖学金」也排除。
_NAV_PATH_HINTS = (
    "/study-with-us/", "/about/", "/business/", "/research", "/schools-departments/",
    "/university-life/", "/cele/", "/department-of-campus-life/", "/admissions/",
    "/how-to-apply", "/tuition", "/scholarships/", "/contact", "/information-disclosure/",
    "/information-for-business/",
)
_SKIP_EXT = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".rar", ".jpg", ".jpeg",
             ".png", ".gif", ".mp4", ".mp3")


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _host(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:  # noqa: BLE001
        return ""


def _same_site(a: str, b: str) -> bool:
    ha, hb = _host(a), _host(b)
    if not ha or not hb:
        return False
    return ha == hb or ha.endswith("." + hb) or hb.endswith("." + ha)


def _clean_url(url: str) -> str:
    """去掉锚点，保留查询参数（UNNC 的文章 id 在 query 里）。"""
    parsed = urlparse(url)
    return parsed._replace(fragment="").geturl()


def _looks_like_article(url: str, title: str, list_url: str) -> bool:
    if not url.startswith(("http://", "https://")):
        return False
    if not _same_site(url, list_url):
        return False
    path = urlparse(url)
    low_url = url.lower()
    low_path = path.path.lower()
    if low_url.endswith(_SKIP_EXT) or low_path.rstrip("/") == urlparse(list_url).path.rstrip("/"):
        return False
    if any(h in low_path for h in _NAV_PATH_HINTS):
        return False
    # 列表页本身（含英文版的同一栏目）不是文章
    if "listing" in low_path:
        return False
    text = (title or "").strip()
    low_title = text.lower()
    if len(text) < 4:
        return False

    # 文章 URL 特征优先；其他站点没有这些词时，退到「标题像通知 + 不是导航语气」。
    if any(h in low_url for h in _URL_HINTS):
        return True
    if any(h in low_title for h in _NAV_HINTS):
        return False
    return len(text) >= 8 and any(h in low_title for h in _TITLE_HINTS)


def _extract_links(
    list_url: str, html: str, selector: str | None, title_selector: str | None = None
) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    links: dict[str, dict] = {}

    if selector:
        nodes = soup.select(selector)
    else:
        nodes = soup.find_all("a", href=True)

    for node in nodes:
        title = ""
        anchor = None
        if title_selector:
            title_node = node.select_one(title_selector)
            if title_node is not None:
                title = title_node.get_text(" ", strip=True)
                anchor = (
                    title_node
                    if title_node.name == "a"
                    else title_node.find("a", href=True)
                )
        if anchor is None or not anchor.get("href"):
            anchor = node if node.name == "a" else node.find("a", href=True)
        if not anchor or not anchor.get("href"):
            continue
        raw = anchor["href"].strip()
        if raw.startswith(("mailto:", "javascript:", "#", "tel:")):
            continue
        url = _clean_url(urljoin(list_url, raw))
        if not title:
            title = anchor.get_text(" ", strip=True)
        if not selector and not _looks_like_article(url, title, list_url):
            continue
        if selector and not url.startswith(("http://", "https://")):
            continue
        if url in links:
            continue
        links[url] = {"url": url, "title": title[:300]}
        if len(links) >= 60:
            break
    return list(links.values())


async def fetch_list_page(
    url: str, selector: str | None = None, title_selector: str | None = None
) -> dict:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        r = await client.get(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})
        r.raise_for_status()
    html = _decode_html(r.content, r.charset_encoding)
    soup = BeautifulSoup(html, "lxml")
    title = soup.title.get_text(strip=True) if soup.title else url
    return {
        "url": url,
        "title": title,
        "links": _extract_links(url, html, selector, title_selector),
    }


def _save_raw(name: str, raw: bytes) -> str:
    folder = STORAGE_DIR / "web"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_bytes(raw)
    return str(path.relative_to(STORAGE_DIR)).replace("\\", "/")


async def fetch_article(url: str, content_selector: str | None = None) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})
        if r.status_code != 200:
            return None
        html = _decode_html(r.content, r.charset_encoding)
        soup = BeautifulSoup(html, "lxml")
        text = ""
        if content_selector:
            node = soup.select_one(content_selector)
            if node is not None:
                text = node.get_text("\n", strip=True)
        if len(text) < 120:
            text = trafilatura.extract(html, include_comments=False, include_tables=True) or ""
        if len(text) < 120:
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            text = soup.get_text("\n", strip=True)
        title = soup.title.get_text(strip=True) if soup.title else ""
        text = normalize(text)[:60000]
        if len(text) < 80:
            return None
        raw_name = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16] + ".html"
        return {
            "url": url,
            "title": title,
            "text": text,
            "raw_path": _save_raw(raw_name, r.content),
        }
    except Exception:  # noqa: BLE001
        return None


def _set_stage(job: Job | None, key: str, message: str | None = None, *, failed: bool = False) -> None:
    if job is None:
        return
    keys = [k for k, _ in CRAWL_STEPS]
    cur = keys.index(key) if key in keys else len(keys) - 1
    steps = []
    for i, (k, label) in enumerate(CRAWL_STEPS):
        state = "done" if i < cur else ("active" if i == cur else "todo")
        if failed and i == cur:
            state = "failed"
        steps.append({"key": k, "label": label, "state": state})
    job.stage = {"stage": key, "steps": steps, "message": message}


def _new_parse_job(db: Session, source: Source) -> Job:
    job = Job(
        type="parse",
        payload={"source_id": source.id, "has_image": False},
        state="queued",
    )
    db.add(job)
    db.commit()
    return job


def mark_source_changed(db: Session, source: Source, page: dict) -> int:
    """正文变化时：失配 claim → stale，并为每条生成 pending change。返回变更条数。"""
    new_text = page["text"]
    idx = QuoteIndex(new_text)
    claims = db.scalars(select(Claim).where(Claim.source_id == source.id)).all()
    changed = 0
    for claim in claims:
        if claim.status in ("stale", "rejected") or not claim.quote:
            continue
        if idx.find(claim.quote):
            continue
        claim.status = "stale"
        existing = db.scalar(
            select(Change).where(
                Change.claim_id == claim.id,
                Change.state == "pending",
            )
        )
        if existing is None:
            db.add(
                Change(
                    entity_type=claim.entity_type,
                    entity_id=claim.entity_id,
                    field=claim.field,
                    old_value=claim.value,
                    new_value=None,
                    claim_id=claim.id,
                    reason="来源正文已更新，原句不再出现；旧依据已失效，等待确认",
                    state="pending",
                )
            )
        changed += 1

    source.text = new_text
    source.title = (page.get("title") or source.title or "")[:500]
    source.raw_path = page.get("raw_path") or source.raw_path
    source.raw_hash = _hash(new_text)
    source.fetched_at = utcnow()
    source.status = "ready"
    meta = dict(source.meta or {})
    meta["content_hash"] = source.raw_hash
    meta["changed_at"] = utcnow().isoformat()
    source.meta = meta
    db.commit()
    return changed


async def _sync(db: Session, target: WatchTarget, run: SyncRun, job: Job | None) -> None:
    _set_stage(job, "list", "正在读取栏目列表…")
    db.commit()
    listing = await fetch_list_page(target.url or "", target.selector)
    links = listing["links"]
    run.found = len(links)

    existing_urls = {
        u
        for u in db.scalars(select(Source.url).where(Source.kind == "web")).all()
        if u
    }
    new_links = [item for item in links if item["url"] not in existing_urls][:MAX_NEW_PER_RUN]
    existing_links = [item for item in links if item["url"] in existing_urls][:MAX_CHANGE_CHECKS]

    errors: list[str] = []
    _set_stage(job, "fetch", f"列表中找到 {len(links)} 篇文章，准备抓取 {len(new_links)} 篇新文章…")
    db.commit()

    for item in new_links:
        page = await fetch_article(item["url"])
        if page is None:
            errors.append(f"抓取失败：{item['url']}")
            continue
        title = (page["title"] or item["title"] or item["url"])[:500]
        source = Source(
            kind="web",
            title=title,
            url=page["url"],
            org=_host(page["url"]),
            text=page["text"],
            raw_path=page.get("raw_path"),
            raw_hash=_hash(page["text"]),
            fetched_at=utcnow(),
            status="ready",
            watch_target_id=target.id,
            meta={
                "content_hash": _hash(page["text"]),
                "from_target": target.id,
                "list_title": item["title"],
            },
        )
        db.add(source)
        db.commit()
        run.created += 1

        parse_job = _new_parse_job(db, source)
        _set_stage(job, "extract", f"正在抽取：{title[:40]}…")
        db.commit()
        await run_ingest(parse_job.id)
        db.refresh(parse_job)
        if parse_job.state == "failed":
            errors.append(f"抽取失败：{title[:50]}（{parse_job.last_error or '未知错误'}）")

    for item in existing_links:
        source = db.scalar(
            select(Source).where(Source.kind == "web", Source.url == item["url"])
        )
        if source is None:
            continue
        # 上次抽取失败（例如模型空响应）：本次同步重试一次，仍失败则如实记录。
        meta = source.meta or {}
        needs_retry = source.status == "failed" or (
            source.status == "ready" and not meta.get("doc_type")
        )
        if needs_retry:
            retry_job = _new_parse_job(db, source)
            _set_stage(job, "extract", f"重试上次失败的抽取：{(source.title or '')[:40]}…")
            db.commit()
            await run_ingest(retry_job.id)
            db.refresh(retry_job)
            if retry_job.state == "failed":
                errors.append(
                    f"抽取失败：{(source.title or item['url'])[:50]}"
                    f"（{retry_job.last_error or '未知错误'}）"
                )
            continue
        page = await fetch_article(item["url"])
        if page is None:
            continue
        new_hash = _hash(page["text"])
        old_hash = source.raw_hash or _hash(source.text or "")
        if new_hash == old_hash:
            continue
        changed = mark_source_changed(db, source, page)
        if changed:
            run.changed += changed
            # 新正文继续走抽取，旧 claim 已 stale，不静默覆盖。
            parse_job = _new_parse_job(db, source)
            _set_stage(job, "extract", f"正文已变化，重新抽取：{(source.title or '')[:40]}…")
            db.commit()
            await run_ingest(parse_job.id)
            db.refresh(parse_job)
            if parse_job.state == "failed":
                errors.append(
                    f"变更后抽取失败：{(source.title or '')[:50]}"
                    f"（{parse_job.last_error or '未知错误'}）"
                )

    if errors:
        run.error = "；".join(errors)[:1500]
        run.status = "partial" if (run.created or run.changed) else "failed"
        target.last_status = run.status
        target.last_error = run.error
    else:
        run.status = "ok"
        target.last_status = "ok"
        target.last_error = None
    _set_stage(job, "done", f"完成：新文章 {run.created} 篇，变更 {run.changed} 处")


async def run_crawl(job_id: str) -> None:
    db: Session = SessionLocal()
    job = db.get(Job, job_id)
    if job is None:
        db.close()
        return
    target: WatchTarget | None = None
    run: SyncRun | None = None
    try:
        job.state = "running"
        _set_stage(job, "list", "开始同步官网栏目…")
        db.commit()
        target = db.get(WatchTarget, job.payload.get("target_id"))
        if target is None:
            raise RuntimeError("同步目标不存在")
        target.last_run_at = utcnow()
        run = SyncRun(target_id=target.id, started_at=utcnow(), status="running")
        db.add(run)
        db.commit()

        await _sync(db, target, run, job)

        job.result = {
            "sync_run_id": run.id,
            "found": run.found,
            "created": run.created,
            "changed": run.changed,
            "status": run.status,
        }
        job.state = "done"
        db.commit()
    except Exception as e:  # noqa: BLE001
        db.rollback()
        job = db.get(Job, job_id)
        if job:
            job.state = "failed"
            job.last_error = str(e)[:800]
            _set_stage(job, (job.stage or {}).get("stage", "list"), "同步失败", failed=True)
        if target is None:
            target = db.get(WatchTarget, job.payload.get("target_id")) if job else None
        if target is not None:
            target.last_status = "failed"
            target.last_error = str(e)[:800]
            target.last_run_at = utcnow()
        if run is None:
            run = SyncRun(target_id=target.id if target else "", started_at=utcnow())
            db.add(run)
        run.status = "failed"
        run.error = str(e)[:1500]
        run.finished_at = utcnow()
        db.commit()
    finally:
        if run is not None:
            if run.status == "running":
                run.status = "ok"
            if run.finished_at is None:
                run.finished_at = utcnow()
        db.commit()
        db.close()


def create_crawl_job(db: Session, target: WatchTarget) -> Job:
    job = Job(type="crawl", payload={"target_id": target.id}, state="queued")
    db.add(job)
    db.commit()
    return job


async def scheduled_sync(target_id: str) -> None:
    """调度器入口：为到点的栏目建一条 crawl job 并执行。"""
    db: Session = SessionLocal()
    try:
        target = db.get(WatchTarget, target_id)
        if target is None or not target.enabled or not target.url:
            return
        job = create_crawl_job(db, target)
    finally:
        db.close()
    await run_crawl(job.id)
