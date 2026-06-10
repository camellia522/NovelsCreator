# RE · Knowledge Client Retry Handoff

import json
from typing import Any


def _to_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _as_json_str(raw: Any, fallback: str = "{}") -> str:
    if raw is None:
        return fallback
    if isinstance(raw, dict):
        return json.dumps(raw, ensure_ascii=False)
    text = str(raw).strip()
    return text or fallback


def main(**kwargs: Any) -> dict:
    knowledge_json = _as_json_str(kwargs.get("knowledge_json"), "{}")
    knowledge_summary = str(kwargs.get("knowledge_summary") or "").strip()
    retry_count = _to_int(kwargs.get("retry_count"), 0)
    retry_issues_formatted = str(kwargs.get("retry_issues_formatted") or "")
    validation_report = kwargs.get("validation_report") or "{}"

    end_outputs = {
        "status": "retry",
        "circuit_break": False,
        "human_action_required": False,
        "retry_count": retry_count,
        "knowledge_summary": knowledge_summary,
        "knowledge_json": knowledge_json,
        "retry_issues_formatted": retry_issues_formatted,
        "validation_report": _as_json_str(validation_report, "{}"),
        "workflow_version": "novel-knowledge-generation-v1",
    }
    return {"end_outputs": json.dumps(end_outputs, ensure_ascii=False)}
