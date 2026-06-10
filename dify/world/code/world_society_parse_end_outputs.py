# PARSE · World Society End Outputs Flattener

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


def main(
    end_outputs: Any = "",
    end_outputs_: Any = "",
    ok_end_outputs: Any = "",
) -> dict:
    raw = _pick_raw(end_outputs, end_outputs_, ok_end_outputs)
    o = json.loads(raw) if raw else {}
    return {
        "status": o.get("status", "error"),
        "society_json": o.get("society_json") or "",
        "world_rules": o.get("world_rules") or "",
        "nations_json": o.get("nations_json") or "",
        "locations_json": o.get("locations_json") or "",
        "workflow_version": o.get("workflow_version") or "world-society-v1",
        "error_message": o.get("error_message") or "",
    }
