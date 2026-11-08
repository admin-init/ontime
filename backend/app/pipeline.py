"""收录流水线：识别 → 抽取 → 校验闸门 → 落库 → 关联事件。"""

from __future__ import annotations

import io
import re
import unicodedata
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import llm
from app.claims import TZ, add_claim, dt_parts, parse_dt, refresh_event, refresh_task, resolve_field
from app.core import MEDIA_DIR, SessionLocal, settings
from app.models import Claim, Event, Job, MergeCandidate, Rule, Source, Task, utcnow
from app.schemas import ExtractedEvent, ExtractedTask, ExtractionResult, FieldValue, LinkJudge

# ---------------------------------------------------------------- 文本归一化


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u200b", "").replace("\ufeff", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def prepare_image(data: bytes, mime: str) -> tuple[bytes, str]:
    """小截图先放大 2 倍再送识别。

    手机/网页截图里的链接字号很小，视觉模型容易漏掉连续重复字母
    （例如 unncevents 变成 unnevents）。放大后逐字符识别明显更稳。
    """
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:  # noqa: BLE001
        return data, mime
    if max(img.size) >= 1600:
        return data, mime
    img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue(), "image/png"


class QuoteIndex:
    """定位原文片段，返回原文本中的真实区间。

    两级匹配，都只做「空白/标点归一」，不改字：
    1. 去掉空白后整段精确匹配；
    2. 再去掉标点后匹配（模型抄写时标点常和原文不一致）。
    命中后一律用原文本切片作为 quote，保证 quote == text[start:end]。
    """

    def __init__(self, text: str):
        self.text = text
        self.map: list[int] = []
        chars: list[str] = []
        self.loose_map: list[int] = []
        loose: list[str] = []
        for i, ch in enumerate(text):
            if not ch.isspace():
                chars.append(ch)
                self.map.append(i)
            if ch.isalnum():
                loose.append(ch)
                self.loose_map.append(i)
        self.compact = "".join(chars)
        self.loose = "".join(loose)

    @staticmethod
    def _tight(value: str) -> str:
        return "".join(ch for ch in unicodedata.normalize("NFKC", value) if ch.isalnum())

    def find(self, quote: str | None) -> tuple[int, int] | None:
        if not quote:
            return None
        q = "".join(ch for ch in unicodedata.normalize("NFKC", quote) if not ch.isspace())
        if q:
            pos = self.compact.find(q)
            if pos >= 0:
                return self.map[pos], self.map[pos + len(q) - 1] + 1
        q_loose = self._tight(quote)
        if q_loose:
            pos = self.loose.find(q_loose)
            if pos >= 0:
                return self.loose_map[pos], self.loose_map[pos + len(q_loose) - 1] + 1
        return None

    def slice(self, span: tuple[int, int]) -> str:
        return self.text[span[0] : span[1]]


# ---------------------------------------------------------------- 提示词

TRANSCRIBE_PROMPT = """你是校园截图文字转录器。把图片中所有可见文字逐字转录，保持原有顺序与换行。

规则：
1. 只转录，不总结、不翻译、不补全、不猜测。
2. 数字、日期、时间、地点、链接、文件名必须原样保留。链接和英文单词要逐字符核对，连续相同字母不能合并、不能漏写（例如 events 不能写成 evnts）。
3. 聊天截图按消息顺序输出，每条消息一行，格式：[发送人] 内容；发送人看不清写 [未知]。
4. 图中若出现日期或时间标注（消息时间、通知落款、发布日），原样保留在对应位置。
5. 完全无法辨认的字用 □ 代替。
6. 只输出转录文本，不要任何解释或标注。"""

EXTRACT_SYSTEM = """你是校园通知结构化抽取器。只输出 JSON，不输出解释。

硬性规则：
1. 只要正文在讨论某个具体活动、项目、讲座、评选、比赛、课程安排或招生事项，就必须在 events 里输出对应的一条：title 必填，且是原文中能逐字找到的称呼（如「讲座」「公开讲座：…」）；start_at、location、org、audience 原文没写就填 null。不要因为缺少时间、地点或截止时间就省略 event。聊天记录里即使只是转述或讨论变更（例如改地点、补材料），也要为该活动输出 event。
2. 只有正文是纯闲聊、纯提问、寒暄，且没有指向任何具体活动对象时，events 才允许为空。
3. 只抽取原文中明确写出的信息。没有就填 null，禁止根据常识、往年惯例或相似通知推测。
4. 每个非空字段必须给出 quote：从原文逐字复制的连续片段（不改写、不省略、不加省略号）。quote 必须能在原文中原样找到。
5. 活动时间 start_at 与报名/材料截止 due_at 必须分开：活动何时举行 → events[].start_at；何时之前要报名或交材料 → tasks[].due_at。绝不能把截止时间填进 start_at。
6. 相对时间（明天、下周三、本周五、15号、12号前）必须结合原文给出的参照日期换算：聊天记录的「界面日期」「消息时间戳」、通知的落款日期、参考基准日期都算参照日期。原文给了参照日期就必须换算成具体日期；确实没有任何参照时才填 null，并在 questions 里说明缺少什么参照。聊天记录里复述的活动时间（如「讲座还是15号上午9:30」）同样要填进 start_at，不要因为来自聊天就留空。
7. 时间用带时区的 ISO 8601，例如 2026-11-12T14:00:00+08:00；只知道日期用 2026-11-12，precision 填 "date"。原文没写年份时，参考基准日期或正文日期已给出年份就用该年份，否则不要自行补年份。
8. doc_type：notice=正式通知/公告；news=新闻或宣传报道；chat=聊天记录截图；mail=邮件；other=其他。
9. 新闻、宣传稿、纯介绍且无需用户行动的，actionable 填 false。
10. rules 只抽明确写出的规则条款，涉及扣分/取消资格/处分/费用/逾期后果时 impact 填 "high"。
11. 不要合并不同场次、不同届次、不同学院、不同年份的事项；同一场活动的不同来源信息应指向同一个事件。

输出 JSON 结构：
{
  "doc_type": "notice|news|chat|mail|other",
  "actionable": true,
  "summary": "一句话说明这份材料要求用户做什么",
  "anchor_date": "原文中出现的参照日期 ISO 或 null",
  "events": [{
    "title":    {"value": "活动名称", "quote": "原文片段"},
    "start_at": {"value": "ISO 或 null", "quote": "原文片段", "precision": "datetime|date|range"},
    "end_at":   {"value": null, "quote": null, "precision": null},
    "location": {"value": "地点", "quote": "原文片段"},
    "org":      {"value": "组织方", "quote": "原文片段"},
    "audience": {"value": "适用对象", "quote": "原文片段"}
  }],
  "tasks": [{
    "action": {"value": "要做什么", "quote": "原文片段"},
    "due_at": {"value": "ISO 或 null", "quote": "原文片段", "precision": "date|datetime"},
    "materials": [{"value": "材料名称", "quote": "原文片段"}],
    "submit_channel": {"value": "提交方式/入口", "quote": "原文片段"}
  }],
  "rules": [{"text": "条款原文", "impact": "high|normal", "quote": "原文片段"}],
  "questions": ["需要用户确认的问题"]
}"""

JUDGE_SYSTEM = """你在判断两份校园信息是否指向同一个事件。只输出 JSON。

判断依据：活动名称、组织方、时间、地点、材料要求。届次、年份、学院、场次不同则不是同一事件。

特别注意：
- 新信息可能只是简称（例如标题只有「讲座」），并带有变更说明。若原文明确说「地点改了」「时间改了」「还要交某材料」，且提到与已有事件相同的时间、旧地点或同一报名截止，应视为同一事件。
- 只有确实指向不同届次、不同学院、不同场次或不同活动时，才判为不是同一事件。

输出：
{"same_event": true|false, "reason": "一句话理由", "relation": "supplement|conflict|duplicate|unrelated"}

relation 含义：
- supplement：新信息补充了旧事件（新增材料、要求、入口）
- conflict：新信息改变了旧事件的字段（时间、地点等）
- duplicate：几乎完全相同
- unrelated：不是同一事件"""


# ---------------------------------------------------------------- 抽取与闸门


def _precision_from_quote(quote: str | None, given: str | None) -> str:
    if given in ("date", "datetime", "range"):
        return given
    if quote and re.search(r"\d{1,2}\s*[:：]\s*\d{2}|上午|下午|晚上|点", quote):
        return "datetime"
    return "date"


def gate_field(
    idx: QuoteIndex, fv: FieldValue, *, time_field: bool = False
) -> tuple[Any, str | None, tuple[int, int] | None, str | None]:
    """返回 (value, quote, span, status)。status=None 表示丢弃。

    quote 一律取原文切片，保证前端高亮位置与文字严格一致。
    """
    if fv.value is None:
        span = idx.find(fv.quote)
        if span:
            return None, idx.slice(span), span, "needs_anchor"
        return None, None, None, None
    span = idx.find(fv.quote)
    if not span:
        return None, fv.quote, None, "rejected"
    quote = idx.slice(span)
    if time_field:
        dt = parse_dt(fv.value)
        if dt is None:
            return None, quote, span, "rejected"
        precision = _precision_from_quote(fv.quote, fv.precision)
        return {"iso": dt.isoformat(), "precision": precision}, quote, span, "supported"
    return fv.value, quote, span, "supported"


# ---------------------------------------------------------------- 落库


def _persist(db: Session, source: Source, result: ExtractionResult, idx: QuoteIndex) -> Event | None:
    meta = dict(source.meta or {})
    meta["questions"] = result.questions
    meta["summary"] = result.summary
    meta["doc_type"] = result.doc_type
    meta["actionable"] = result.actionable
    source.meta = meta

    if not result.actionable and not result.events:
        source.status = "parsed"
        db.commit()
        return None

    def claim(entity_type: str, entity_id: str, field: str, fv: FieldValue, *, time_field=False):
        value, quote, span, status = gate_field(idx, fv, time_field=time_field)
        if status == "rejected":
            result.questions.append(f"「{fv.value}」在原文中找不到依据，已忽略")
        if status in (None,):
            return
        add_claim(
            db,
            entity_type=entity_type,
            entity_id=entity_id,
            field=field,
            value=value,
            source_id=source.id,
            quote=quote,
            quote_span=span,
            status=status,
        )

    event: Event | None = None
    if result.events:
        ex: ExtractedEvent = result.events[0]
        event = Event(title=ex.title.value or "未命名事件", org=settings.college_name)
        db.add(event)
        db.flush()
        for field in ("title", "location", "org", "audience"):
            claim("event", event.id, field, getattr(ex, field))
        claim("event", event.id, "start_at", ex.start_at, time_field=True)
        claim("event", event.id, "end_at", ex.end_at, time_field=True)
        refresh_event(db, event)

    task_objs: list[Task] = []
    for ex_task in result.tasks:
        ex_task: ExtractedTask
        if not ex_task.action.value:
            continue
        task = Task(action=ex_task.action.value, event_id=event.id if event else None)
        db.add(task)
        db.flush()
        claim("task", task.id, "action", ex_task.action)
        claim("task", task.id, "due_at", ex_task.due_at, time_field=True)
        claim("task", task.id, "submit_channel", ex_task.submit_channel)
        materials = [m.value for m in ex_task.materials if m.value and idx.find(m.quote)]
        spans = [s for m in ex_task.materials if m.value and (s := idx.find(m.quote))]
        if materials:
            span = (min(s[0] for s in spans), max(s[1] for s in spans))
            add_claim(
                db,
                entity_type="task",
                entity_id=task.id,
                field="materials",
                value=materials,
                source_id=source.id,
                quote=idx.slice(span),
                quote_span=span,
                status="supported",
            )
        refresh_task(db, task)
        task_objs.append(task)

    for ex_rule in result.rules:
        span = idx.find(ex_rule.quote)
        if not span:
            continue
        rule = Rule(
            event_id=event.id if event else None,
            text=ex_rule.text or ex_rule.quote,
            impact=ex_rule.impact,
            state="supported" if ex_rule.impact != "high" else "unconfirmed",
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
            quote=idx.slice(span),
            quote_span=span,
            status="supported",
        )

    source.status = "parsed"
    db.commit()
    return event


# ---------------------------------------------------------------- 关联


def term_key(title: str) -> str | None:
    year = re.search(r"20\d{2}", title)
    session = re.search(r"第[一二三四五六七八九十\d]+届|[春秋]季", title)
    grade = re.search(r"20\d{2}\s*级", title)
    parts = [m.group(0) if m else None for m in (year, session, grade)]
    joined = "|".join(p for p in parts if p)
    return joined or None


def title_similarity(a: str, b: str) -> float:
    """标题相似度：先算编辑距离比例，再处理「简称完整出现在正式标题里」的情况。

    群聊里常只写「讲座」「评选」这类简称，直接算字符比例会被长标题稀释（2/37≈5%），
    因此简称被完整包含时按覆盖率补足到 0.5 以上。是否同一事件仍由 LLM judge 最终判定。
    """

    def tight(value: str) -> str:
        return "".join(ch for ch in normalize(value) if ch.isalnum())

    a_n, b_n = tight(a), tight(b)
    if not a_n or not b_n:
        return 0.0
    ratio = SequenceMatcher(None, a_n, b_n).ratio()
    short, long = sorted((a_n, b_n), key=len)
    if len(short) >= 2 and short in long:
        return max(ratio, 0.5 + 0.5 * len(short) / len(long))
    return ratio


def find_candidates(db: Session, event: Event) -> list[tuple[Event, float, list[str]]]:
    others = db.scalars(
        select(Event).where(Event.id != event.id, Event.state.in_(("candidate", "confirmed")))
    ).all()
    out: list[tuple[Event, float, list[str]]] = []
    key = term_key(event.title)
    for other in others:
        other_key = term_key(other.title)
        if key and other_key and key != other_key:
            continue
        score, reasons = 0.0, []
        sim = title_similarity(event.title, other.title)
        if sim >= 0.45:
            score += 1
            reasons.append(f"标题相似度 {sim:.0%}")
        elif sim >= 0.3:
            reasons.append(f"标题部分相似 {sim:.0%}")
        if event.org and other.org and event.org == other.org:
            score += 1
            reasons.append("同一组织方")
        a_start, b_start = event.start_at, other.start_at
        if a_start and b_start and abs((a_start - b_start).days) <= 7:
            score += 1
            reasons.append("时间相近")
        if event.location and other.location and event.location == other.location:
            score += 1
            reasons.append("地点相同")
        if score >= 1 or sim >= 0.3:
            # 阈值只负责「进入候选」；是否为同一事件由后面的 LLM judge 最终判定
            out.append((other, score + sim, reasons))
    out.sort(key=lambda x: x[1], reverse=True)
    return out


def event_brief(event: Event) -> dict:
    return {
        "title": event.title,
        "org": event.org,
        "start_at": event.start_at.isoformat() if event.start_at else None,
        "location": event.location,
        "tasks": [{"action": t.action, "due_at": t.due_at.isoformat() if t.due_at else None} for t in event.tasks],
        "rules": [r.text for r in event.rules],
    }


async def judge_link(a: Event, b: Event, new_text: str | None = None) -> LinkJudge:
    content = f"已有事件：{event_brief(a)}\n\n新信息：{event_brief(b)}"
    if new_text:
        content += f"\n\n新信息来源原文（变更说明以此为准）：\n{new_text[:4000]}"
    messages = [
        {"role": "system", "content": JUDGE_SYSTEM},
        {"role": "user", "content": content},
    ]
    try:
        data = await llm.complete_json(messages, temperature=0)
        return LinkJudge(**data)
    except Exception:  # noqa: BLE001
        return LinkJudge(same_event=True, reason="标题与组织方高度相似", relation="supplement")


async def link_event(db: Session, event: Event, new_text: str | None = None) -> MergeCandidate | None:
    candidates = find_candidates(db, event)
    if not candidates:
        return None
    best, score, reasons = candidates[0]
    verdict = await judge_link(best, event, new_text)
    if not verdict.same_event:
        return None
    existing = db.scalar(
        select(MergeCandidate).where(
            MergeCandidate.event_a_id == best.id, MergeCandidate.event_b_id == event.id
        )
    )
    if existing:
        return existing
    mc = MergeCandidate(
        event_a_id=best.id,
        event_b_id=event.id,
        score=score,
        reasons=reasons + ([verdict.reason] if verdict.reason else []),
        state="pending",
    )
    db.add(mc)
    db.commit()
    return mc


# ---------------------------------------------------------------- 任务编排

INGEST_STEPS = [
    ("ocr", "识别截图"),
    ("extract", "整理事项"),
    ("link", "查找关联事件"),
    ("done", "等待确认"),
]


def _set_stage(job: Job, key: str, message: str | None = None, *, failed: bool = False) -> None:
    keys = [k for k, _ in INGEST_STEPS]
    cur = keys.index(key) if key in keys else len(keys) - 1
    steps = []
    for i, (k, label) in enumerate(INGEST_STEPS):
        state = "done" if i < cur else ("active" if i == cur else "todo")
        if failed and i == cur:
            state = "failed"
        steps.append({"key": k, "label": label, "state": state})
    job.stage = {"stage": key, "steps": steps, "message": message}


async def run_ingest(job_id: str) -> None:
    db: Session = SessionLocal()
    job = db.get(Job, job_id)
    if job is None:
        db.close()
        return
    try:
        job.state = "running"
        db.commit()
        source = db.get(Source, job.payload["source_id"])
        assert source is not None

        text = source.text
        if job.payload.get("has_image"):
            _set_stage(job, "ocr", "正在识别截图中的文字…")
            job.stage = {**(job.stage or {}), "stage": "ocr"}
            db.commit()
            image_path = MEDIA_DIR / (source.image_path or "")
            mime = (source.meta or {}).get("mime", "image/png")
            raw, mime = prepare_image(image_path.read_bytes(), mime)
            text = await llm.vision_transcribe(raw, mime, TRANSCRIBE_PROMPT)
            text = normalize(text)
            source.text = text
            db.commit()

        _set_stage(job, "extract", "正在整理事件、截止时间与材料…")
        db.commit()

        anchor = source.published_at.isoformat() if source.published_at else None
        user_content = (
            f"来源类型：{source.kind}\n"
            f"参考基准日期：{anchor or '未知（不要自行补年份或换算相对时间）'}\n"
            f"正文：\n{text}"
        )
        data = await llm.complete_json(
            [
                {"role": "system", "content": EXTRACT_SYSTEM},
                {"role": "user", "content": user_content},
            ]
        )
        result = ExtractionResult(**data)
        idx = QuoteIndex(text)
        event = _persist(db, source, result, idx)

        _set_stage(job, "link", "正在查找同一事件的其他来源…")
        db.commit()

        merge = await link_event(db, event, text) if event else None

        _set_stage(job, "done", "识别完成，等待确认")
        job.state = "done"
        job.result = {
            "source_id": source.id,
            "event_id": event.id if event else None,
            "merge_id": merge.id if merge else None,
            "summary": result.summary,
            "questions": result.questions,
            "doc_type": result.doc_type,
            "actionable": result.actionable,
        }
        db.commit()
    except Exception as e:  # noqa: BLE001
        db.rollback()
        job = db.get(Job, job_id)
        if job:
            job.state = "failed"
            job.last_error = str(e)[:800]
            _set_stage(job, (job.stage or {}).get("stage", "extract"), "处理失败", failed=True)
            db.commit()
    finally:
        db.close()


async def run_verify(job_id: str) -> None:
    from app.verify import verify_event, verify_url  # 避免循环导入

    db: Session = SessionLocal()
    job = db.get(Job, job_id)
    if job is None:
        db.close()
        return
    try:
        job.state = "running"
        by_url = job.type == "verify_url"
        job.stage = {
            "stage": "fetch" if by_url else "search",
            "steps": [
                {
                    "key": "search",
                    "label": "打开指定链接" if by_url else "检索官方来源",
                    "state": "done" if by_url else "active",
                },
                {"key": "fetch", "label": "读取原文", "state": "active" if by_url else "todo"},
                {"key": "judge", "label": "核对适用性", "state": "todo"},
            ],
        }
        db.commit()
        event = db.get(Event, job.payload["event_id"])
        assert event is not None
        if by_url:
            result = await verify_url(db, event, job, job.payload["url"])
        else:
            result = await verify_event(db, event, job)
        job.result = result
        job.state = "done"
        db.commit()
    except Exception as e:  # noqa: BLE001
        db.rollback()
        job = db.get(Job, job_id)
        if job:
            job.state = "failed"
            job.last_error = str(e)[:800]
            db.commit()
    finally:
        db.close()
