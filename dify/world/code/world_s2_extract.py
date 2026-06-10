# W2SX · Extract society JSON from W2S LLM output
# 解析 world_rules / nations / locations，并输出 society_json 供 END 节点
#
# Dify「输出变量」须与 main() return 键名、类型完全一致（均 String），共 4 个：
# society_json, world_rules, nations_json, locations_json

import json
from typing import Any, Union


def _strip_thinking(text: str) -> str:
    low = text.lower()
    end_tags = (
        "</" + "think" + ">",
        "</" + "redacted_thinking" + ">",
        "</" + "thought" + ">",
    )
    for end_tag in end_tags:
        pos = low.find(end_tag)
        if pos >= 0:
            text = text[pos + len(end_tag) :]
            low = text.lower()
    return text.strip()


def parse_json(raw: Union[str, dict, None], fallback):
    if raw is None:
        return fallback
    if isinstance(raw, (dict, list)):
        return raw
    text = _strip_thinking(str(raw).strip())
    if not text or text in ("{}", "[]", "null", "None"):
        return fallback
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if len(lines) > 2 else lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
        return fallback


def _normalize_root(parsed: Any) -> dict:
    if isinstance(parsed, list):
        for item in parsed:
            if isinstance(item, dict):
                parsed = item
                break
        else:
            return {}
    if not isinstance(parsed, dict):
        return {}
    for key in (
        "structured_output",
        "structuredOutput",
        "output",
        "result",
        "data",
        "society",
        "json",
    ):
        inner = parsed.get(key)
        if isinstance(inner, dict) and (
            "nations" in inner or "locations" in inner or "world_rules" in inner
        ):
            return inner
        if isinstance(inner, str) and inner.strip():
            nested = _normalize_root(parse_json(inner, {}))
            if nested:
                return nested
    return parsed


def main(
    w2s_json: str = "",
    text: str = "",
    structured_output: Any = None,
) -> dict:
    """Dify W2SX：优先 structured_output（LLM 结构化 JSON），否则 text / w2s_json 字符串。"""
    if structured_output is not None and structured_output != "":
        if isinstance(structured_output, dict):
            root = _normalize_root(structured_output)
        else:
            root = _normalize_root(parse_json(structured_output, {}))
    else:
        raw = (w2s_json or text or "").strip()
        root = _normalize_root(parse_json(raw, {}))
    world_rules = str(root.get("world_rules") or "").strip()
    nations = root.get("nations") or []
    locations = root.get("locations") or []
    if not isinstance(nations, list):
        nations = []
    if not isinstance(locations, list):
        locations = []

    society = {
        "world_rules": world_rules,
        "nations": nations,
        "locations": locations,
    }
    return {
        "society_json": json.dumps(society, ensure_ascii=False),
        "world_rules": world_rules,
        "nations_json": json.dumps(nations, ensure_ascii=False),
        "locations_json": json.dumps(locations, ensure_ascii=False),
    }
