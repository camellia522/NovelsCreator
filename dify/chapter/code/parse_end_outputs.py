# PARSE · End Outputs Flattener（章节工作流 END 前最后一环 Code 节点）
# 勿与 end_success.py / n5_parse_memory_patch.py 混用。
#
# Dify 入参（均可选，非必填 + 默认 ""）：
#   re_end_outputs / cb_end_outputs / ok_end_outputs / end_outputs
# 单次 run 仅 RE / CB / END_OK 之一有值，其余为空属正常。

import json
import re
from typing import Any

THINK_RE = re.compile(r"<(?:redacted_)?think>[\s\S]*?</(?:redacted_)?think>", re.I)


def _coerce_end_outputs(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    text = str(value).strip()
    if not text or text in ("None", "null"):
        return ""
    return text


def _pick_raw(*candidates: Any) -> str:
    for candidate in candidates:
        text = _coerce_end_outputs(candidate)
        if text:
            return text
    return ""


def _strip_think(text: str) -> str:
    return THINK_RE.sub("", text or "").strip()


def _extract_json_object(text: str) -> dict:
    s = _strip_think(text).strip()
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


def _normalize_memory_patch(raw: Any) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        if raw.get("chapterSummary") or raw.get("globalSummaryDelta") or raw.get("foreshadowingUpdates"):
            return raw
        inner = raw.get("text")
        if isinstance(inner, str) and inner.strip():
            return _extract_json_object(inner)
        return raw
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return {}
        if text.startswith("{"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    if parsed.get("chapterSummary") or parsed.get("globalSummaryDelta"):
                        return parsed
                    return _extract_json_object(text)
            except json.JSONDecodeError:
                return _extract_json_object(text)
        return _extract_json_object(text)
    return {}


def _flatten_end_outputs(raw: str) -> dict:
    o = json.loads(raw) if raw else {}
    memory_patch = _normalize_memory_patch(o.get("memory_patch"))
    validation_report = o.get("validation_report") or {}
    if isinstance(validation_report, str):
        try:
            validation_report = json.loads(validation_report)
        except json.JSONDecodeError:
            validation_report = {}
    return {
        "status": o.get("status", ""),
        "circuit_break": bool(o.get("circuit_break", False)),
        "human_action_required": bool(o.get("human_action_required", False)),
        "retry_count": int(o.get("retry_count", 0) or 0),
        "novel_body": o.get("novel_body") or "",
        "video_script": o.get("video_script") or "",
        "draft_text": o.get("draft_text") or "",
        "retry_issues_formatted": o.get("retry_issues_formatted") or "",
        "memory_patch": json.dumps(memory_patch, ensure_ascii=False),
        "validation_report": json.dumps(validation_report, ensure_ascii=False),
        "workflow_version": o.get("workflow_version") or "",
    }


def main(**kwargs: Any) -> dict:
    """Dify Code 节点统一入口：兼容仅 end_outputs 或四路 end_outputs 变量名。"""
    re_end_outputs = kwargs.get("re_end_outputs", "")
    cb_end_outputs = kwargs.get("cb_end_outputs", "")
    ok_end_outputs = kwargs.get("ok_end_outputs", "")
    end_outputs = kwargs.get("end_outputs", "")
    raw = _pick_raw(re_end_outputs, cb_end_outputs, ok_end_outputs, end_outputs)
    return _flatten_end_outputs(raw)
