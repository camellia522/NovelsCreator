# RE · Client Retry Handoff Output
# 方案 B：Dify 画布不回连 N1；route=retry 时组装 outputs，由客户端/MCP 再次 POST。
# 输入：draft_text, retry_count, outline_valid, lore_valid, retry_issues, retry_issues_formatted

import json


def main(
    draft_text: str,
    retry_count: int,
    outline_valid: bool,
    lore_valid: bool,
    retry_issues: str,
    retry_issues_formatted: str,
) -> dict:
    issues = json.loads(retry_issues) if retry_issues else []
    end_outputs = {
        "status": "retry",
        "circuit_break": False,
        "human_action_required": False,
        "retry_count": retry_count,
        "draft_text": draft_text or "",
        "retry_issues_formatted": retry_issues_formatted or "",
        "validation_report": {
            "outline_valid": outline_valid,
            "lore_valid": lore_valid,
            "issues": issues,
        },
        "workflow_version": "novel-chapter-generation-v1.1",
    }
    return {"end_outputs": json.dumps(end_outputs, ensure_ascii=False)}
