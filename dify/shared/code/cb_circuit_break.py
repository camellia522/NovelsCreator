# CB · Circuit Break End Output
# 输入：draft_text, retry_count, outline_valid, lore_valid, retry_issues

import json


def main(
    draft_text: str,
    retry_count: int,
    outline_valid: bool,
    lore_valid: bool,
    retry_issues: str,
) -> dict:
    issues = json.loads(retry_issues) if retry_issues else []
    end_outputs = {
        "status": "circuit_break",
        "circuit_break": True,
        "human_action_required": True,
        "retry_count": retry_count,
        "draft_text": draft_text or "",
        "validation_report": {
            "outline_valid": outline_valid,
            "lore_valid": lore_valid,
            "issues": issues,
        },
        "workflow_version": "novel-chapter-generation-v1.1",
    }
    return {"end_outputs": json.dumps(end_outputs, ensure_ascii=False)}
