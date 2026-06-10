# PARSE · World End Outputs Flattener

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
    ok_end_outputs: Any = "",
) -> dict:
    raw = _pick_raw(end_outputs, ok_end_outputs)
    o = json.loads(raw) if raw else {}
    return {
        "status": o.get("status", "error"),
        "world_rules": o.get("world_rules") or "",
        "map_json": o.get("map_json") or "",
        "locations_json": o.get("locations_json") or "",
        "nations_json": o.get("nations_json") or "",
        "map_image_base64": o.get("map_image_base64") or "",
        "map_image_url": o.get("map_image_url") or "",
        "workflow_version": o.get("workflow_version") or "world-generate-v1",
        "error_message": o.get("error_message") or "",
    }
