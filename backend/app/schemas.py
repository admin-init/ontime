from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------- 模型输出契约


class FieldValue(BaseModel):
    """模型给出的单个字段值。quote 是原文连续片段，由校验闸门验证。"""

    value: str | None = None
    quote: str | None = None
    precision: Literal["date", "datetime", "range"] | None = None
    needs_clarification: bool = False


class ExtractedEvent(BaseModel):
    title: FieldValue = Field(default_factory=FieldValue)
    start_at: FieldValue = Field(default_factory=FieldValue)
    end_at: FieldValue = Field(default_factory=FieldValue)
    location: FieldValue = Field(default_factory=FieldValue)
    org: FieldValue = Field(default_factory=FieldValue)
    audience: FieldValue = Field(default_factory=FieldValue)

    @field_validator("title", "start_at", "end_at", "location", "org", "audience", mode="before")
    @classmethod
    def _none_as_empty(cls, value: Any) -> Any:
        """模型偶尔对未填字段直接返回 null；语义等同空字段，不让整个任务失败。"""
        return {} if value is None else value


class ExtractedTask(BaseModel):
    action: FieldValue = Field(default_factory=FieldValue)
    due_at: FieldValue = Field(default_factory=FieldValue)
    materials: list[FieldValue] = Field(default_factory=list)
    submit_channel: FieldValue = Field(default_factory=FieldValue)

    @field_validator("action", "due_at", "submit_channel", mode="before")
    @classmethod
    def _none_as_empty(cls, value: Any) -> Any:
        return {} if value is None else value

    @field_validator("materials", mode="before")
    @classmethod
    def _none_as_empty_list(cls, value: Any) -> Any:
        return [] if value is None else value


class ExtractedRule(BaseModel):
    text: str = ""
    impact: Literal["high", "normal"] = "normal"
    quote: str = ""

    @field_validator("text", "quote", mode="before")
    @classmethod
    def _none_as_blank(cls, value: Any) -> Any:
        return "" if value is None else value

    @field_validator("impact", mode="before")
    @classmethod
    def _none_as_normal(cls, value: Any) -> Any:
        return "normal" if value is None else value


class ExtractionResult(BaseModel):
    doc_type: Literal["notice", "news", "chat", "mail", "other"] = "other"
    actionable: bool = True
    summary: str = ""
    anchors: list[dict[str, Any]] = Field(default_factory=list)
    events: list[ExtractedEvent] = Field(default_factory=list)
    tasks: list[ExtractedTask] = Field(default_factory=list)
    rules: list[ExtractedRule] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------- 核实契约


class Finding(BaseModel):
    field: Literal["start_at", "end_at", "location", "audience", "due_at", "materials", "submit_channel", "rule"]
    value: str
    quote: str
    impact: Literal["high", "normal"] = "normal"


class JudgeResult(BaseModel):
    applies: Literal["yes", "no", "unknown"] = "unknown"
    reason: str = ""
    findings: list[Finding] = Field(default_factory=list)
    high_impact_note: str | None = None


# ---------------------------------------------------------------- 关联判断


class LinkJudge(BaseModel):
    same_event: bool = False
    reason: str = ""
    relation: Literal["supplement", "conflict", "duplicate", "unrelated"] = "unrelated"


# ---------------------------------------------------------------- API 视图


class ClaimView(BaseModel):
    id: str
    value: str | None
    display: str | None
    status: str
    origin: str
    quote: str | None
    quote_start: int | None = None
    quote_end: int | None = None
    source: dict[str, Any] | None = None
    created_at: str | None = None


class FieldView(BaseModel):
    key: str
    label: str
    value: str | None
    display: str | None
    status: str  # supported | conflict | needs_anchor | unconfirmed | user_confirmed
    precision: str | None = None
    claims: list[ClaimView] = Field(default_factory=list)


class TaskView(BaseModel):
    id: str
    action: str
    due_at: str | None
    due_display: str | None
    precision: str | None
    materials: list[str]
    submit_channel: str | None
    state: str
    fields: list[FieldView] = Field(default_factory=list)
