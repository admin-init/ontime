from __future__ import annotations

import asyncio
import base64
import json
import re
from typing import Any

import httpx

from app.core import settings


class LLMError(RuntimeError):
    pass


def _strip_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1]
    return text


def parse_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(_strip_json(text))
    except json.JSONDecodeError as e:  # noqa: TRY003
        raise LLMError(f"模型返回的不是合法 JSON: {text[:200]}") from e


async def _post(payload: dict[str, Any], timeout: float) -> str:
    key = settings.resolved_key
    if not key:
        raise LLMError("未配置模型 Key：请设置 LLM_API_KEY 或写入 ~/.ontime/llm_key")
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            f"{settings.llm_base_url.rstrip('/')}/chat/completions", headers=headers, json=payload
        )
    if r.status_code >= 400:
        raise LLMError(f"模型调用失败 {r.status_code}: {r.text[:300]}")
    data = r.json()
    try:
        return data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError) as e:
        raise LLMError(f"模型返回结构异常: {str(data)[:300]}") from e


async def complete_json(
    messages: list[dict[str, Any]], *, temperature: float = 0.1, json_mode: bool = True
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 4000,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    # 空响应、非法 JSON、5xx 都可能偶发：最多重试 3 次，仍失败就把真实错误抛给调用方
    last_error: LLMError | None = None
    for attempt in range(1, 4):
        try:
            text = await _post(payload, settings.llm_timeout)
            if not text.strip():
                raise LLMError("模型返回空内容")
            return parse_json(text)
        except LLMError as e:
            last_error = e
            if "response_format" in str(e) and "response_format" in payload:
                payload.pop("response_format", None)
                continue
            if "未配置模型 Key" in str(e) or attempt == 3:
                raise
            await asyncio.sleep(1.5 * attempt)
    raise last_error or LLMError("模型调用失败")


async def vision_transcribe(image: bytes, mime: str, prompt: str) -> str:
    b64 = base64.b64encode(image).decode()
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ],
        }
    ]
    payload = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": 0,
        "max_tokens": 4000,
    }
    last_error: LLMError | None = None
    for attempt in range(1, 4):
        try:
            text = await _post(payload, settings.llm_timeout)
            if text.strip():
                return text
            last_error = LLMError("视觉模型返回空内容")
        except LLMError as e:
            last_error = e
            if "未配置模型 Key" in str(e):
                raise
        if attempt < 3:
            await asyncio.sleep(1.5 * attempt)
    raise last_error or LLMError("视觉模型调用失败")


async def ping() -> dict[str, Any]:
    try:
        data = await complete_json(
            [{"role": "user", "content": '只输出 JSON：{"ok": true}'}], temperature=0
        )
        return {"ok": bool(data.get("ok")), "model": settings.llm_model}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "model": settings.llm_model, "error": str(e)}
