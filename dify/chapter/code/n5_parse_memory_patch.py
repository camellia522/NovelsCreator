# N5 · 从 LLM 原始 text 解析 memory_patch（剥离 redacted_thinking / markdown 代码块）
# 输入：text（N5 LLM 输出）或 memory_patch（已结构化时可透传）
# 输出：memory_patch（dict）、memory_patch_json（字符串，供 END/PARSE 绑定）

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


def main(text: str = "", memory_patch: Any = "", **kwargs: Any) -> dict:
    raw = memory_patch if memory_patch not in (None, "", {}) else text
    patch = parse_memory_patch(raw)
    return {
        "memory_patch": patch,
        "memory_patch_json": json.dumps(patch, ensure_ascii=False),
    }
