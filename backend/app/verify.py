"""联网核实：真实搜索 → 抓原文 → 逐字段判断适用性 → 带出处返回。

原则：
- 只有「原文片段能校验通过 + 判定适用」才给 supported。
- 高影响条款（扣分/取消资格/逾期后果）只有来自本校官方域名才算数，其余一律待确认。
- 搜不到就明说没找到，不用相似内容凑结论。
"""

from __future__ import annotations

import asyncio
import base64
import re
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import httpx
import trafilatura
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import llm
from app.claims import TASK_LABELS, EVENT_LABELS, dt_parts, fmt_value, parse_dt
from app.core import settings
from app.models import Event, Job, Source
from app.pipeline import QuoteIndex, normalize
from app.schemas import Finding, JudgeResult

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)

JUDGE_SYSTEM = """你在核对一条校园通知的官方依据。只输出 JSON。

你会看到：用户已记录的事件信息，以及一个候选网页的正文。
请判断这个网页是否就是该事件的官方通知或明确适用的规定，并抽取能补充/纠正用户信息的字段。

规则：
1. 只抽取网页正文中逐字出现的片段作为 quote，不改写、不省略。
2. 网页与事件不是同一件事（不同届次、不同学院、不同年份、只是相关新闻）时，applies 填 "no"。
3. 无法确定是否适用时填 "unknown"，不要猜。
4. findings 只放网页里明确写出的内容；field 取值只能是：
   start_at, end_at, location, audience, due_at, materials, submit_channel, rule
5. 涉及扣分、取消资格、处分、费用、逾期后果的，impact 填 "high"，并原样引用条款。
6. 不要根据往年通知或别的学院的规定推断。

输出：
{"applies":"yes|no|unknown","reason":"一句话","findings":[{"field":"due_at","value":"2026-11-10T23:59:00+08:00 或文本","quote":"原文片段","impact":"normal"}],"high_impact_note":null}"""


def _unwrap_bing(href: str) -> str:
    """Bing 搜索结果常给 bing.com/ck/a?...&u=a1<base64url> 的跳转链接，还原成真实地址。"""
    parsed = urlparse(href)
    if not parsed.netloc.endswith("bing.com") or not parsed.path.startswith("/ck/a"):
        return href
    u = parse_qs(parsed.query).get("u", [""])[0]
    if u.startswith("a1"):
        u = u[2:]
    try:
        real = base64.urlsafe_b64decode(u + "=" * (-len(u) % 4)).decode("utf-8")
    except Exception:  # noqa: BLE001
        return href
    return real if real.startswith("http") else href


_HEADERS = {"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"}
_JS_REDIRECT = re.compile(r"""location\.replace\(\s*["']([^"']+)["']""")
_META_REDIRECT = re.compile(r"""URL=['"]?([^'">\s]+)""", re.IGNORECASE)
_ENGINE_HOSTS = ("so.com", "bing.com", "baidu.com")


async def _resolve_so_link(client: httpx.AsyncClient, href: str) -> str | None:
    """360 的 /link?m=... 是一个 JS 跳转页，取出里面写的真实地址。"""
    if "so.com/link" not in href:
        return href if href.startswith("http") else None
    try:
        r = await client.get(href)
    except Exception:  # noqa: BLE001
        return None
    if r.status_code != 200:
        return None
    html = r.text.replace("\\/", "/")
    m = _JS_REDIRECT.search(html) or _META_REDIRECT.search(html)
    if m:
        url = m.group(1)
        return url if url.startswith("http") else None
    final = str(r.url)
    return final if "so.com" not in urlparse(final).netloc else None


def _is_content_url(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    return bool(host) and not any(host == h or host.endswith("." + h) for h in _ENGINE_HOSTS)


async def _search_360(query: str, limit: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=25, follow_redirects=True, headers=_HEADERS) as client:
        r = await client.get("https://www.so.com/s", params={"q": query})
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "lxml")
        out: list[dict] = []
        seen: set[str] = set()
        for li in soup.select("li.res-list"):
            a = li.select_one("h3 a")
            if not a or not a.get("href"):
                continue
            url = await _resolve_so_link(client, a["href"])
            if not url or url in seen or not _is_content_url(url):
                continue
            seen.add(url)
            snippet = li.select_one("div.res-rich") or li.select_one("p")
            out.append(
                {
                    "title": a.get_text(" ", strip=True),
                    "url": url,
                    "snippet": snippet.get_text(" ", strip=True) if snippet else "",
                }
            )
            if len(out) >= limit:
                break
        return out


async def _search_bing(query: str, limit: int) -> list[dict]:
    params = {"q": query, "setlang": "zh-CN", "ensearch": "0"}
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            r = await client.get(
                "https://cn.bing.com/search", params=params, headers=_HEADERS
            )
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "lxml")
        out: list[dict] = []
        seen: set[str] = set()
        for li in soup.select("li.b_algo"):
            a = li.select_one("h2 a")
            if not a or not a.get("href"):
                continue
            href = _unwrap_bing(a["href"])
            if not href.startswith("http") or not _is_content_url(href):
                continue
            if href in seen:
                continue
            seen.add(href)
            snippet = li.select_one(".b_caption p") or li.select_one("p")
            out.append(
                {
                    "title": a.get_text(" ", strip=True),
                    "url": href,
                    "snippet": snippet.get_text(" ", strip=True) if snippet else "",
                }
            )
            if len(out) >= limit:
                break
        return out
    except Exception:  # noqa: BLE001
        return []


async def search_web(query: str, limit: int = 5) -> list[dict]:
    """网页检索：360 主用，Bing 兜底。都失败返回空列表，由调用方如实报告。

    返回的 url 一定是真实目标地址（不是搜索引擎的跳转链接）。
    """
    try:
        hits = await _search_360(query, limit)
        if hits:
            return hits
    except Exception:  # noqa: BLE001
        pass
    try:
        return await _search_bing(query, limit)
    except Exception:  # noqa: BLE001
        return []


def _decode_html(raw: bytes, declared: str | None) -> str:
    """按响应头 → meta charset → utf-8 → gb18030 的顺序解码，避免中文站点乱码。"""
    encoding = (declared or "").strip().lower()
    if not encoding:
        m = re.search(rb"""charset=["']?([\w-]+)""", raw[:4096], re.IGNORECASE)
        encoding = m.group(1).decode("ascii", "ignore").lower() if m else ""
    candidates = [encoding] if encoding else []
    for alt in ("utf-8", "gb18030"):
        if alt not in candidates:
            candidates.append(alt)
    best = ""
    best_bad = None
    for enc in candidates:
        try:
            text = raw.decode(enc, errors="replace")
        except LookupError:
            continue
        bad = text.count("\ufffd")
        if best_bad is None or bad < best_bad:
            best, best_bad = text, bad
        if bad == 0:
            break
    return best


async def fetch_page(url: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": UA})
        if r.status_code != 200:
            return None
        html = _decode_html(r.content, r.charset_encoding)
        text = trafilatura.extract(html, include_comments=False, include_tables=True) or ""
        if len(text) < 120:
            soup = BeautifulSoup(html, "lxml")
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            text = soup.get_text("\n", strip=True)
        title = ""
        soup = BeautifulSoup(html, "lxml")
        if soup.title:
            title = soup.title.get_text(strip=True)
        return {"url": url, "title": title, "text": normalize(text)[:60000]}
    except Exception:  # noqa: BLE001
        return None


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:  # noqa: BLE001
        return ""


def _is_official(url: str) -> bool:
    d = _domain(url)
    return d.endswith(settings.school_domain) or d.endswith("edu.cn")


def get_or_create_source(db: Session, page: dict) -> Source:
    existing = db.scalar(select(Source).where(Source.url == page["url"]))
    if existing:
        return existing
    src = Source(
        kind="web",
        title=page["title"][:500],
        url=page["url"],
        text=page["text"],
        org=_domain(page["url"]),
        status="parsed",
        meta={"title_from_search": page.get("search_title", "")},
    )
    db.add(src)
    db.flush()
    return src


CURRENT_LABEL = {**EVENT_LABELS, **TASK_LABELS}


def _current(db: Session, event: Event) -> dict[str, str]:
    from app.claims import resolve_field

    out = {}
    for field in ("start_at", "end_at", "location", "audience"):
        res = resolve_field(db, "event", event.id, field)
        if res["value"] is not None:
            out[field] = fmt_value(field, res["value"])
    for task in event.tasks:
        for field in ("due_at", "materials", "submit_channel"):
            res = resolve_field(db, "task", task.id, field)
            if res["value"] is not None:
                out[f"{task.action}.{field}"] = fmt_value(field, res["value"])
    return out


async def judge_page(event: Event, page: dict, current: dict[str, str]) -> JudgeResult:
    user = (
        f"事件：{event.title}\n"
        f"组织方：{event.org or '未知'}\n"
        f"当前已记录：{current}\n\n"
        f"候选网页标题：{page['title']}\n"
        f"候选网页地址：{page['url']}\n"
        f"候选网页正文（截断）：\n{page['text'][:8000]}"
    )
    try:
        data = await llm.complete_json(
            [{"role": "system", "content": JUDGE_SYSTEM}, {"role": "user", "content": user}]
        )
        return JudgeResult(**data)
    except Exception as e:  # noqa: BLE001
        return JudgeResult(applies="unknown", reason=f"判断失败：{str(e)[:120]}")


FIELD_LABELS = {**EVENT_LABELS, **TASK_LABELS}


async def verify_event(db: Session, event: Event, job: Job) -> dict:
    queries = [
        f"{settings.school_name} {settings.college_name} {event.title}",
        f"{settings.school_name} {event.title} 通知",
        f"{event.title} site:{settings.school_domain}",
    ]
    seen: set[str] = set()
    hits: list[dict] = []
    for q in queries:
        for hit in await search_web(q, limit=5):
            if hit["url"] in seen:
                continue
            seen.add(hit["url"])
            hits.append(hit)
        if len(hits) >= 5:
            break

    job.stage = {
        "stage": "fetch",
        "steps": [
            {"key": "search", "label": "检索官方来源", "state": "done"},
            {"key": "fetch", "label": "读取原文", "state": "active"},
            {"key": "judge", "label": "核对适用性", "state": "todo"},
        ],
        "message": f"找到 {len(hits)} 条候选，正在读取原文…",
    }
    db.commit()

    pages = await asyncio.gather(*[fetch_page(h["url"]) for h in hits[:4]])
    pages = [p for p in pages if p and len(p["text"]) > 100]

    job.stage = {
        "stage": "judge",
        "steps": [
            {"key": "search", "label": "检索官方来源", "state": "done"},
            {"key": "fetch", "label": "读取原文", "state": "done"},
            {"key": "judge", "label": "核对适用性", "state": "active"},
        ],
        "message": f"正在核对 {len(pages)} 篇原文…",
    }
    db.commit()

    current = _current(db, event)
    findings: list[dict] = []
    sources_out: list[dict] = []

    for page in pages:
        src = get_or_create_source(db, page)
        sources_out.append(
            {
                "id": src.id,
                "title": src.title or page["url"],
                "url": src.url,
                "domain": _domain(src.url or ""),
                "official": _is_official(src.url or ""),
                "chars": len(src.text),
            }
        )
        verdict = await judge_page(event, page, current)
        idx = QuoteIndex(src.text)
        for f in verdict.findings:
            span = idx.find(f.quote)
            if not span:
                continue
            value = f.value
            if f.field in ("start_at", "end_at", "due_at"):
                dt = parse_dt(f.value)
                value = {"iso": dt.isoformat(), "precision": "datetime"} if dt else f.value
            state = "supported"
            label = FIELD_LABELS.get(f.field, f.field)
            note = verdict.reason
            if verdict.applies == "no":
                continue
            if verdict.applies == "unknown":
                state = "needs_review"
            if f.impact == "high" and not _is_official(src.url or ""):
                state = "needs_review"
                note = "来源不是本校官方页面，不能据此确认"
                label = f"{label}（高影响）"
            display_new = fmt_value(f.field, value)
            if state == "supported" and display_new:
                for cur_label, cur_val in current.items():
                    if cur_label.endswith(FIELD_LABELS.get(f.field, f.field)) and cur_val != display_new:
                        state = "conflict"
                        note = f"与当前记录不一致：{cur_val}"
                        break
            findings.append(
                {
                    "id": f"{src.id}-{f.field}-{len(findings)}",
                    "field": f.field,
                    "label": label,
                    "value": value,
                    "display": fmt_value(f.field, value),
                    "quote": f.quote,
                    "source_id": src.id,
                    "source_title": src.title,
                    "source_url": src.url,
                    "official": _is_official(src.url or ""),
                    "state": state,
                    "impact": f.impact,
                    "note": note,
                }
            )
        db.commit()

    if findings:
        states = {f["state"] for f in findings}
        overall = "conflict" if "conflict" in states else "found"
    else:
        overall = "not_found"

    message = {
        "found": "找到官方原文，可作为补充依据。",
        "conflict": "找到与当前记录不一致的官方原文，请确认。",
        "not_found": "未找到明确适用的官方依据。建议确认活动主办方或咨询负责部门。",
    }[overall]

    return {
        "status": overall,
        "message": message,
        "query": queries,
        "sources": sources_out,
        "findings": findings,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
