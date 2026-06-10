# P0 · Outline Context Merge（可选）
#
# Dify 输出（均为 String）：
#   merged_context, has_existing_outline,
#   knowledge_snapshot, plot_memory, outline_brief  ← 供 O1/O2 直接绑定

import json
from typing import Any


def _pick_str(*keys: str, **kwargs: Any) -> str:
    for key in keys:
        val = kwargs.get(key)
        if val is not None and str(val).strip():
            return str(val)
    return ""


def main(**kwargs: Any) -> dict:
    knowledge_snapshot = _pick_str("knowledge_snapshot", "knowledge", **kwargs)
    outline_brief = _pick_str("outline_brief", "creative_brief", **kwargs).strip()
    plot_memory = _pick_str("plot_memory", "plot_memo", **kwargs)

    merged = {
        "knowledge_snapshot": knowledge_snapshot,
        "outline_brief": outline_brief,
        "plot_memory": plot_memory,
    }

    return {
        "merged_context": json.dumps(merged, ensure_ascii=False),
        "has_existing_outline": "true" if outline_brief else "false",
        "knowledge_snapshot": knowledge_snapshot,
        "plot_memory": plot_memory,
        "outline_brief": outline_brief,
    }
