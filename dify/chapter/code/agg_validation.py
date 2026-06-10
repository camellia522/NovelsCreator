# AGG · Validation Aggregate + Retry Router
# 输入：outline_result, lore_result, retry_count, max_retry, draft_text
# 兼容 Dify 误绑名：outline_text / lore_text
# 输出：route, retry_count, retry_issues, merged_issues_for_polish, outline_valid, lore_valid

import json
import re

THINK_BLOCK_RE = re.compile(
    r"<(?:redacted_)?think>.*?</(?:redacted_)?think>",
    re.DOTALL | re.IGNORECASE,
)


def strip_think_blocks(text: str) -> str:
    return THINK_BLOCK_RE.sub("", text).strip()


def parse_llm_json(raw: str) -> dict:
    if not raw:
        return {}
    text = strip_think_blocks(raw.strip())
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if len(lines) > 2 else lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.rfind("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    return {}


def main(
    outline_result: str = "",
    lore_result: str = "",
    retry_count: int = 0,
    max_retry: int = 3,
    draft_text: str = "",
    outline_text: str = "",
    lore_text: str = "",
) -> dict:
    o = parse_llm_json(outline_result or outline_text)
    l = parse_llm_json(lore_result or lore_text)

    outline_valid = bool(o.get("outline_valid", False))
    lore_valid = bool(l.get("lore_valid", False))

    outline_issues = o.get("outline_issues") or []
    lore_issues = l.get("lore_issues") or []
    merged_issues = list(outline_issues) + list(lore_issues)

    retry_issues_json = json.dumps(merged_issues, ensure_ascii=False)
    merged_issues_for_polish = "\n".join(f"- {x}" for x in merged_issues) if merged_issues else "（无）"

    if outline_valid and lore_valid:
        route = "continue"
        new_retry_count = retry_count
    elif retry_count < max_retry:
        route = "retry"
        new_retry_count = retry_count + 1
    else:
        route = "circuit_break"
        new_retry_count = retry_count

    return {
        "route": route,
        "retry_count": new_retry_count,
        "retry_issues": retry_issues_json,
        "retry_issues_formatted": merged_issues_for_polish,
        "merged_issues_for_polish": merged_issues_for_polish,
        "outline_valid": outline_valid,
        "lore_valid": lore_valid,
    }
