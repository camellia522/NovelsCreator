# RE · Outline Client Retry Handoff（方案 B：Dify 不回连 O1）

import json
from typing import Any


def _as_json_str(raw: Any, fallback: str = "{}") -> str:
    if raw is None:
        return fallback
    if isinstance(raw, dict):
        return json.dumps(raw, ensure_ascii=False)
    text = str(raw).strip()
    return text or fallback


def _to_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _parse_json(raw: Any) -> dict:
    if isinstance(raw, dict):
        return raw
    text = str(raw or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _extract_summary(outline_json: Any, outline_summary: str) -> str:
    if outline_summary.strip():
        return outline_summary.strip()
    parsed = _parse_json(outline_json)
    return str(parsed.get("outline_summary") or "").strip()


def _compact_volumes_json(raw: Any) -> str:
    """仅输出 { volumes }；误传 O1 长文本时回落为空 volumes。"""
    parsed = _parse_json(raw)
    outline = parsed.get("outline")
    if isinstance(outline, dict) and isinstance(outline.get("volumes"), list):
        return json.dumps(outline, ensure_ascii=False)
    if isinstance(parsed.get("volumes"), list):
        return json.dumps({"volumes": parsed["volumes"]}, ensure_ascii=False)
    return json.dumps({"volumes": []}, ensure_ascii=False)


def main(**kwargs: Any) -> dict:
    outline_json = _compact_volumes_json(kwargs.get("outline_json") or "{}")
    outline_summary = _extract_summary(outline_json, str(kwargs.get("outline_summary") or ""))
    retry_count = _to_int(kwargs.get("retry_count"), 0)
    retry_issues_formatted = str(kwargs.get("retry_issues_formatted") or "")
    validation_report = kwargs.get("validation_report") or "{}"

    end_outputs = {
        "status": "retry",
        "circuit_break": False,
        "human_action_required": False,
        "retry_count": retry_count,
        "outline_summary": outline_summary,
        "outline_json": outline_json,
        "retry_issues_formatted": retry_issues_formatted,
        "validation_report": _as_json_str(validation_report, "{}"),
        "workflow_version": "novel-outline-generation-v1",
    }
    return {"end_outputs": json.dumps(end_outputs, ensure_ascii=False)}
