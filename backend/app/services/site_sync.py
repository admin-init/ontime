"""站点同步：web 用调研出的 profile 抓列表，api 拉用户提供的 JSON 源。

约束：
- api_key 只写 ~/.ontime/sites.json，不入库、不回显。
- 网址选择器来自站点 profile；没有 profile 时沿用 crawl.py 的标题/URL 启发式。
- 已存在的 URL 不再新建 Source，保证重复同步不重复收录。
- 所有抽取仍走 pipeline.run_ingest() / claims 写入口。
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import SessionLocal
from app.crawl import MAX_NEW_PER_RUN, fetch_article, fetch_list_page
from app.models import Job, Site, Source, utcnow
from app.pipeline import run_ingest
from app.verify import UA

SITE_SYNC_STEPS = [
    ("list", "读取站点列表"),
    ("fetch", "抓取正文"),
    ("extract", "整理事项"),
    ("done", "完成"),
]


def _keys_file() -> Path:
    return Path.home() / ".ontime" / "sites.json"


def load_site_keys() -> dict[str, str]:
    path = _keys_file()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k): str(v) for k, v in data.items() if isinstance(v, str) and v}


def save_site_key(site_id: str, api_key: str | None) -> None:
    path = _keys_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = load_site_keys()
    if api_key:
        data[site_id] = api_key.strip()
    else:
        data.pop(site_id, None)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_site_key(site_id: str) -> str | None:
    return load_site_keys().get(site_id)


def _host(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:  # noqa: BLE001
        return ""


def _set_stage(
    job: Job | None, key: str, message: str | None = None, *, failed: bool = False
) -> None:
    if job is None:
        return
    keys = [k for k, _ in SITE_SYNC_STEPS]
    cur = keys.index(key) if key in keys else len(keys) - 1
    steps = []
    for i, (k, label) in enumerate(SITE_SYNC_STEPS):
        state = "done" if i < cur else ("active" if i == cur else "todo")
        if failed and i == cur:
            state = "failed"
        steps.append({"key": k, "label": label, "state": state})
    job.stage = {"stage": key, "steps": steps, "message": message}


def _new_parse_job(db: Session, source: Source) -> Job:
    job = Job(type="parse", payload={"source_id": source.id, "has_image": False}, state="queued")
    db.add(job)
    db.commit()
    return job


def _existing_web_urls(db: Session) -> set[str]:
    return {
        url
        for url in db.scalars(select(Source.url).where(Source.kind == "web")).all()
        if url
    }


async def _extract_source(db: Session, source: Source) -> str | None:
    """把新来源送进现有抽取流水线；返回错误文案（成功返回 None）。"""
    parse_job = _new_parse_job(db, source)
    await run_ingest(parse_job.id)
    db.refresh(parse_job)
    if parse_job.state == "failed":
        return parse_job.last_error or "未知错误"
    return None


async def _sync_web(db: Session, site: Site, job: Job | None) -> dict[str, Any]:
    _set_stage(job, "list", "正在读取站点列表…")
    db.commit()
    listing = await fetch_list_page(site.list_url or "", site.item_selector, site.title_selector)
    links = listing["links"]
    found = len(links)

    existing = _existing_web_urls(db)
    new_links = [item for item in links if item["url"] not in existing][:MAX_NEW_PER_RUN]
    _set_stage(job, "fetch", f"列表中找到 {found} 条，准备抓取 {len(new_links)} 篇新文章…")
    # 列表页真实抓取成功即认为站点 profile 已验证
    site.verified = True
    db.commit()

    errors: list[str] = []
    created = 0
    for item in new_links:
        page = await fetch_article(item["url"], site.content_selector)
        if page is None:
            errors.append(f"抓取失败：{item['url']}")
            continue
        title = (page["title"] or item["title"] or item["url"])[:500]
        content_hash = hashlib.sha256(page["text"].encode("utf-8")).hexdigest()
        source = Source(
            kind="web",
            title=title,
            url=page["url"],
            org=_host(page["url"]),
            text=page["text"],
            raw_path=page.get("raw_path"),
            raw_hash=content_hash,
            fetched_at=utcnow(),
            status="ready",
            meta={
                "origin": "site",
                "site_id": site.id,
                "list_title": item.get("title"),
                "list_url": site.list_url,
                "content_hash": content_hash,
            },
        )
        db.add(source)
        db.commit()
        created += 1
        _set_stage(job, "extract", f"正在抽取：{title[:40]}…")
        db.commit()
        error = await _extract_source(db, source)
        if error:
            errors.append(f"抽取失败：{title[:50]}（{error[:120]}）")

    status = "failed" if errors and not created else ("partial" if errors else "ok")
    _set_stage(
        job,
        "done",
        f"完成：新文章 {created} 篇" + (f"，{len(errors)} 个失败" if errors else ""),
    )
    return {
        "site_id": site.id,
        "kind": "web",
        "found": found,
        "created": created,
        "status": status,
        "error": "；".join(errors)[:1500] or None,
    }


def _api_entries(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict):
        items = data.get("items")
    elif isinstance(data, list):
        items = data
    else:
        items = None
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


async def _sync_api(db: Session, site: Site, job: Job | None) -> dict[str, Any]:
    _set_stage(job, "list", "正在请求第三方 JSON 接口…")
    db.commit()
    api_key = get_site_key(site.id)
    headers = {"Accept": "application/json", "User-Agent": UA}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        r = await client.get(site.api_url or "", headers=headers)
        r.raise_for_status()
    entries = _api_entries(r.json())
    found = len(entries)

    existing = _existing_web_urls(db)
    created = 0
    skipped = 0
    errors: list[str] = []
    for entry in entries[:MAX_NEW_PER_RUN]:
        title = str(entry.get("title") or "").strip()
        url = str(entry.get("url") or "").strip()
        summary = str(entry.get("summary") or "").strip()
        if not title or not url.startswith(("http://", "https://")):
            skipped += 1
            continue
        if url in existing:
            continue
        text = summary if len(summary) >= 80 else f"{title}\n\n{summary}".strip()
        source = Source(
            kind="web",
            title=title[:500],
            url=url,
            org=_host(url),
            text=text,
            fetched_at=utcnow(),
            status="ready",
            meta={"origin": "api", "site_id": site.id, "api_url": site.api_url},
        )
        db.add(source)
        db.commit()
        existing.add(url)
        created += 1
        _set_stage(job, "extract", f"正在抽取：{title[:40]}…")
        db.commit()
        error = await _extract_source(db, source)
        if error:
            errors.append(f"抽取失败：{title[:50]}（{error[:120]}）")

    # 没有真实 Key 的 API 源不算已验证（演示 mock 也一样）
    site.verified = bool(api_key)
    status = "failed" if errors and not created else ("partial" if errors else "ok")
    _set_stage(
        job,
        "done",
        f"完成：接口返回 {found} 条，新写入 {created} 条"
        + (f"，跳过 {skipped} 条" if skipped else ""),
    )
    return {
        "site_id": site.id,
        "kind": "api",
        "found": found,
        "created": created,
        "skipped": skipped,
        "status": status,
        "verified": bool(api_key),
        "error": "；".join(errors)[:1500] or None,
    }


async def run_site_sync(job_id: str) -> None:
    db = SessionLocal()
    job = db.get(Job, job_id)
    if job is None:
        db.close()
        return
    try:
        job.state = "running"
        _set_stage(job, "list", "开始同步站点…")
        db.commit()
        site = db.get(Site, (job.payload or {}).get("site_id"))
        if site is None:
            raise RuntimeError("站点不存在")
        if site.kind == "api":
            result = await _sync_api(db, site, job)
        else:
            result = await _sync_web(db, site, job)
        job.result = result
        job.state = "done"
        job.last_error = result.get("error")
        db.commit()
    except Exception as e:  # noqa: BLE001
        db.rollback()
        job = db.get(Job, job_id)
        if job is not None:
            job.state = "failed"
            job.last_error = str(e)[:800]
            job.result = {"site_id": (job.payload or {}).get("site_id"), "status": "failed"}
            _set_stage(job, (job.stage or {}).get("stage", "list"), "同步失败", failed=True)
            db.commit()
    finally:
        db.close()


def create_site_sync_job(db: Session, site: Site) -> Job:
    job = Job(
        type="site_sync",
        payload={"site_id": site.id},
        state="queued",
        stage={
            "stage": "queued",
            "steps": [{"key": k, "label": label, "state": "todo"} for k, label in SITE_SYNC_STEPS],
            "message": "排队中…",
        },
    )
    db.add(job)
    db.commit()
    return job
