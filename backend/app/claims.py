"""Claim 写入与视图刷新。

规则：
- 任何语义字段的变更都走 add_claim()，不直接赋值。
- 视图（Event/Task 的具体列）由 refresh_* 从 Claim 推导，供列表查询使用。
- 同字段存在多个不同值 → 视图标记 conflict，保留全部候选，等用户裁决。
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Claim, Event, Task, utcnow

EVENT_FIELDS = ("title", "description", "org", "audience", "location", "start_at", "end_at")
TASK_FIELDS = ("action", "due_at", "materials", "submit_channel", "prerequisites")

EVENT_LABELS = {
    "title": "标题",
    "start_at": "活动时间",
    "end_at": "结束时间",
    "location": "地点",
    "org": "组织方",
    "audience": "适用对象",
    "description": "说明",
}
TASK_LABELS = {
    "action": "事项",
    "due_at": "截止时间",
    "materials": "所需材料",
    "submit_channel": "提交方式",
    "prerequisites": "前置条件",
}

TZ = ZoneInfo("Asia/Shanghai")


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    return dt


def fmt_dt(value: str | None, precision: str | None = "datetime") -> str | None:
    dt = parse_dt(value)
    if not dt:
        return value
    local = dt.astimezone(TZ)
    now = utcnow().astimezone(TZ)
    same_year = local.year == now.year
    week = "一二三四五六日"[local.weekday()]
    if precision == "date":
        return f"{local.month}月{local.day}日" if same_year else f"{local.year}年{local.month}月{local.day}日"
    hm = f"{local.hour:02d}:{local.minute:02d}"
    if precision == "range":
        return f"{local.month}月{local.day}日 {hm}"
    date_part = f"{local.month}月{local.day}日" if same_year else f"{local.year}年{local.month}月{local.day}日"
    return f"{date_part} 周{week} {hm}"


def dt_parts(value) -> tuple[str | None, str | None]:
    """时间类字段统一存 {"iso": ..., "precision": ...}，这里取回两者。"""
    if value is None:
        return None, None
    if isinstance(value, dict):
        return value.get("iso"), value.get("precision")
    return str(value), None


def fmt_value(field: str, value, precision: str | None = None) -> str | None:
    if value is None:
        return None
    if field in ("start_at", "end_at", "due_at"):
        iso, prec = dt_parts(value)
        return fmt_dt(iso, prec or precision)
    if isinstance(value, list):
        return "、".join(str(x) for x in value) if value else None
    return str(value)


def add_claim(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    field: str,
    value,
    source_id: str,
    quote: str | None = None,
    quote_span: tuple[int, int] | None = None,
    status: str = "supported",
    origin: str = "model",
    confidence: float | None = None,
) -> Claim:
    claim = Claim(
        entity_type=entity_type,
        entity_id=entity_id,
        field=field,
        value=value,
        source_id=source_id,
        quote=quote,
        quote_start=quote_span[0] if quote_span else None,
        quote_end=quote_span[1] if quote_span else None,
        status=status,
        origin=origin,
        confidence=confidence,
    )
    db.add(claim)
    db.flush()
    return claim


def field_claims(db: Session, entity_type: str, entity_id: str, field: str) -> list[Claim]:
    rows = db.scalars(
        select(Claim)
        .where(Claim.entity_type == entity_type, Claim.entity_id == entity_id, Claim.field == field)
        .order_by(Claim.created_at)
    ).all()
    return list(rows)


def _norm(value) -> str:
    return repr(value)


def resolve_field(db: Session, entity_type: str, entity_id: str, field: str) -> dict:
    """返回 {value, status, precision, claim}，供视图刷新与前端展示共用。"""
    rows = [
        c
        for c in field_claims(db, entity_type, entity_id, field)
        if c.status not in ("rejected", "stale", "unverified")
    ]
    confirmed = [c for c in rows if c.status == "user_confirmed"]
    supported = [c for c in rows if c.status == "supported"]
    pending = [c for c in rows if c.status in ("needs_anchor", "conflict", "insufficient")]

    pool = confirmed or supported
    if pool:
        winner = pool[-1]
        distinct = {_norm(c.value) for c in pool}
        status = "user_confirmed" if confirmed else ("conflict" if len(distinct) > 1 else "supported")
        if field == "title" and status == "conflict":
            # 冲突仍并排展示、由用户裁决；展示默认取信息量更大的完整标题，
            # 避免「讲座」这类群聊简称盖过正式通知标题。
            winner = max(pool, key=lambda c: len(str(c.value or "")))
        return {"value": winner.value, "status": status, "claim": winner}
    if pending:
        return {"value": None, "status": pending[-1].status, "claim": pending[-1]}
    return {"value": None, "status": "unconfirmed", "claim": None}


def _apply(entity, field: str, value):
    if field in ("start_at", "end_at", "due_at"):
        iso, _ = dt_parts(value)
        setattr(entity, field, parse_dt(iso))
    elif field == "materials":
        entity.materials = value if isinstance(value, list) else ([value] if value else [])
    else:
        setattr(entity, field, value)


def refresh_event(db: Session, event: Event) -> Event:
    for field in EVENT_FIELDS:
        res = resolve_field(db, "event", event.id, field)
        if field == "title":
            event.title = res["value"] or event.title or "未命名事件"
        else:
            _apply(event, field, res["value"])
        if field in ("start_at", "end_at"):
            _, prec = dt_parts(res["value"])
            if prec:
                setattr(event, f"{field.replace('_at', '')}_precision", prec)
    db.flush()
    return event


def refresh_task(db: Session, task: Task) -> Task:
    for field in TASK_FIELDS:
        res = resolve_field(db, "task", task.id, field)
        if field == "action":
            task.action = res["value"] or task.action or "待办事项"
        else:
            _apply(task, field, res["value"])
        if field == "due_at":
            _, prec = dt_parts(res["value"])
            if prec:
                task.due_precision = prec
    db.flush()
    return task


def claim_view(claim: Claim, source_map: dict) -> dict:
    from app.models import Source  # 局部导入避免循环

    src = source_map.get(claim.source_id)
    return {
        "id": claim.id,
        "value": claim.value,
        "display": fmt_value(claim.field, claim.value),
        "status": claim.status,
        "origin": claim.origin,
        "quote": claim.quote,
        "quote_start": claim.quote_start,
        "quote_end": claim.quote_end,
        "created_at": claim.created_at.isoformat(),
        "source": (
            {
                "id": src.id,
                "kind": src.kind,
                "title": src.title,
                "url": src.url,
                "image_url": f"/media/{src.image_path}" if src.image_path else None,
                "published_at": src.published_at.isoformat() if src.published_at else None,
            }
            if isinstance(src, Source)
            else None
        ),
    }
