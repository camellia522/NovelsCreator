# END_OK · Knowledge Success Assembler

import json
from typing import Any


def _to_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _parse_json(raw: Any, fallback: dict) -> dict:
    if isinstance(raw, dict):
        return raw
    if raw is None:
        return fallback
    text = str(raw).strip()
    if not text:
        return fallback
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else fallback
    except json.JSONDecodeError:
        return fallback


def main(**kwargs: Any) -> dict:
    knowledge_summary = str(kwargs.get("knowledge_summary") or "").strip()
    knowledge_json = str(kwargs.get("knowledge_json") or "{}")
    validation_report = kwargs.get("validation_report") or "{}"
    retry_count = _to_int(kwargs.get("retry_count"), 0)

    doc = _parse_json(knowledge_json, {})
    end_outputs = {
        "status": "success",
        "circuit_break": False,
        "human_action_required": False,
        "retry_count": retry_count,
        "knowledge_summary": knowledge_summary,
        "knowledge_json": json.dumps(doc, ensure_ascii=False),
        "validation_report": _parse_json(validation_report, {}),
        "workflow_version": "novel-knowledge-generation-v1",
    }
    return {"end_outputs": json.dumps(end_outputs, ensure_ascii=False)}
