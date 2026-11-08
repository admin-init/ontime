from __future__ import annotations

import asyncio
import io
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel
from sqlalchemy import delete, select
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
    Source,
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
    {"key": "crawl", "name": "官网定时抓取", "level": "entry", "note": "演示暂未接入，仅保留入口"},
    {"key": "imap", "name": "邮箱自动连接与检索", "level": "entry", "note": "演示暂未接入"},
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


# ---------------------------------------------------------------- 演示重置


@router.post("/demo/reset")
def demo_reset(db: Session = Depends(get_db)):
    for model in (Change, MergeCandidate, Reminder, Job, PipelineRun, Claim, Rule, Task, Event, Source, WatchTarget):
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
