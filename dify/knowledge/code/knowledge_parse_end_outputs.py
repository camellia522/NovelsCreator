# PARSE · Knowledge End Outputs Flattener

import json
from typing import Any


def _pick_raw(*candidates: Any) -> str:
    for c in candidates:
        if c is None:
            continue
        if isinstance(c, dict):
            return json.dumps(c, ensure_ascii=False)
        text = str(c).strip()
        if text and text not in ("None", "null"):
            return text
    return ""


def _as_bool_str(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return "true" if value.strip().lower() in ("true", "1", "yes") else "false"
    return "true" if value else "false"


def _to_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def main(**kwargs: Any) -> dict:
    raw = _pick_raw(
        kwargs.get("re_end_outputs"),
        kwargs.get("cb_end_outputs"),
        kwargs.get("ok_end_outputs"),
        kwargs.get("end_outputs"),
    )
    o = json.loads(raw) if raw else {}
    report = o.get("validation_report") or {}
    if isinstance(report, str):
        try:
            report = json.loads(report)
        except json.JSONDecodeError:
            report = {}

    knowledge_json = o.get("knowledge_json") or "{}"
    if isinstance(knowledge_json, dict):
        knowledge_json = json.dumps(knowledge_json, ensure_ascii=False)

    return {
        "status": str(o.get("status") or ""),
        "circuit_break": _as_bool_str(o.get("circuit_break", False)),
        "human_action_required": _as_bool_str(o.get("human_action_required", False)),
        "retry_count": _to_int(o.get("retry_count"), 0),
        "knowledge_summary": str(o.get("knowledge_summary") or ""),
        "knowledge_json": str(knowledge_json),
        "validation_report": json.dumps(report, ensure_ascii=False),
        "retry_issues_formatted": str(o.get("retry_issues_formatted") or ""),
        "workflow_version": str(o.get("workflow_version") or ""),
    }
