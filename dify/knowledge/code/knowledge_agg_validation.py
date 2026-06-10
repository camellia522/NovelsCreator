# AGG · Knowledge Validation Aggregate + Route
#
# 输入: validate_result, retry_count, max_retry, knowledge_json
# 输出: route, retry_count, retry_issues_formatted, knowledge_valid, validation_report, knowledge_json

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
    if not text or text.lower() in ("null", "none"):
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
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            pass
    return {}


def _to_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes")
    if isinstance(value, (int, float)):
        return value != 0
    return bool(value)


def _normalize_knowledge_json(raw: Any) -> str:
    if raw is None:
        return "{}"
    if isinstance(raw, dict):
        return json.dumps(raw, ensure_ascii=False)
    text = str(raw).strip()
    if not text or text.lower() in ("null", "none"):
        return "{}"
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return json.dumps(parsed, ensure_ascii=False)
    except json.JSONDecodeError:
        pass
    parsed = _parse_llm_json(text)
    if isinstance(parsed.get("knowledge"), dict):
        k = parsed["knowledge"]
        return json.dumps(
            {
                "world": k.get("world") or {},
                "characters": k.get("characters") or [],
                "factions": k.get("factions") or [],
                "items": k.get("items") or [],
            },
            ensure_ascii=False,
        )
    return json.dumps(
        {
            "world": parsed.get("world") or {},
            "characters": parsed.get("characters") or [],
            "factions": parsed.get("factions") or [],
            "items": parsed.get("items") or [],
        },
        ensure_ascii=False,
    )


def _structure_ok(knowledge_json: str) -> bool:
    try:
        doc = json.loads(knowledge_json)
    except json.JSONDecodeError:
        return False
    if not isinstance(doc, dict):
        return False
    world = doc.get("world") if isinstance(doc.get("world"), dict) else {}
    title = str(world.get("title") or "").strip()
    rules = str(world.get("rules") or "").strip()
    if not title and len(rules) < 20:
        return False
    named = 0
    for c in doc.get("characters") or []:
        if isinstance(c, dict) and str(c.get("name") or "").strip():
            named += 1
    return named >= 1


def _empty_outputs(retry_count: int = 0, knowledge_json: str = "{}") -> dict:
    return {
        "route": "retry",
        "retry_count": retry_count,
        "retry_issues_formatted": "- [hard] global: K2 未返回有效校验 JSON",
        "knowledge_valid": False,
        "validation_report": "{}",
        "knowledge_json": knowledge_json,
    }


def _k1x_empty_outputs(retry_count: int, max_retry: int, knowledge_json: str) -> dict:
    issue = (
        "- [hard] global: K1X knowledge_json 无有效 world/characters。"
        "请检查 K1 Structured Output 与 K1X 绑定。"
    )
    new_retry = retry_count + 1 if retry_count < max_retry else retry_count
    route = "retry" if retry_count < max_retry else "circuit_break"
    report = {
        "knowledge_valid": False,
        "knowledge_issues": [
            {"severity": "hard", "location": "global", "message": issue}
        ],
    }
    return {
        "route": route,
        "retry_count": int(new_retry),
        "retry_issues_formatted": issue,
        "knowledge_valid": False,
        "validation_report": json.dumps(report, ensure_ascii=False),
        "knowledge_json": knowledge_json,
    }


def main(**kwargs: Any) -> dict:
    try:
        validate_result = kwargs.get("validate_result") or kwargs.get("text") or "{}"
        knowledge_json = _normalize_knowledge_json(kwargs.get("knowledge_json") or "{}")
        retry_count = _to_int(kwargs.get("retry_count"), 0)
        max_retry = _to_int(kwargs.get("max_retry"), 3)

        if not _structure_ok(knowledge_json):
            return _k1x_empty_outputs(retry_count, max_retry, knowledge_json)

        v = _parse_llm_json(validate_result)
        if not v:
            out = _empty_outputs(retry_count, knowledge_json)
            if retry_count >= max_retry:
                out["route"] = "circuit_break"
            else:
                out["retry_count"] = retry_count + 1
            return out

        valid = _as_bool(v.get("knowledge_valid", False))
        issues = v.get("knowledge_issues") or []

        if valid:
            route = "continue"
            new_retry = retry_count
        elif retry_count < max_retry:
            route = "retry"
            new_retry = retry_count + 1
        else:
            route = "circuit_break"
            new_retry = retry_count

        formatted = []
        for item in issues[:12]:
            if isinstance(item, dict):
                formatted.append(
                    f"- [{item.get('severity', 'warn')}] {item.get('location', '')}: {item.get('message', '')}"
                )
            else:
                formatted.append(f"- {item}")

        return {
            "route": route,
            "retry_count": int(new_retry),
            "retry_issues_formatted": "\n".join(formatted),
            "knowledge_valid": bool(valid),
            "validation_report": json.dumps(v, ensure_ascii=False),
            "knowledge_json": knowledge_json,
        }
    except Exception:
        return _empty_outputs(_to_int(kwargs.get("retry_count"), 0))
