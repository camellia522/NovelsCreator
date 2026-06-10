# END_OK · Success Output Assembler
# 输入：novel_body, video_script, memory_patch, retry_count, outline_valid, lore_valid
# memory_patch：N5 结构化 dict、JSON 字符串，或含 redacted_thinking 的 LLM text

import json
import re
from typing import Any, Union

THINK_RE = re.compile(r"<(?:redacted_)?think>[\s\S]*?</(?:redacted_)?think>", re.I)


def strip_think(text: str) -> str:
    return THINK_RE.sub("", text or "").strip()


def extract_json_object(text: str) -> dict:
    s = strip_think(text).strip()
    if not s:
        return {}
    if s.startswith("```"):
        lines = s.split("\n")
        s = "\n".join(lines[1:-1] if len(lines) > 2 else lines).strip()
    start = s.find("{")
    if start < 0:
        return {}
    depth = 0
    for i in range(start, len(s)):
        ch = s[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    parsed = json.loads(s[start : i + 1])
                    return parsed if isinstance(parsed, dict) else {}
                except json.JSONDecodeError:
                    return {}
    return {}


def parse_memory_patch(raw: Union[str, dict, None]) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        if raw.get("chapterSummary") or raw.get("globalSummaryDelta") or raw.get("foreshadowingUpdates"):
            return raw
        inner = raw.get("text")
        if isinstance(inner, str) and inner.strip():
            return extract_json_object(inner)
        return raw
    text = str(raw).strip()
    if not text:
        return {}
    if text.startswith("{"):
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else extract_json_object(text)
        except json.JSONDecodeError:
            return extract_json_object(text)
    return extract_json_object(text)


def main(
    novel_body: str = "",
    video_script: str = "",
    memory_patch: Any = "",
    retry_count: int = 0,
    outline_valid: bool = True,
    lore_valid: bool = True,
    **kwargs: Any,
) -> dict:
    patch = parse_memory_patch(memory_patch)
    end_outputs = {
        "status": "success",
        "circuit_break": False,
        "human_action_required": False,
        "retry_count": retry_count,
        "novel_body": novel_body or "",
        "video_script": video_script or "",
        "memory_patch": patch,
        "validation_report": {
            "outline_valid": outline_valid,
            "lore_valid": lore_valid,
            "issues": [],
        },
        "workflow_version": "novel-chapter-generation-v1.1",
    }
    return {"end_outputs": json.dumps(end_outputs, ensure_ascii=False)}
