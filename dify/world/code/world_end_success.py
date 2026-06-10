# END · World Generate Success Assembler
# 输入：world_rules, map_json, locations_json, nations_json, map_image_base64(optional), map_image_url(optional)

import json
from typing import Any, Union


def parse_json_str(raw: Union[str, dict, list, None], fallback):
    if raw is None:
        return fallback
    if isinstance(raw, (dict, list)):
        return raw
    text = str(raw).strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if len(lines) > 2 else lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return fallback


def main(
    world_rules: str = "",
    map_json: Any = "{}",
    locations_json: Any = "[]",
    nations_json: Any = "[]",
    map_image_base64: str = "",
    map_image_url: str = "",
    workflow_version: str = "world-generate-v1",
) -> dict:
    map_obj = parse_json_str(map_json, {})
    locations = parse_json_str(locations_json, [])
    nations = parse_json_str(nations_json, [])

    if isinstance(map_obj, dict):
        map_obj.setdefault("rivers", [])
        map_obj.setdefault("regions", [])
        map_obj.setdefault("lakes", [])
        if nations and not map_obj.get("nations"):
            map_obj["nations"] = nations

    end_outputs = {
        "status": "success",
        "world_rules": world_rules or "",
        "map_json": json.dumps(map_obj, ensure_ascii=False),
        "locations_json": json.dumps(locations, ensure_ascii=False),
        "nations_json": json.dumps(nations, ensure_ascii=False),
        "map_image_base64": map_image_base64 or "",
        "map_image_url": map_image_url or "",
        "workflow_version": workflow_version,
    }
    return {"end_outputs": json.dumps(end_outputs, ensure_ascii=False)}
