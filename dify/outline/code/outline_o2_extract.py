# O2X · 解析 O2 LLM 输出（当 structured_output 失效或 text 含 think 块时可选）
# 默认：AGG 直接读 O2.text 即可（内置剥离 think）。仅当 Dify 只暴露 structured_output 且需清洗时用本节点。
#
# 输入：validate_result ← O2.text 或 O2 结构化输出 JSON 串
# 输出：validate_result（规范化 JSON 串，供 AGG）

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
    if not text:
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


def _is_valid_o2(doc: dict) -> bool:
    return "outline_valid" in doc and "outline_issues" in doc


def main(**kwargs: Any) -> dict:
    raw = (
        kwargs.get("validate_result")
        or kwargs.get("text")
        or kwargs.get("structured_output")
        or kwargs.get("o2_result")
        or ""
    )
    doc = _parse_llm_json(raw)
    if not _is_valid_o2(doc):
        doc = {
            "outline_valid": False,
            "outline_issues": [
                {
                    "severity": "hard",
                    "location": "global",
                    "message": "O2 输出不是有效校验 JSON（请检查 Structured Output Schema 与 User 变量绑定）",
                }
            ],
            "structure_score": 0,
            "beat_quality_score": 0,
            "lore_consistency_score": 0,
            "chapter_count_ok": False,
            "volume_balance_ok": False,
        }
    return {"validate_result": json.dumps(doc, ensure_ascii=False)}
