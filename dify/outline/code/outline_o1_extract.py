# O1X · 解析 O1 LLM 输出 → outline_summary + outline_json（仅 volumes）
#
# === Dify 输入 ===
#   o1_result         ← O1.text（必填其一）
#   structured_output   ← O1.structured_output（Structured Output 开启时强烈建议绑定）
#
# === Dify 输出（仅 2 项，勿多加）===
#   outline_summary → String
#   outline_json    → String

import json
import re
from typing import Any

THINK_RE = re.compile(
    r"<(?:redacted_)?think(?:ing)?>[\s\S]*?</(?:redacted_)?think(?:ing)?>",
    re.I,
)


def _strip_think(text: str) -> str:
    text = THINK_RE.sub("", text or "")
    low = text.lower()
    for tag in ("redacted_thinking", "thinking", "think"):
        open_tag = f"<{tag}>"
        idx = low.find(open_tag)
        if idx < 0:
            continue
        close_tag = f"</{tag}>"
        close_idx = low.find(close_tag, idx)
        if close_idx < 0:
            # 模型只输出未闭合思考块、无 JSON → 视为空
            return ""
        text = (text[:idx] + text[close_idx + len(close_tag) :]).strip()
        low = text.lower()
    return text.strip()


def _parse_llm_json(raw: Any) -> dict:
    if isinstance(raw, dict):
        return raw
    if raw is None:
        return {}
    text = _strip_think(str(raw).strip())
    if not text or text.lower() in ("null", "none", "{}"):
        return {}
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if len(lines) > 2 else lines).strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    if start < 0:
        return {}
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    parsed = json.loads(text[start : i + 1])
                    return parsed if isinstance(parsed, dict) else {}
                except json.JSONDecodeError:
                    return {}
    return {}


def _unwrap_root(parsed: dict) -> dict:
    if not isinstance(parsed, dict):
        return {}
    for key in (
        "structured_output",
        "structuredOutput",
        "output",
        "result",
        "data",
        "json",
    ):
        inner = parsed.get(key)
        if isinstance(inner, dict) and (
            "outline" in inner or "outline_summary" in inner or "volumes" in inner
        ):
            return inner
        if isinstance(inner, str) and inner.strip():
            nested = _unwrap_root(_parse_llm_json(inner))
            if nested:
                return nested
    return parsed


def _normalize_volumes_doc(parsed: dict) -> tuple[str, dict]:
    root = _unwrap_root(parsed)
    summary = str(root.get("outline_summary") or "").strip()
    outline = root.get("outline")
    if isinstance(outline, dict) and isinstance(outline.get("volumes"), list):
        return summary, outline
    if isinstance(root.get("volumes"), list):
        return summary, {"volumes": root["volumes"]}
    return summary, {"volumes": []}


def _count_chapters(doc: dict) -> int:
    n = 0
    for vol in doc.get("volumes") or []:
        if isinstance(vol, dict) and isinstance(vol.get("chapters"), list):
            n += len(vol["chapters"])
    return n


def _pick_o1_raw(kwargs: dict) -> Any:
    """优先选用含 chapters/beats 的一路；避免空 structured_output 覆盖有效 text。"""
    candidates: list[Any] = []
    for key in ("structured_output", "o1_result", "text", "o1_text"):
        val = kwargs.get(key)
        if val is None:
            continue
        if isinstance(val, str) and val.strip().lower() in ("null", "none", ""):
            continue
        candidates.append(val)

    best: Any = ""
    for val in candidates:
        _, doc = _normalize_volumes_doc(_parse_llm_json(val))
        if _count_chapters(doc) > 0:
            return val
        if not best and val not in ({}, []):
            best = val
    return best


def main(**kwargs: Any) -> dict:
    raw = _pick_o1_raw(kwargs)
    parsed = _parse_llm_json(raw)
    summary, doc = _normalize_volumes_doc(parsed)

    if _count_chapters(doc) == 0:
        for key in ("structured_output", "o1_result", "text", "o1_text"):
            val = kwargs.get(key)
            if val is None or val == raw:
                continue
            if isinstance(val, str) and val.strip().lower() in ("null", "none", ""):
                continue
            alt_summary, alt_doc = _normalize_volumes_doc(_parse_llm_json(val))
            if _count_chapters(alt_doc) > 0:
                summary, doc = alt_summary or summary, alt_doc
                break

    return {
        "outline_summary": summary,
        "outline_json": json.dumps(doc, ensure_ascii=False),
    }
