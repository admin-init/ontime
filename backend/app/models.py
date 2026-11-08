"""到点 · 数据模型 v0.2（SQLAlchemy 2.0）

三条约定，违反任何一条都会让「字段级溯源」失效：

1. claim 是唯一事实来源。event / task / rule 上的语义字段只是「当前视图」，
   只能通过 app/services/claims.py 的 append_claim() 写入，不允许直接赋值。
2. 枚举用 str 存（SQLite 无原生 enum），在 Pydantic 层用 StrEnum 收口；
   JSON 用 SQLAlchemy 的 JSON（SQLite 存 TEXT，Postgres 可换 jsonb）。
3. 所有时间列使用 UtcDateTime：写入必须带时区并统一转 UTC，读出补回 UTC。
   展示层按 profile.timezone 转换，业务层永远只面对 UTC。
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UtcDateTime(TypeDecorator[datetime]):
    """SQLite 不保存时区信息：写入统一转 UTC 去 tzinfo，读出补回 UTC。

    naive datetime 直接抛错，避免「上传时间」这类本地时间被当作 UTC 静默入库。
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime is not allowed, use utcnow()")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------- 用户与来源配置


class Profile(Base):
    """单用户原型。多用户时加 user 表并在此挂 user_id。"""

    __tablename__ = "profile"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default="me")
    school: Mapped[str | None] = mapped_column(String(128))
    college: Mapped[str | None] = mapped_column(String(128))
    grade: Mapped[str | None] = mapped_column(String(32))
    # ["本科生", "2024级"]，决定规则是否适用于「我」
    audience: Mapped[list[str]] = mapped_column(JSON, default=list)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Shanghai")
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow, onupdate=utcnow)


class WatchTarget(Base):
    """官网栏目 / 邮箱的抓取配置。"""

    __tablename__ = "watch_target"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(8))  # web | mail
    name: Mapped[str] = mapped_column(String(128))
    url: Mapped[str | None] = mapped_column(Text)
    # 列表页文章链接选择器；为空时走标题相似度兜底
    selector: Mapped[str | None] = mapped_column(Text)
    cron: Mapped[str | None] = mapped_column(String(64))
    enabled: Mapped[bool] = mapped_column(default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    last_error: Mapped[str | None] = mapped_column(Text)
    # never | ok | partial | failed
    last_status: Mapped[str] = mapped_column(String(16), default="never")
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)

    sources: Mapped[list["Source"]] = relationship(back_populates="watch_target")
    sync_runs: Mapped[list["SyncRun"]] = relationship(
        back_populates="target", cascade="all, delete-orphan"
    )


class SyncRun(Base):
    """一次官网同步的审计记录：找到/新建/变更/失败各多少。"""

    __tablename__ = "sync_run"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    target_id: Mapped[str] = mapped_column(
        ForeignKey("watch_target.id", ondelete="CASCADE"), index=True
    )
    started_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    status: Mapped[str] = mapped_column(String(16), default="running")  # running|ok|partial|failed
    found: Mapped[int] = mapped_column(Integer, default=0)
    created: Mapped[int] = mapped_column(Integer, default=0)
    changed: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)

    target: Mapped[WatchTarget] = relationship(back_populates="sync_runs")

    __table_args__ = (Index("ix_sync_run_target_started", "target_id", "started_at"),)


class Site(Base):
    """自定义站点：只用于订阅列表页与核实时附加 site:domain，不做登录/脚本。"""

    __tablename__ = "site"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(128))
    domain: Mapped[str] = mapped_column(String(255), unique=True)
    kind: Mapped[str] = mapped_column(String(8), default="web")  # web | api
    list_url: Mapped[str | None] = mapped_column(Text)
    search_url: Mapped[str | None] = mapped_column(Text)
    # kind="api" 时使用；api_key 只写 ~/.ontime/sites.json，不入库
    api_url: Mapped[str | None] = mapped_column(Text)
    # 列表/正文选择器：由 agent 调研或手动填写
    item_selector: Mapped[str | None] = mapped_column(Text)
    title_selector: Mapped[str | None] = mapped_column(Text)
    content_selector: Mapped[str | None] = mapped_column(Text)
    profile_source: Mapped[str | None] = mapped_column(String(8))  # manual | agent
    # 是否用真实抓取验证过；API 源没有真实 Key 时保持 false
    verified: Mapped[bool] = mapped_column(default=False)
    enabled: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)


class Source(Base):
    """一条来源记录：网页 / 邮件 / 截图 / 文本 / 链接。"""

    __tablename__ = "source"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(16), index=True)
    title: Mapped[str | None] = mapped_column(String(512))
    org: Mapped[str | None] = mapped_column(String(128))
    url: Mapped[str | None] = mapped_column(Text)
    message_id: Mapped[str | None] = mapped_column(String(512))

    # 归一化后的正文：Claim.quote 的唯一校验基准
    text: Mapped[str] = mapped_column(Text, default="")

    # storage/ 下的原文快照（HTML / EML），不入 git
    raw_path: Mapped[str | None] = mapped_column(Text)
    raw_hash: Mapped[str | None] = mapped_column(String(64))
    image_path: Mapped[str | None] = mapped_column(Text)

    published_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    status: Mapped[str] = mapped_column(String(16), default="ready")  # ready | parsed | failed
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    watch_target_id: Mapped[str | None] = mapped_column(
        ForeignKey("watch_target.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)

    watch_target: Mapped[WatchTarget | None] = relationship(back_populates="sources")
    # 用户删除来源时级联删除其 Claim（字段回到待确认），change 表另行留痕
    claims: Mapped[list["Claim"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )
    runs: Mapped[list["PipelineRun"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("kind", "message_id", name="uq_source_kind_message_id"),
        Index("ix_source_org_published", "org", "published_at"),
    )


class PipelineRun(Base):
    """每次解析的审计记录：阶段、耗时、模型原始输出。"""

    __tablename__ = "pipeline_run"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    source_id: Mapped[str | None] = mapped_column(
        ForeignKey("source.id", ondelete="CASCADE")
    )
    stage: Mapped[str] = mapped_column(String(16))  # ingest|text|extract|gate|link|verify
    status: Mapped[str] = mapped_column(String(16))  # running|ok|failed|needs_review
    provider: Mapped[str | None] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(64))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    # 模型原始 JSON：回放、排查、答辩时「它到底看到了什么」
    output: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)

    source: Mapped[Source | None] = relationship(back_populates="runs")

    __table_args__ = (Index("ix_pipeline_run_source_stage", "source_id", "stage"),)


# ---------------------------------------------------------------- 业务对象


class Event(Base):
    """活动：有开始/结束时间的事项。"""

    __tablename__ = "event"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(512))
    description: Mapped[str | None] = mapped_column(Text)
    org: Mapped[str | None] = mapped_column(String(128))
    audience: Mapped[str | None] = mapped_column(String(256))
    location: Mapped[str | None] = mapped_column(String(256))

    start_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    end_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    # date | datetime | range —— 「11月10日前」不该显示成 23:59
    start_precision: Mapped[str | None] = mapped_column(String(16))
    end_precision: Mapped[str | None] = mapped_column(String(16))

    state: Mapped[str] = mapped_column(
        String(16), default="candidate"
    )  # candidate|confirmed|ignored|merged

    merged_into_id: Mapped[str | None] = mapped_column(
        ForeignKey("event.id", ondelete="SET NULL")
    )
    merged_into: Mapped[Event | None] = relationship(
        back_populates="merged_from", remote_side=[id]
    )
    merged_from: Mapped[list[Event]] = relationship(back_populates="merged_into")

    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow, onupdate=utcnow)

    tasks: Mapped[list["Task"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )
    rules: Mapped[list["Rule"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_event_start_state", "start_at", "state"),)


class Task(Base):
    """要做的动作。due_at 与 Event.start_at 永不共用字段。"""

    __tablename__ = "task"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str | None] = mapped_column(ForeignKey("event.id", ondelete="CASCADE"))
    action: Mapped[str] = mapped_column(String(512))
    due_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    due_precision: Mapped[str | None] = mapped_column(String(16))
    materials: Mapped[list[str]] = mapped_column(JSON, default=list)
    submit_channel: Mapped[str | None] = mapped_column(String(256))
    prerequisites: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(16), default="open")  # open|done|dismissed
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow, onupdate=utcnow)

    event: Mapped[Event | None] = relationship(back_populates="tasks")
    reminders: Mapped[list["Reminder"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_task_due_state", "due_at", "state"),)


class Rule(Base):
    """规则条款：资格、格式、逾期后果。impact=high 的要过门槛才显示。"""

    __tablename__ = "rule"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str | None] = mapped_column(ForeignKey("event.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    scope: Mapped[str | None] = mapped_column(Text)
    valid_from: Mapped[datetime | None] = mapped_column(UtcDateTime)
    valid_to: Mapped[datetime | None] = mapped_column(UtcDateTime)
    impact: Mapped[str] = mapped_column(String(8), default="normal")  # normal | high
    state: Mapped[str] = mapped_column(
        String(16), default="unconfirmed"
    )  # unconfirmed|supported|conflict|user_confirmed
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)

    event: Mapped[Event | None] = relationship(back_populates="rules")

    __table_args__ = (Index("ix_rule_impact_state", "impact", "state"),)


# ---------------------------------------------------------------- 证据层


class Claim(Base):
    """字段级断言：某实体的某字段的某候选值，出自哪条来源的哪句原文。

    entity_type + entity_id 是多态关联，刻意不加外键；由 services/claims.py 保证一致性。
    """

    __tablename__ = "claim"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    entity_type: Mapped[str] = mapped_column(String(16))  # event | task | rule
    entity_id: Mapped[str] = mapped_column(String(32))
    field: Mapped[str] = mapped_column(String(64))

    # JSON 编码的候选值；null 表示「该字段被明确清空」
    value: Mapped[Any | None] = mapped_column(JSON)

    source_id: Mapped[str] = mapped_column(
        ForeignKey("source.id", ondelete="CASCADE"), index=True
    )
    quote: Mapped[str | None] = mapped_column(Text)
    quote_start: Mapped[int | None] = mapped_column(Integer)
    quote_end: Mapped[int | None] = mapped_column(Integer)

    # unverified | supported | conflict | insufficient | needs_anchor
    # | user_confirmed | rejected | stale
    status: Mapped[str] = mapped_column(String(16), default="unverified")
    origin: Mapped[str] = mapped_column(String(8), default="model")  # model|user|rule|import
    confidence: Mapped[float | None] = mapped_column(Float)

    decided_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    decided_by: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)

    source: Mapped[Source] = relationship(back_populates="claims")
    changes: Mapped[list["Change"]] = relationship(back_populates="claim")

    __table_args__ = (
        Index("ix_claim_entity", "entity_type", "entity_id", "field", "status"),
    )


class Change(Base):
    """字段变更提案。合并与更新都可撤销，因此这里只记录，不直接改视图。"""

    __tablename__ = "change"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    entity_type: Mapped[str] = mapped_column(String(16))
    entity_id: Mapped[str] = mapped_column(String(32))
    field: Mapped[str] = mapped_column(String(64))
    old_value: Mapped[Any | None] = mapped_column(JSON)
    new_value: Mapped[Any | None] = mapped_column(JSON)
    claim_id: Mapped[str | None] = mapped_column(ForeignKey("claim.id", ondelete="SET NULL"))
    reason: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str] = mapped_column(
        String(16), default="pending"
    )  # pending | acknowledged | rejected
    detected_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)

    claim: Mapped[Claim | None] = relationship(back_populates="changes")

    __table_args__ = (Index("ix_change_state_detected", "state", "detected_at"),)


class MergeCandidate(Base):
    """两条事件是否同一件事：先确定性守卫，再模型复核，最终用户点。"""

    __tablename__ = "merge_candidate"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_a_id: Mapped[str] = mapped_column(ForeignKey("event.id", ondelete="CASCADE"))
    event_b_id: Mapped[str] = mapped_column(ForeignKey("event.id", ondelete="CASCADE"))
    score: Mapped[float] = mapped_column(Float)
    # 判定理由，UI 直接展示，保证可解释
    reasons: Mapped[list[str]] = mapped_column(JSON, default=list)
    state: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)

    __table_args__ = (UniqueConstraint("event_a_id", "event_b_id", name="uq_merge_pair"),)


# ---------------------------------------------------------------- 调度


class Job(Base):
    """后台任务队列：几十条量级，进程内轮询足够。"""

    __tablename__ = "job"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    type: Mapped[str] = mapped_column(String(16))  # crawl|parse|verify|verify_url|mail_sync|remind
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    run_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    state: Mapped[str] = mapped_column(String(16), default="queued")
    # 给前端轮询用的阶段信息：{"stage": "...", "steps": [{key,label,state}], "message": "..."}
    stage: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    # 任务产出（核实结果等），避免再建一张表
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)

    __table_args__ = (Index("ix_job_state_run_at", "state", "run_at"),)


class Reminder(Base):
    __tablename__ = "reminder"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    task_id: Mapped[str | None] = mapped_column(ForeignKey("task.id", ondelete="CASCADE"))
    event_id: Mapped[str | None] = mapped_column(ForeignKey("event.id", ondelete="CASCADE"))
    fire_at: Mapped[datetime] = mapped_column(UtcDateTime)
    channel: Mapped[str] = mapped_column(String(8), default="inapp")  # ics | inapp
    state: Mapped[str] = mapped_column(String(16), default="scheduled")
    sent_at: Mapped[datetime | None] = mapped_column(UtcDateTime)

    task: Mapped[Task | None] = relationship(back_populates="reminders")

    __table_args__ = (Index("ix_reminder_state_fire", "state", "fire_at"),)
