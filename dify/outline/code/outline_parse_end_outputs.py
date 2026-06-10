# PARSE · Outline End Outputs Flattener
#
# === Dify 输入（均可选，默认空串）===
#   re_end_outputs  ← RE.end_outputs
#   cb_end_outputs  ← CB.end_outputs
#   ok_end_outputs  ← END_OK.end_outputs
#
# === Dify 输出（类型须与画布一致）===
#   status, circuit_break, human_action_required, outline_summary,
#   outline_json, validation_report, retry_issues_formatted,
#   workflow_version → String
#   retry_count → Number
#
# 勿使用 Dify 默认模板 def main(arg1, arg2) — 必须整文件替换为本脚本。

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

    outline_json = o.get("outline_json") or "{}"
    if isinstance(outline_json, dict):
        outline_json = json.dumps(outline_json, ensure_ascii=False)

    return {
        "status": str(o.get("status") or ""),
        "circuit_break": _as_bool_str(o.get("circuit_break", False)),
        "human_action_required": _as_bool_str(o.get("human_action_required", False)),
        "retry_count": _to_int(o.get("retry_count"), 0),
        "outline_summary": str(o.get("outline_summary") or ""),
        "outline_json": str(outline_json),
        "validation_report": json.dumps(report, ensure_ascii=False),
        "retry_issues_formatted": str(o.get("retry_issues_formatted") or ""),
        "workflow_version": str(o.get("workflow_version") or ""),
    }
