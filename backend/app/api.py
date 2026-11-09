from __future__ import annotations

import asyncio
import io
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import llm
from app.claims import (
    EVENT_LABELS,
    TASK_LABELS,
    add_claim,
    claim_view,
    dt_parts,
    field_claims,
    fmt_value,
    parse_dt,
    refresh_event,
    refresh_task,
    resolve_field,
    same_value_detail,
)
from app.core import MEDIA_DIR, get_db, settings
from app.models import (
    Change,
    Claim,
    Event,
    Job,
    MergeCandidate,
    PipelineRun,
    Profile,
    Reminder,
    Rule,
    Site,
    Source,
    SyncRun,
    Task,
    WatchTarget,
)
from app.pipeline import INGEST_STEPS, run_ingest, run_verify

router = APIRouter(prefix="/api")

EVENT_LABEL_FIELDS = [
    ("title", "事件"),
    ("start_at", "活动时间"),
    ("end_at", "结束时间"),
    ("location", "地点"),
    ("audience", "适用对象"),
    ("org", "组织方"),
]


# ---------------------------------------------------------------- 序列化


def _all_sources(db: Session) -> dict[str, Source]:
    return {s.id: s for s in db.scalars(select(Source)).all()}


def _watch_target_payload(db: Session, target: WatchTarget) -> dict:
    source_count = db.scalar(
        select(func.count()).select_from(Source).where(Source.watch_target_id == target.id)
    ) or 0
    return {
        "id": target.id,
        "name": target.name,
        "url": target.url,
        "selector": target.selector,
        "cron": target.cron,
        "enabled": bool(target.enabled),
        "last_run_at": target.last_run_at.isoformat() if target.last_run_at else None,
        "last_error": target.last_error,
        "last_status": target.last_status or "never",
        "source_count": int(source_count),
    }


def _sync_run_payload(run: SyncRun) -> dict:
    return {
        "id": run.id,
        "target_id": run.target_id,
        "started_at": run.started_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "status": run.status,
        "found": run.found,
        "created": run.created,
        "changed": run.changed,
        "error": run.error,
    }


def _site_payload(site: Site) -> dict:
    return {
        "id": site.id,
        "name": site.name,
        "domain": site.domain,
        "kind": site.kind or "web",
        "list_url": site.list_url,
        "search_url": site.search_url,
        "api_url": site.api_url,
        "item_selector": site.item_selector,
        "title_selector": site.title_selector,
        "content_selector": site.content_selector,
        "profile_source": site.profile_source,
        "verified": bool(site.verified),
        "enabled": bool(site.enabled),
        "created_at": site.created_at.isoformat(),
    }


def _reminder_payload(db: Session, reminder: Reminder) -> dict:
    task = db.get(Task, reminder.task_id) if reminder.task_id else None
    event_id = reminder.event_id or (task.event_id if task else None)
    event = db.get(Event, event_id) if event_id else None
    title = task.action if task else (event.title if event else "提醒")
    return {
        "id": reminder.id,
        "task_id": reminder.task_id,
        "event_id": event_id,
        "title": title,
        "fire_at": reminder.fire_at.isoformat(),
        "state": reminder.state,
    }


def _field_payload(db: Session, entity_type: str, entity_id: str, field: str, label: str, source_map=None) -> dict:
    source_map = source_map or _all_sources(db)
    res = resolve_field(db, entity_type, entity_id, field)
    claims = [
        claim_view(c, source_map)
        for c in field_claims(db, entity_type, entity_id, field)
        if c.status != "rejected"
    ]
    precision = None
    if field in ("start_at", "end_at", "due_at"):
        _, precision = dt_parts(res["value"])
    return {
        "key": field,
        "label": label,
        "value": res["value"],
        "display": fmt_value(field, res["value"], precision),
        "status": res["status"],
        "precision": precision,
        "claims": claims,
    }


def task_payload(db: Session, task: Task, source_map=None) -> dict:
    source_map = source_map or _all_sources(db)
    fields = [
        _field_payload(db, "task", task.id, f, TASK_LABELS[f], source_map)
        for f in ("action", "due_at", "materials", "submit_channel", "prerequisites")
    ]
    due = next(f for f in fields if f["key"] == "due_at")
    return {
        "id": task.id,
        "action": task.action,
        "state": task.state,
        "due_at": due["value"],
        "due_display": due["display"],
        "precision": due["precision"],
        "materials": task.materials or [],
        "submit_channel": task.submit_channel,
        "fields": fields,
    }


def event_payload(db: Session, event: Event, *, detail: bool = False) -> dict:
    source_map = _all_sources(db)
    fields = [
        _field_payload(db, "event", event.id, f, label, source_map)
        for f, label in EVENT_LABEL_FIELDS
    ]
    tasks = [task_payload(db, t, source_map) for t in event.tasks]
    data: dict[str, Any] = {
        "id": event.id,
        "title": event.title,
        "state": event.state,
        "org": event.org,
        "location": event.location,
        "start_at": event.start_at.isoformat() if event.start_at else None,
        "start_display": next(f for f in fields if f["key"] == "start_at")["display"],
        "fields": fields,
        "tasks": tasks,
        "task_count": len(event.tasks),
        "open_task_count": len([t for t in event.tasks if t.state == "open"]),
        "conflict_count": len([f for f in fields if f["status"] == "conflict"]),
        "pending_count": len([f for f in fields if f["status"] in ("needs_anchor", "unconfirmed")]),
        "created_at": event.created_at.isoformat(),
    }
    if not detail:
        return data

    source_ids = {c["source"]["id"] for f in fields for c in f["claims"] if c["source"]}
    for t in tasks:
        source_ids |= {c["source"]["id"] for f in t["fields"] for c in f["claims"] if c["source"]}
    sources = [
        {
            "id": s.id,
            "kind": s.kind,
            "title": s.title,
            "url": s.url,
            "image_url": f"/media/{s.image_path}" if s.image_path else None,
            "fetched_at": s.fetched_at.isoformat(),
            "published_at": s.published_at.isoformat() if s.published_at else None,
            "excerpt": s.text[:300],
        }
        for s in (source_map[i] for i in source_ids if i in source_map)
    ]
    history = []
    for claim in db.scalars(
        select(Claim).where(Claim.entity_type == "event", Claim.entity_id == event.id).order_by(Claim.created_at)
    ).all():
        src = source_map.get(claim.source_id)
        history.append(
            {
                "at": claim.created_at.isoformat(),
                "field": claim.field,
                "label": EVENT_LABELS.get(claim.field, claim.field),
                "display": fmt_value(claim.field, claim.value),
                "status": claim.status,
                "origin": claim.origin,
                "source": src.title if src else None,
                "kind": src.kind if src else None,
            }
        )
    merge = db.scalar(
        select(MergeCandidate).where(
            MergeCandidate.state == "pending",
            (MergeCandidate.event_a_id == event.id) | (MergeCandidate.event_b_id == event.id),
        )
    )
    data.update(
        {
            "rules": [
                {
                    "id": r.id,
                    "text": r.text,
                    "impact": r.impact,
                    "state": r.state,
                    "claims": [
                        claim_view(c, source_map)
                        for c in field_claims(db, "rule", r.id, "text")
                        if c.status != "rejected"
                    ],
                }
                for r in event.rules
            ],
            "sources": sources,
            "history": history,
            "merge_id": merge.id if merge else None,
        }
    )
    return data


def _diff(db: Session, a: Event, b: Event) -> list[dict]:
    out: list[dict] = []
    for field, label in EVENT_LABEL_FIELDS:
        ra = resolve_field(db, "event", a.id, field)
        rb = resolve_field(db, "event", b.id, field)
        if rb["value"] is None:
            continue
        old = fmt_value(field, ra["value"], dt_parts(ra["value"])[1])
        new = fmt_value(field, rb["value"], dt_parts(rb["value"])[1])
        if ra["value"] is None:
            out.append({"kind": "add", "field": field, "label": label, "old": None, "new": new})
        elif same_value_detail(ra["value"], rb["value"]):
            # 同一值的不同详略（短串是长串子串）不产生 diff，与 resolve_field 的冲突判定一致。
            continue
        elif repr(ra["value"]) != repr(rb["value"]):
            out.append({"kind": "change", "field": field, "label": label, "old": old, "new": new})
    a_tasks = {t.action: t for t in a.tasks}
    emitted_materials: set[str] = set()
    for t in b.tasks:
        old_task = a_tasks.get(t.action)
        if old_task is None:
            due = fmt_value("due_at", {"iso": t.due_at.isoformat(), "precision": t.due_precision}) if t.due_at else None
            out.append({"kind": "task", "field": "task", "label": "新增待办", "old": None, "new": f"{t.action}{'（' + due + '）' if due else ''}"})
        old_materials = set(old_task.materials or []) if old_task else set()
        for material in t.materials or []:
            if material in old_materials or material in emitted_materials:
                continue
            emitted_materials.add(material)
            out.append({"kind": "material", "field": "materials", "label": "新增材料", "old": None, "new": material})
    return out


# ---------------------------------------------------------------- 健康与能力


@router.get("/health")
async def health(db: Session = Depends(get_db)):
    model = await llm.ping()
    return {
        "ok": True,
        "db": "sqlite",
        "model": model,
        "school": settings.school_name,
        "college": settings.college_name,
    }


CAPABILITIES = [
    {"key": "screenshot", "name": "截图识别与收录", "level": "live", "note": "上传或粘贴截图，真实调用模型识别"},
    {"key": "paste", "name": "电脑粘贴截图", "level": "live", "note": "Ctrl+V 直接粘贴"},
    {"key": "organize", "name": "事件整理与字段级来源", "level": "live", "note": "每个字段附带原文与出处"},
    {"key": "link", "name": "跨来源关联与冲突提示", "level": "live", "note": "提出合并建议，由你确认"},
    {"key": "verify", "name": "联网核实", "level": "live", "note": "真实检索并抓取原文"},
    {"key": "ics", "name": "日历导出", "level": "live", "note": "导出 .ics"},
    {"key": "crawl", "name": "官网同步", "level": "verified", "note": "已对 UNNC 真实栏目实测抓取与抽取"},
    {"key": "site", "name": "自定义站点", "level": "verified", "note": "真实写入，并在核实时附加 site: 限定"},
    {"key": "site_agent", "name": "站点调研 Agent", "level": "verified", "note": "真实调用本机 opencode 调研公开列表页，隔离环境、失败如实返回"},
    {"key": "api_source", "name": "第三方 API 源", "level": "unverified", "note": "已实现 JSON 拉取与抽取，缺真实第三方 Key 验证"},
    {"key": "reminder", "name": "站内提醒", "level": "verified", "note": "按任务截止提前 2 小时生成"},
    {"key": "imap", "name": "邮箱自动连接与检索", "level": "verified", "note": "2026-11-09 用 163.com 测试账号真实只读同步；Message-ID 去重，BODY.PEEK 不标已读"},
    {"key": "push", "name": "多渠道推送与后台提醒", "level": "entry", "note": "演示暂未接入"},
]


@router.get("/capabilities")
def capabilities():
    return {"items": CAPABILITIES}


# ---------------------------------------------------------------- 收录


class TextIngest(BaseModel):
    text: str
    title: str | None = None


def _new_job(db: Session, source_id: str, *, has_image: bool) -> Job:
    job = Job(
        type="parse",
        payload={"source_id": source_id, "has_image": has_image},
        state="queued",
        stage={
            "stage": "queued",
            "steps": [{"key": k, "label": l, "state": "todo"} for k, l in INGEST_STEPS],
            "message": "排队中…",
        },
    )
    db.add(job)
    db.commit()
    return job


@router.post("/ingest/screenshot")
async def ingest_screenshot(file: UploadFile = File(...), db: Session = Depends(get_db)):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "空文件")
    sid = uuid.uuid4().hex
    try:
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"无法读取图片：{e}") from e

    rel = f"screenshots/{sid}.png"
    path = MEDIA_DIR / rel
    img.thumbnail((1800, 1800))
    img.save(path, "PNG")

    source = Source(
        kind="screenshot",
        title=file.filename or "截图",
        image_path=rel,
        text="",
        status="ready",
        meta={"mime": "image/png", "original": file.filename},
    )
    db.add(source)
    db.commit()

    job = _new_job(db, source.id, has_image=True)
    asyncio.create_task(run_ingest(job.id))
    return {"job_id": job.id, "source_id": source.id}


@router.post("/ingest/text")
async def ingest_text(body: TextIngest, db: Session = Depends(get_db)):
    source = Source(kind="text", title=body.title or "手动输入", text=body.text, status="ready")
    db.add(source)
    db.commit()
    job = _new_job(db, source.id, has_image=False)
    asyncio.create_task(run_ingest(job.id))
    return {"job_id": job.id, "source_id": source.id}


@router.get("/jobs/{job_id}")
def job_status(job_id: str, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "任务不存在")
    return {
        "id": job.id,
        "state": job.state,
        "stage": job.stage,
        "result": job.result,
        "error": job.last_error,
    }


# ---------------------------------------------------------------- 事件


@router.get("/events")
def list_events(db: Session = Depends(get_db)):
    events = db.scalars(
        select(Event).where(Event.state != "merged").order_by(Event.created_at.desc())
    ).all()
    return {"items": [event_payload(db, e) for e in events]}


@router.get("/events/{event_id}")
def get_event(event_id: str, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "事件不存在")
    return event_payload(db, event, detail=True)


class FieldPatch(BaseModel):
    field: str
    value: str | None = None


@router.patch("/events/{event_id}")
def patch_event(event_id: str, body: FieldPatch, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "事件不存在")
    if body.field not in EVENT_LABELS:
        raise HTTPException(400, "不支持修改该字段")
    value = body.value
    if body.field in ("start_at", "end_at"):
        dt = parse_dt(value)
        if dt is None:
            raise HTTPException(400, "时间格式无法识别")
        value = {"iso": dt.isoformat(), "precision": "datetime"}
    # 用户手改的内容自建一条来源，保证永远可溯源
    src = Source(kind="text", title="用户修改", text=body.value or "", status="parsed")
    db.add(src)
    db.flush()
    add_claim(
        db,
        entity_type="event",
        entity_id=event.id,
        field=body.field,
        value=value,
        source_id=src.id,
        quote=body.value,
        status="user_confirmed",
        origin="user",
    )
    refresh_event(db, event)
    db.commit()
    return event_payload(db, event, detail=True)


@router.post("/events/{event_id}/confirm")
def confirm_event(event_id: str, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "事件不存在")
    event.state = "confirmed"
    db.commit()
    return event_payload(db, event, detail=True)


@router.post("/events/{event_id}/verify")
async def verify(event_id: str, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "事件不存在")
    job = Job(type="verify", payload={"event_id": event.id}, state="queued")
    db.add(job)
    db.commit()
    import asyncio

    asyncio.create_task(run_verify(job.id))
    return {"job_id": job.id}


class VerifyUrlBody(BaseModel):
    event_id: str
    url: str


@router.post("/verify/url")
async def verify_by_url(body: VerifyUrlBody, db: Session = Depends(get_db)):
    """按用户提供的官方链接核实（检索兜底路径）。

    不检索，只抓这一页；同步返回与 `/api/events/{id}/verify` 相同的 result，
    额外带 `mode: "url"`。内部仍记一条 type=verify_url 的 job 留痕。
    """
    event = db.get(Event, body.event_id)
    if not event:
        raise HTTPException(404, "事件不存在")
    url = (body.url or "").strip()
    if not url.lower().startswith(("http://", "https://")) or len(url) > 2000:
        raise HTTPException(400, "请提供 http/https 链接")

    job = Job(
        type="verify_url",
        payload={"event_id": event.id, "url": url},
        state="running",
        stage={"stage": "fetch", "steps": [], "message": "正在打开你提供的链接…"},
    )
    db.add(job)
    db.commit()

    from app.verify import verify_url

    try:
        result = await verify_url(db, event, job, url)
    except Exception as e:  # noqa: BLE001
        db.rollback()
        failed = db.get(Job, job.id)
        if failed:
            failed.state = "failed"
            failed.last_error = str(e)[:800]
            db.commit()
        raise HTTPException(500, f"核实失败：{str(e)[:200]}") from e

    job = db.get(Job, job.id)
    if job:
        job.result = result
        job.state = "done"
    db.commit()
    return result


@router.get("/events/{event_id}/ics")
def export_ics(event_id: str, db: Session = Depends(get_db)):
    from icalendar import Alarm, Calendar, Event as ICalEvent

    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "事件不存在")
    cal = Calendar()
    cal.add("prodid", "-//到点 ontime//demo//CN")
    cal.add("version", "2.0")
    cal.add("x-wr-calname", "到点 · 行动清单")

    if event.start_at:
        ev = ICalEvent()
        ev.add("summary", event.title)
        ev.add("dtstart", event.start_at)
        # 优先使用事件自身的结束时间，导出才与页面显示的活动时段一致。
        if event.end_at:
            end_at = event.end_at
            if end_at <= event.start_at:
                # 结束早于开始的异常数据不生成非法事件，按兜底时长处理。
                end_at = event.start_at + timedelta(hours=1)
        else:
            # 兜底：没有 end_at 时按 1 小时默认时长，仅用于缺失结束时间的事件。
            end_at = event.start_at + timedelta(hours=1)
        ev.add("dtend", end_at)
        if event.location:
            ev.add("location", event.location)
        ev.add("description", "来自「到点」推送")
        cal.add_component(ev)

    for task in event.tasks:
        if not task.due_at:
            continue
        ev = ICalEvent()
        ev.add("summary", f"截止：{task.action}")
        ev.add("dtstart", task.due_at)
        # 任务只有一个截止时刻；给 30 分钟展示块，保证 DTEND 晚于 DTSTART（RFC 5545）。
        ev.add("dtend", task.due_at + timedelta(minutes=30))
        ev.add("uid", f"task-{task.id}@ontime")
        if event.title:
            ev.add("description", f"{event.title}｜来自「到点」")
        alarm = Alarm()
        alarm.add("action", "DISPLAY")
        alarm.add("description", f"还有 2 小时截止：{task.action}")
        alarm.add("trigger", timedelta(hours=-2))
        ev.add_component(alarm)
        cal.add_component(ev)

    return Response(
        cal.to_ical(),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="ontime-{event.id[:6]}.ics"'},
    )


# ---------------------------------------------------------------- 待确认 / 合并


@router.get("/inbox")
def inbox(db: Session = Depends(get_db)):
    source_map = _all_sources(db)
    candidates = db.scalars(
        select(Event).where(Event.state == "candidate").order_by(Event.created_at.desc())
    ).all()
    merges = db.scalars(
        select(MergeCandidate).where(MergeCandidate.state == "pending").order_by(MergeCandidate.created_at.desc())
    ).all()

    cand_out = []
    for e in candidates:
        # 候选卡的来源直接取 title 字段的 claim，避免扫整表 Source 时命中别的行
        title_res = resolve_field(db, "event", e.id, "title")
        title_claim = title_res["claim"] or next(
            (c for c in field_claims(db, "event", e.id, "title") if c.status != "rejected"),
            None,
        )
        src = source_map.get(title_claim.source_id) if title_claim else None
        meta = (src.meta or {}) if src else {}
        cand_out.append(
            {
                **event_payload(db, e),
                "summary": meta.get("summary"),
                "questions": meta.get("questions", []),
                "source": {
                    "id": src.id if src else None,
                    "kind": src.kind if src else None,
                    "title": src.title if src else None,
                    "image_url": f"/media/{src.image_path}" if src and src.image_path else None,
                },
            }
        )

    merge_out = []
    for mc in merges:
        a, b = db.get(Event, mc.event_a_id), db.get(Event, mc.event_b_id)
        if not a or not b:
            continue
        merge_out.append(
            {
                "id": mc.id,
                "score": round(mc.score, 2),
                "reasons": mc.reasons or [],
                "state": mc.state,
                "a": {"id": a.id, "title": a.title, "start_display": fmt_value("start_at", {"iso": a.start_at.isoformat()} if a.start_at else None)},
                "b": {"id": b.id, "title": b.title, "start_display": fmt_value("start_at", {"iso": b.start_at.isoformat()} if b.start_at else None)},
                "diff": _diff(db, a, b),
            }
        )

    changes = db.scalars(select(Change).where(Change.state == "pending")).all()
    return {
        "candidates": cand_out,
        "merges": merge_out,
        "changes": [
            {
                "id": c.id,
                "entity_type": c.entity_type,
                "entity_id": c.entity_id,
                "field": c.field,
                "old": fmt_value(c.field, c.old_value),
                "new": fmt_value(c.field, c.new_value),
                "reason": c.reason,
            }
            for c in changes
        ],
        "counts": {"candidates": len(cand_out), "merges": len(merge_out), "changes": len(changes)},
    }


class MergeDecision(BaseModel):
    action: str  # accept | reject


@router.post("/merge/{merge_id}")
def decide_merge(merge_id: str, body: MergeDecision, db: Session = Depends(get_db)):
    mc = db.get(MergeCandidate, merge_id)
    if not mc:
        raise HTTPException(404, "合并建议不存在")
    a, b = db.get(Event, mc.event_a_id), db.get(Event, mc.event_b_id)
    if not a or not b:
        raise HTTPException(404, "事件不存在")

    if body.action == "reject":
        mc.state = "rejected"
        db.commit()
        return {"ok": True, "state": "rejected"}

    if mc.state != "pending":
        raise HTTPException(400, "该建议已处理")

    # Claim 改指向而不是复制值：合并可撤销，历史全在
    for c in db.scalars(
        select(Claim).where(Claim.entity_type == "event", Claim.entity_id == b.id)
    ).all():
        c.entity_id = a.id
    for t in list(b.tasks):
        t.event_id = a.id
    for r in list(b.rules):
        r.event_id = a.id
    b.state = "merged"
    b.merged_into_id = a.id
    a.state = "confirmed"
    mc.state = "accepted"
    db.flush()
    refresh_event(db, a)
    for t in a.tasks:
        refresh_task(db, t)
    db.commit()
    return {"ok": True, "state": "accepted", "event_id": a.id}


@router.post("/claims/{claim_id}/decide")
def decide_claim(claim_id: str, body: MergeDecision, db: Session = Depends(get_db)):
    claim = db.get(Claim, claim_id)
    if not claim:
        raise HTTPException(404, "依据不存在")
    if body.action == "accept":
        claim.status = "user_confirmed"
        claim.decided_at = datetime.now(timezone.utc)
        siblings = field_claims(db, claim.entity_type, claim.entity_id, claim.field)
        for other in siblings:
            if other.id != claim.id and other.status in ("supported", "conflict", "user_confirmed"):
                other.status = "rejected"
    else:
        claim.status = "rejected"
        claim.decided_at = datetime.now(timezone.utc)
    db.flush()
    if claim.entity_type == "event":
        event = db.get(Event, claim.entity_id)
        if event:
            refresh_event(db, event)
    elif claim.entity_type == "task":
        task = db.get(Task, claim.entity_id)
        if task:
            refresh_task(db, task)
    db.commit()
    return {"ok": True, "status": claim.status}


class FindingApply(BaseModel):
    event_id: str
    field: str
    value: Any = None
    quote: str | None = None
    source_id: str
    impact: str = "normal"
    label: str | None = None


@router.post("/findings/apply")
def apply_finding(body: FindingApply, db: Session = Depends(get_db)):
    event = db.get(Event, body.event_id)
    if not event:
        raise HTTPException(404, "事件不存在")
    source = db.get(Source, body.source_id)
    if not source:
        raise HTTPException(404, "来源不存在")

    value = body.value
    if isinstance(value, dict):
        iso = value.get("iso")
        value = {"iso": iso, "precision": value.get("precision", "datetime")}
    elif body.field in ("start_at", "end_at", "due_at"):
        dt = parse_dt(str(value))
        value = {"iso": dt.isoformat(), "precision": "datetime"} if dt else value

    if body.field in EVENT_LABELS:
        add_claim(
            db,
            entity_type="event",
            entity_id=event.id,
            field=body.field,
            value=value,
            source_id=source.id,
            quote=body.quote,
            status="supported",
            origin="rule",
        )
        refresh_event(db, event)
    elif body.field == "rule":
        rule = Rule(
            event_id=event.id,
            text=str(value),
            impact=body.impact,
            state="supported" if body.impact != "high" else "unconfirmed",
        )
        db.add(rule)
        db.flush()
        add_claim(
            db,
            entity_type="rule",
            entity_id=rule.id,
            field="text",
            value=rule.text,
            source_id=source.id,
            quote=body.quote,
            status="supported",
            origin="rule",
        )
    else:
        task = event.tasks[0] if event.tasks else None
        if task is None:
            task = Task(event_id=event.id, action=body.label or "补充要求")
            db.add(task)
            db.flush()
        if body.field == "materials":
            current = list(task.materials or [])
            add = value if isinstance(value, list) else [value]
            merged = current + [x for x in add if x not in current]
            value = merged
        add_claim(
            db,
            entity_type="task",
            entity_id=task.id,
            field=body.field,
            value=value,
            source_id=source.id,
            quote=body.quote,
            status="supported",
            origin="rule",
        )
        refresh_task(db, task)
    db.commit()
    return event_payload(db, event, detail=True)


@router.post("/tasks/{task_id}/toggle")
def toggle_task(task_id: str, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    task.state = "done" if task.state == "open" else "open"
    db.commit()
    return {"ok": True, "state": task.state}


@router.get("/today")
def today(db: Session = Depends(get_db)):
    events = db.scalars(select(Event).where(Event.state != "merged").order_by(Event.created_at.desc())).all()
    # 行动台只服务已确认事件：候选事件的任务还没过用户确认，不能提前催办
    confirmed = [e for e in events if e.state == "confirmed"]
    tasks = []
    for e in confirmed:
        for t in e.tasks:
            tasks.append(
                {
                    "id": t.id,
                    "event_id": e.id,
                    "event_title": e.title,
                    "action": t.action,
                    "due_at": t.due_at.isoformat() if t.due_at else None,
                    "due_display": fmt_value("due_at", {"iso": t.due_at.isoformat(), "precision": t.due_precision}) if t.due_at else None,
                    "state": t.state,
                }
            )
    tasks.sort(key=lambda x: (x["due_at"] or "9999", x["state"] != "open"))
    return {
        "events": [event_payload(db, e) for e in events if e.state == "confirmed"],
        "tasks": tasks,
        "candidates": len([e for e in events if e.state == "candidate"]),
    }


# ---------------------------------------------------------------- 官网同步


class WatchTargetCreate(BaseModel):
    name: str
    url: str
    selector: str | None = None
    cron: str | None = None


class WatchTargetPatch(BaseModel):
    name: str | None = None
    selector: str | None = None
    cron: str | None = None
    enabled: bool | None = None


def _valid_url(url: str) -> bool:
    return url.lower().startswith(("http://", "https://")) and len(url) <= 2000


@router.get("/watch-targets")
def list_watch_targets(db: Session = Depends(get_db)):
    rows = db.scalars(select(WatchTarget).order_by(WatchTarget.created_at.desc())).all()
    return {"items": [_watch_target_payload(db, t) for t in rows]}


@router.post("/watch-targets")
def create_watch_target(body: WatchTargetCreate, db: Session = Depends(get_db)):
    if not body.name.strip() or not _valid_url(body.url.strip()):
        raise HTTPException(400, "请填写名称与 http/https 栏目地址")
    target = WatchTarget(
        kind="web",
        name=body.name.strip()[:128],
        url=body.url.strip(),
        selector=(body.selector or "").strip() or None,
        cron=(body.cron or "").strip() or None,
        enabled=True,
        last_status="never",
    )
    db.add(target)
    db.commit()
    from app.scheduler import reload_jobs

    reload_jobs()
    return _watch_target_payload(db, target)


@router.patch("/watch-targets/{target_id}")
def patch_watch_target(target_id: str, body: WatchTargetPatch, db: Session = Depends(get_db)):
    target = db.get(WatchTarget, target_id)
    if not target:
        raise HTTPException(404, "同步目标不存在")
    if body.name is not None:
        target.name = body.name.strip()[:128] or target.name
    if body.selector is not None:
        target.selector = body.selector.strip() or None
    if body.cron is not None:
        target.cron = body.cron.strip() or None
    if body.enabled is not None:
        target.enabled = body.enabled
    db.commit()
    from app.scheduler import reload_jobs

    reload_jobs()
    return _watch_target_payload(db, target)


@router.delete("/watch-targets/{target_id}")
def delete_watch_target(target_id: str, db: Session = Depends(get_db)):
    target = db.get(WatchTarget, target_id)
    if not target:
        raise HTTPException(404, "同步目标不存在")
    db.delete(target)
    db.commit()
    from app.scheduler import reload_jobs

    reload_jobs()
    return {"ok": True}


@router.post("/watch-targets/{target_id}/sync")
async def sync_watch_target(target_id: str, db: Session = Depends(get_db)):
    target = db.get(WatchTarget, target_id)
    if not target:
        raise HTTPException(404, "同步目标不存在")
    if not target.url:
        raise HTTPException(400, "该目标没有栏目地址")
    from app.crawl import create_crawl_job, run_crawl

    job = create_crawl_job(db, target)
    asyncio.create_task(run_crawl(job.id))
    return {"job_id": job.id}


@router.get("/sync-runs")
def list_sync_runs(target_id: str | None = None, limit: int = 20, db: Session = Depends(get_db)):
    limit = max(1, min(limit, 100))
    stmt = select(SyncRun).order_by(SyncRun.started_at.desc()).limit(limit)
    if target_id:
        stmt = stmt.where(SyncRun.target_id == target_id)
    rows = db.scalars(stmt).all()
    return {"items": [_sync_run_payload(r) for r in rows]}


# ---------------------------------------------------------------- 自定义站点


class SiteCreate(BaseModel):
    name: str
    domain: str
    kind: Literal["web", "api"] = "web"
    list_url: str | None = None
    search_url: str | None = None
    api_url: str | None = None
    # 只写 ~/.ontime/sites.json，绝不入库/回显
    api_key: str | None = None
    item_selector: str | None = None
    title_selector: str | None = None
    content_selector: str | None = None
    profile_source: Literal["manual", "agent"] | None = None


class SitePatch(BaseModel):
    name: str | None = None
    domain: str | None = None
    kind: Literal["web", "api"] | None = None
    list_url: str | None = None
    search_url: str | None = None
    api_url: str | None = None
    api_key: str | None = None
    item_selector: str | None = None
    title_selector: str | None = None
    content_selector: str | None = None
    profile_source: Literal["manual", "agent"] | None = None
    verified: bool | None = None
    enabled: bool | None = None


class SiteResearch(BaseModel):
    url: str
    task: str | None = None
    site_id: str | None = None


def _normalize_domain(value: str) -> str:
    raw = (value or "").strip().lower()
    if "://" in raw:
        raw = raw.split("://", 1)[1]
    raw = raw.split("/", 1)[0].split("?", 1)[0]
    return raw.strip().strip(".")[:255]


def _clean_url_value(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    if not _valid_url(text):
        raise HTTPException(400, "站点地址必须是 http/https")
    return text


def _clean_selector(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text[:1000] or None


@router.get("/sites")
def list_sites(db: Session = Depends(get_db)):
    rows = db.scalars(select(Site).order_by(Site.created_at.desc())).all()
    return {"items": [_site_payload(s) for s in rows]}


@router.post("/sites")
def create_site(body: SiteCreate, db: Session = Depends(get_db)):
    domain = _normalize_domain(body.domain)
    if not body.name.strip() or not domain:
        raise HTTPException(400, "请填写站点名称与域名")
    if db.scalar(select(Site).where(Site.domain == domain)):
        raise HTTPException(409, "该站点已存在")
    list_url = _clean_url_value(body.list_url)
    search_url = _clean_url_value(body.search_url)
    api_url = _clean_url_value(body.api_url)
    if body.kind == "api" and not api_url:
        raise HTTPException(400, "API 源必须填写 api_url")
    selectors = {
        "item_selector": _clean_selector(body.item_selector),
        "title_selector": _clean_selector(body.title_selector),
        "content_selector": _clean_selector(body.content_selector),
    }
    profile_source = body.profile_source
    if profile_source is None and any(selectors.values()):
        profile_source = "manual"
    site = Site(
        name=body.name.strip()[:128],
        domain=domain,
        kind=body.kind,
        list_url=list_url,
        search_url=search_url,
        api_url=api_url,
        profile_source=profile_source,
        verified=False,
        enabled=True,
        **selectors,
    )
    db.add(site)
    db.commit()
    if body.api_key:
        from app.services.site_sync import save_site_key

        save_site_key(site.id, body.api_key)
    return _site_payload(site)


@router.post("/sites/research")
async def research_site(body: SiteResearch, db: Session = Depends(get_db)):
    from app.services.site_agent import RESEARCH_STEPS, run_site_research

    url = (body.url or "").strip()
    site: Site | None = None
    if body.site_id:
        site = db.get(Site, body.site_id)
        if site is None:
            raise HTTPException(404, "站点不存在")
        if not url:
            url = site.list_url or ""
    if not _valid_url(url):
        raise HTTPException(400, "调研地址必须是 http/https")
    job = Job(
        type="site_research",
        payload={"url": url, "task": body.task, "site_id": body.site_id},
        state="queued",
        stage={
            "stage": "queued",
            "steps": [{"key": k, "label": label, "state": "todo"} for k, label in RESEARCH_STEPS],
            "message": "排队中…",
        },
    )
    db.add(job)
    db.commit()
    asyncio.create_task(run_site_research(job.id))
    return {"job_id": job.id}


@router.patch("/sites/{site_id}")
def patch_site(site_id: str, body: SitePatch, db: Session = Depends(get_db)):
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(404, "站点不存在")
    data = body.model_dump(exclude_unset=True)

    if "domain" in data and data["domain"] is not None:
        domain = _normalize_domain(data["domain"])
        if not domain:
            raise HTTPException(400, "域名不能为空")
        other = db.scalar(select(Site).where(Site.domain == domain, Site.id != site.id))
        if other:
            raise HTTPException(409, "该域名已被其他站点使用")
        site.domain = domain
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        if not name:
            raise HTTPException(400, "站点名称不能为空")
        site.name = name[:128]
    if "kind" in data and data["kind"] is not None:
        site.kind = data["kind"]
    for field in ("list_url", "search_url", "api_url"):
        if field in data:
            setattr(site, field, _clean_url_value(data[field]))
    for field in ("item_selector", "title_selector", "content_selector"):
        if field in data:
            setattr(site, field, _clean_selector(data[field]))
    if "profile_source" in data:
        site.profile_source = data["profile_source"]
    elif any(f in data for f in ("item_selector", "title_selector", "content_selector")):
        site.profile_source = site.profile_source or "manual"
    if "verified" in data and data["verified"] is not None:
        site.verified = bool(data["verified"])
    if "enabled" in data and data["enabled"] is not None:
        site.enabled = bool(data["enabled"])
    if site.kind == "api" and not site.api_url:
        raise HTTPException(400, "API 源必须填写 api_url")
    if "api_key" in data:
        from app.services.site_sync import save_site_key

        save_site_key(site.id, data["api_key"])
    db.commit()
    return _site_payload(site)


@router.delete("/sites/{site_id}")
def delete_site(site_id: str, db: Session = Depends(get_db)):
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(404, "站点不存在")
    from app.services.site_sync import save_site_key

    save_site_key(site.id, None)
    db.delete(site)
    db.commit()
    return {"ok": True}


@router.post("/sites/{site_id}/sync")
async def sync_site(site_id: str, db: Session = Depends(get_db)):
    from app.services.site_sync import create_site_sync_job, run_site_sync

    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(404, "站点不存在")
    if site.kind == "api" and not site.api_url:
        raise HTTPException(400, "该 API 源没有 api_url")
    if site.kind != "api" and not site.list_url:
        raise HTTPException(400, "该站点没有列表地址")
    job = create_site_sync_job(db, site)
    asyncio.create_task(run_site_sync(job.id))
    return {"job_id": job.id}


# ---------------------------------------------------------------- 邮件


@router.post("/mail/import")
async def mail_import(file: UploadFile = File(...), db: Session = Depends(get_db)):
    from app.mail import import_parsed_message, parse_eml_bytes
    from app.pipeline import run_ingest as _run_ingest

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "空文件")
    try:
        parsed_messages = parse_eml_bytes(raw, file.filename or "")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"无法解析邮件：{str(e)[:200]}") from e

    job_ids: list[str] = []
    source_ids: list[str] = []
    for parsed in parsed_messages:
        result = import_parsed_message(db, parsed, raw=raw if len(parsed_messages) == 1 else None)
        if result is None:
            continue
        source, job = result
        source_ids.append(source.id)
        job_ids.append(job.id)
    if not job_ids:
        raise HTTPException(409, "邮件已导入过（Message-ID 重复）")

    for job_id in job_ids:
        asyncio.create_task(_run_ingest(job_id))
    return {"job_ids": job_ids, "source_ids": source_ids}


@router.get("/mail/imports")
def mail_imports(db: Session = Depends(get_db)):
    sources = db.scalars(
        select(Source).where(Source.kind == "mail").order_by(Source.fetched_at.desc()).limit(100)
    ).all()
    jobs = db.scalars(select(Job).where(Job.type == "parse").order_by(Job.created_at.desc())).all()
    job_by_source: dict[str, str] = {}
    for job in jobs:
        sid = (job.payload or {}).get("source_id")
        if sid and sid not in job_by_source:
            job_by_source[sid] = job.state
    return {
        "items": [
            {
                "source_id": s.id,
                "subject": s.title,
                "from": s.org,
                "date": s.published_at.isoformat() if s.published_at else None,
                "job_state": job_by_source.get(s.id, "unknown"),
            }
            for s in sources
        ]
    }


class ImapBody(BaseModel):
    host: str
    port: int = 993
    username: str
    password: str


class ImapSyncBody(ImapBody):
    since_days: int = 7
    query: str | None = None


@router.post("/mail/imap/test")
async def mail_imap_test(body: ImapBody):
    from app.mail import imap_test, load_imap_config, save_imap_config

    ok, message = await imap_test(body.host.strip(), body.port, body.username.strip(), body.password)
    if ok:
        cfg = load_imap_config()
        cfg.update(
            {
                "host": body.host.strip(),
                "port": body.port,
                "username": body.username.strip(),
                "password": body.password,
                "verified": True,
                "error": None,
            }
        )
        save_imap_config(cfg)
    return {"ok": ok, "message": message}


@router.post("/mail/imap/sync")
async def mail_imap_sync(body: ImapSyncBody, db: Session = Depends(get_db)):
    from app.mail import load_imap_config, run_mail_sync, save_imap_config

    cfg = load_imap_config()
    cfg.update(
        {
            "host": body.host.strip(),
            "port": body.port,
            "username": body.username.strip(),
            "password": body.password,
            "verified": False,
            "error": None,
        }
    )
    save_imap_config(cfg)
    job = Job(
        type="mail_sync",
        payload={
            "since_days": max(1, min(body.since_days, 90)),
            "query": (body.query or "").strip() or None,
        },
        state="queued",
    )
    db.add(job)
    db.commit()
    asyncio.create_task(run_mail_sync(job.id))
    return {"job_id": job.id}


@router.get("/mail/imap/status")
def mail_imap_status():
    from app.mail import imap_status

    return imap_status()


# ---------------------------------------------------------------- 提醒


@router.get("/reminders")
def list_reminders(db: Session = Depends(get_db)):
    rows = db.scalars(select(Reminder).order_by(Reminder.fire_at)).all()
    return {"items": [_reminder_payload(db, r) for r in rows]}


@router.post("/reminders/sync")
def sync_reminders(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    tasks = db.scalars(
        select(Task).where(Task.state == "open", Task.due_at.is_not(None))
    ).all()
    created = 0
    for task in tasks:
        if task.due_at is None or task.due_at <= now:
            continue
        fire_at = task.due_at - timedelta(hours=2)
        existing = db.scalar(
            select(Reminder).where(Reminder.task_id == task.id, Reminder.fire_at == fire_at)
        )
        if existing:
            continue
        db.add(
            Reminder(
                task_id=task.id,
                event_id=task.event_id,
                fire_at=fire_at,
                channel="inapp",
                state="scheduled",
            )
        )
        created += 1
    db.commit()
    return {"created": created}


@router.post("/reminders/{reminder_id}/dismiss")
def dismiss_reminder(reminder_id: str, db: Session = Depends(get_db)):
    reminder = db.get(Reminder, reminder_id)
    if not reminder:
        raise HTTPException(404, "提醒不存在")
    reminder.state = "dismissed"
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 演示重置


@router.post("/demo/reset")
def demo_reset(db: Session = Depends(get_db)):
    for model in (
        Change, MergeCandidate, Reminder, Job, PipelineRun, Claim, Rule, Task, Event,
        Source, SyncRun, WatchTarget, Site,
    ):
        db.execute(delete(model))
    db.commit()
    for p in (MEDIA_DIR / "screenshots").glob("*"):
        p.unlink(missing_ok=True)
    return {"ok": True}


@router.post("/demo/seed-profile")
def seed_profile(body: dict | None = None, db: Session = Depends(get_db)):
    profile = db.get(Profile, "me") or Profile(id="me")
    if body:
        profile.school = body.get("school", profile.school)
        profile.college = body.get("college", profile.college)
        profile.grade = body.get("grade", profile.grade)
    db.add(profile)
    db.commit()
    return {"ok": True}
