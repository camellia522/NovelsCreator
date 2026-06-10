# END_OK · Outline Success Assembler

import json
import re
from typing import Any

THINK_RE = re.compile(r"<(?:redacted_)?think>[\s\S]*?</(?:redacted_)?think>", re.I)


def _strip_think(text: str) -> str:
    return THINK_RE.sub("", text or "").strip()


def _parse_json(raw: Any, fallback: dict) -> dict:
    if raw is None:
        return fallback
    if isinstance(raw, dict):
        return raw
    text = _strip_think(str(raw).strip())
    if not text:
        return fallback
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if len(lines) > 2 else lines).strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else fallback
    except json.JSONDecodeError:
        return fallback


def _normalize_outline_doc(raw: Any) -> tuple[str, dict]:
    parsed = _parse_json(raw, {})
    summary = str(parsed.get("outline_summary") or "").strip()
    outline = parsed.get("outline")
    if isinstance(outline, dict) and isinstance(outline.get("volumes"), list):
        return summary, outline
    if isinstance(parsed.get("volumes"), list):
        return summary, {"volumes": parsed["volumes"]}
    return summary, {"volumes": []}


def _to_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def main(**kwargs: Any) -> dict:
    outline_summary = str(kwargs.get("outline_summary") or "").strip()
    outline_json = kwargs.get("outline_json") or "{}"
    validation_report = kwargs.get("validation_report") or "{}"
    retry_count = _to_int(kwargs.get("retry_count"), 0)

    extracted_summary, outline_doc = _normalize_outline_doc(outline_json)
    if not outline_summary:
        outline_summary = extracted_summary

    report = _parse_json(validation_report, {})
    end_outputs = {
        "status": "success",
        "circuit_break": False,
        "human_action_required": False,
        "retry_count": retry_count,
        "outline_summary": outline_summary,
        "outline_json": json.dumps(outline_doc, ensure_ascii=False),
        "validation_report": report,
        "workflow_version": "novel-outline-generation-v1",
    }
    return {"end_outputs": json.dumps(end_outputs, ensure_ascii=False)}
