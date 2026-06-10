# K1X · 解析 K1 LLM 输出 → knowledge_summary + knowledge_json
#
# === Dify 输入 ===
#   k1_result         ← K1.text（必填其一）
#   structured_output ← K1.structured_output
#
# === Dify 输出 ===
#   knowledge_summary → String
#   knowledge_json    → String  （仅 { world, characters, factions, items }）

import json
import re
from typing import Any

THINK_RE = re.compile(
    r"<(?:redacted_)?think(?:ing)?>[\s\S]*?</(?:redacted_)?think(?:ing)?>",
    re.I,
)


def _strip_think(text: str) -> str:
    return THINK_RE.sub("", text or "").strip()


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
    for key in ("structured_output", "structuredOutput", "output", "result", "data", "json"):
        inner = parsed.get(key)
        if isinstance(inner, dict):
            return inner
        if isinstance(inner, str) and inner.strip():
            nested = _unwrap_root(_parse_llm_json(inner))
            if nested:
                return nested
    if isinstance(parsed.get("knowledge"), dict):
        return parsed
    return parsed


def _normalize_knowledge_doc(parsed: dict) -> tuple[str, dict]:
    root = _unwrap_root(parsed)
    summary = str(root.get("knowledge_summary") or "").strip()
    knowledge = root.get("knowledge")
    if isinstance(knowledge, dict):
        doc = {
            "world": knowledge.get("world") if isinstance(knowledge.get("world"), dict) else {},
            "characters": knowledge.get("characters") if isinstance(knowledge.get("characters"), list) else [],
            "factions": knowledge.get("factions") if isinstance(knowledge.get("factions"), list) else [],
            "items": knowledge.get("items") if isinstance(knowledge.get("items"), list) else [],
        }
        return summary, doc
    doc = {
        "world": root.get("world") if isinstance(root.get("world"), dict) else {},
        "characters": root.get("characters") if isinstance(root.get("characters"), list) else [],
        "factions": root.get("factions") if isinstance(root.get("factions"), list) else [],
        "items": root.get("items") if isinstance(root.get("items"), list) else [],
    }
    return summary, doc


def _count_named_characters(doc: dict) -> int:
    n = 0
    for c in doc.get("characters") or []:
        if isinstance(c, dict) and str(c.get("name") or "").strip():
            n += 1
    return n


def _pick_k1_raw(kwargs: dict) -> Any:
    candidates: list[Any] = []
    for key in ("structured_output", "k1_result", "text", "k1_text"):
        val = kwargs.get(key)
        if val is None:
            continue
        if isinstance(val, str) and val.strip().lower() in ("null", "none", ""):
            continue
        candidates.append(val)
    best: Any = ""
    for val in candidates:
        _, doc = _normalize_knowledge_doc(_parse_llm_json(val))
        if _count_named_characters(doc) > 0:
            return val
        if not best and val not in ({}, []):
            best = val
    return best


def main(**kwargs: Any) -> dict:
    raw = _pick_k1_raw(kwargs)
    parsed = _parse_llm_json(raw)
    summary, doc = _normalize_knowledge_doc(parsed)

    if _count_named_characters(doc) == 0:
        for key in ("structured_output", "k1_result", "text", "k1_text"):
            val = kwargs.get(key)
            if val is None or val == raw:
                continue
            alt_summary, alt_doc = _normalize_knowledge_doc(_parse_llm_json(val))
            if _count_named_characters(alt_doc) > 0:
                summary, doc = alt_summary or summary, alt_doc
                break

    return {
        "knowledge_summary": summary,
        "knowledge_json": json.dumps(doc, ensure_ascii=False),
    }
