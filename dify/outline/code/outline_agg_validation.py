# AGG · Outline Validation Aggregate + Route
#
# === Dify 输入（4 项，均须绑定）===
#   validate_result ← O2 / text（String）
#   retry_count     ← 开始 / retry_count
#   max_retry       ← 开始 / max_retry
#   outline_json    ← O1X / outline_json（勿绑 O1.text）
#
# === Dify 输出（6 项）===
#   route, retry_issues_formatted, validation_report, outline_json → String
#   retry_count → Number
#   outline_valid → Boolean

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
    if value is None or str(value).strip().lower() in ("null", "none", ""):
        return fallback
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _as_bool(value: Any) -> bool:
    """Dify/O2 可能返回 bool 或字符串 \"true\"/\"false\"；勿用裸 bool(str)。"""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes")
    if isinstance(value, (int, float)):
        return value != 0
    return bool(value)


def _pick_validate_result(kwargs: dict) -> Any:
    for key in ("validate_result", "validate_text", "text", "o2_result"):
        val = kwargs.get(key)
        if val is None:
            continue
        if isinstance(val, str) and val.strip().lower() in ("null", "none", ""):
            continue
        return val
    return "{}"


def _normalize_outline_json(raw: Any) -> str:
    """若误绑 O1 整段输出，尽量提取 { volumes }。"""
    if raw is None:
        return "{}"
    if isinstance(raw, dict):
        if isinstance(raw.get("volumes"), list):
            return json.dumps({"volumes": raw["volumes"]}, ensure_ascii=False)
        outline = raw.get("outline")
        if isinstance(outline, dict) and isinstance(outline.get("volumes"), list):
            return json.dumps(outline, ensure_ascii=False)
    text = str(raw).strip()
    if not text or text.lower() in ("null", "none"):
        return "{}"
    if "outline_summary" in text or "redacted_think" in text.lower() or "<think" in text.lower():
        parsed = _parse_llm_json(text)
        outline = parsed.get("outline")
        if isinstance(outline, dict) and isinstance(outline.get("volumes"), list):
            return json.dumps(outline, ensure_ascii=False)
        if isinstance(parsed.get("volumes"), list):
            return json.dumps({"volumes": parsed["volumes"]}, ensure_ascii=False)
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and isinstance(parsed.get("volumes"), list):
            return json.dumps(parsed, ensure_ascii=False)
    except json.JSONDecodeError:
        pass
    return json.dumps({"volumes": []}, ensure_ascii=False)


def _count_chapters(outline_json: str) -> int:
    try:
        doc = json.loads(outline_json) if isinstance(outline_json, str) else outline_json
    except json.JSONDecodeError:
        return 0
    if not isinstance(doc, dict):
        return 0
    n = 0
    for vol in doc.get("volumes") or []:
        if isinstance(vol, dict) and isinstance(vol.get("chapters"), list):
            n += len(vol["chapters"])
    return n


def _count_total_beats(outline_json: str) -> int:
    try:
        doc = json.loads(outline_json) if isinstance(outline_json, str) else outline_json
    except json.JSONDecodeError:
        return 0
    if not isinstance(doc, dict):
        return 0
    n = 0
    for vol in doc.get("volumes") or []:
        if not isinstance(vol, dict):
            continue
        for ch in vol.get("chapters") or []:
            if isinstance(ch, dict) and isinstance(ch.get("beats"), list):
                n += len(ch["beats"])
    return n


def _structure_ok(outline_json: str) -> bool:
    return _count_chapters(outline_json) > 0 and _count_total_beats(outline_json) >= 2


def _o1x_empty_outputs(retry_count: int, max_retry: int, outline_json: str) -> dict:
    issue = (
        "- [hard] global: O1X outline_json 无有效章节/beats（volumes 为空或 beats=0）。"
        "常见原因：① O1 只写了 outline_summary 未填 outline.volumes；"
        "② O1X 未绑 O1.structured_output；"
        "③ O2 的 outline_json 误绑 O1X.outline_summary 或 O1.text。"
        "请检查 O1 Structured Output Schema 与 O1X/O2 绑定。"
    )
    new_retry = retry_count + 1 if retry_count < max_retry else retry_count
    route = "retry" if retry_count < max_retry else "circuit_break"
    report = {
        "outline_valid": False,
        "outline_issues": [
            {
                "severity": "hard",
                "location": "global",
                "message": "O1X 未返回有效章节结构，见 retry_issues_formatted",
            }
        ],
        "structure_score": 0,
        "beat_quality_score": 0,
        "lore_consistency_score": 0,
        "chapter_count_ok": False,
        "volume_balance_ok": False,
    }
    return {
        "route": route,
        "retry_count": int(new_retry),
        "retry_issues_formatted": issue,
        "outline_valid": False,
        "validation_report": json.dumps(report, ensure_ascii=False),
        "outline_json": outline_json,
    }


def _empty_outputs(retry_count: int = 0, outline_json: str = "{}") -> dict:
    return {
        "route": "retry",
        "retry_count": retry_count,
        "retry_issues_formatted": "- [hard] global: O2 未返回有效校验 JSON（validate_result 为空）",
        "outline_valid": False,
        "validation_report": "{}",
        "outline_json": outline_json,
    }


def main(**kwargs: Any) -> dict:
    try:
        validate_result = _pick_validate_result(kwargs)
        raw_outline = kwargs.get("outline_json") or kwargs.get("o1_result") or "{}"
        outline_json = _normalize_outline_json(raw_outline)
        retry_count = _to_int(kwargs.get("retry_count"), 0)
        max_retry = _to_int(kwargs.get("max_retry"), 3)

        if not _structure_ok(outline_json):
            return _o1x_empty_outputs(retry_count, max_retry, outline_json)

        v = _parse_llm_json(validate_result)
        if not v:
            out = _empty_outputs(retry_count, outline_json)
            if retry_count >= max_retry:
                out["route"] = "circuit_break"
            else:
                out["retry_count"] = retry_count + 1
            return out

        valid = _as_bool(v.get("outline_valid", False))
        issues = v.get("outline_issues") or []

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
            "outline_valid": bool(valid),
            "validation_report": json.dumps(v, ensure_ascii=False),
            "outline_json": outline_json,
        }
    except Exception:
        return _empty_outputs(_to_int(kwargs.get("retry_count"), 0))
