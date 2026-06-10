# W1X · Extract fields from W1 JSON for downstream nodes
# 从 W1 LLM 输出解析 world_rules / map / locations / nations / map_image_prompt
# 并按 scale 输出万相 W2 用的 image_size（2:1）
#
# Dify「输出变量」须与 main() return 键名、类型完全一致（均 String），共 9 个：
# world_rules, map_image_prompt, map_json, locations_json, nations_json,
# image_size, image_width, image_height, bind_hint

import json
from typing import Any, Union

# 万相 DashScope size：ASCII「宽*高」（英文星号 *，勿用 × 或 x）
# wan2.2-t2i-flash：单边 [512,1440]，可用 2:1 如 1024*512
# wan2.5+：总像素须 ≥ 1280*1280，2:1 的 1440*720 会 InvalidParameter — 请用 wan2.2 或 1280*1280
WAN22_SIZES = ("1024*512", "1280*640")
WAN25_SIZES = ("1280*1280", "1440*1440")  # 方形；wan2.5 无法合规 2:1
WAN_ALLOWED_SIZES = WAN22_SIZES + WAN25_SIZES
SIZE_BY_SCALE = {
    "kingdom": "1024*512",
    "archipelago": "1024*512",
    "continent": "1024*512",
    "world": "1024*512",
    "planet": "1024*512",
}
DEFAULT_IMAGE_SIZE = "1024*512"


def _strip_thinking(text: str) -> str:
    """去掉模型思考链，只保留闭合标签之后的正文（含 JSON）。"""
    low = text.lower()
    end_tags = (
        "</" + "think" + ">",
        "</" + "redacted_thinking" + ">",
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


def _unwrap_w1_root(raw: Any) -> dict:
    """兼容 Dify 结构化输出、嵌套 output/result、Markdown 包裹等。"""
    parsed = parse_json(raw, {})
    if isinstance(parsed, list):
        for item in parsed:
            if isinstance(item, dict):
                parsed = item
                break
        else:
            return {}
    if not isinstance(parsed, dict):
        return {}

    if _has_world_keys(parsed):
        return parsed

    for key in ("structured_output", "output", "result", "data", "json", "answer"):
        inner = parsed.get(key)
        if isinstance(inner, dict) and _has_world_keys(inner):
            return inner
        if isinstance(inner, str):
            nested = _unwrap_w1_root(inner)
            if nested:
                return nested

    text_val = parsed.get("text")
    if isinstance(text_val, str) and text_val.strip():
        nested = _unwrap_w1_root(text_val)
        if nested:
            return nested

    return parsed


def _pick(data: dict, *keys: str, default=None):
    for key in keys:
        val = data.get(key)
        if val is not None and val != "":
            return val
    return default


def _has_world_keys(d: dict) -> bool:
    return any(
        k in d
        for k in (
            "world_rules",
            "worldRules",
            "map",
            "locations",
            "map_image_prompt",
            "mapImagePrompt",
        )
    )


def _bind_hint(data: dict, raw: Any = None) -> str:
    """Dify 画布排错：w1_json 是否误绑为子对象。"""
    raw_s = str(raw or "")
    if (
        "redacted_thinking" in raw_s.lower()
        or ("<" + "think" + ">") in raw_s.lower()
    ) and not _has_world_keys(data):
        return (
            "w1_json 是模型思考链而非 JSON；W1X 请绑 W1→text（正文 JSON），"
            "勿绑 reasoning/thinking；W1 关闭深度思考；并检查 W1 User 已注入开始节点变量"
        )
    if "world_name=" in raw_s and "world_rules" not in raw_s:
        return "W1 未收到开始节点变量（全空模板）；在 W1 User 用 Jinja 写入 creative_brief 与各字段"
    if not data:
        return "w1_json 为空或无法解析；请绑 W1 → text（整段 JSON，含 world_rules / map_image_prompt）"
    if "polygon" in data and "terrain" in data and "map" not in data and "world_rules" not in data:
        return (
            "w1_json 误绑为单个 region（如 reg-001）；"
            "请改绑 W1 的 text 或结构化输出的根对象，不要选 regions 里某一项"
        )
    if not _pick(data, "world_rules", "worldRules") and not _pick(
        data, "map_image_prompt", "mapImagePrompt"
    ):
        return "w1_json 缺少 world_rules / map_image_prompt；检查 W1 是否输出完整 JSON"
    return ""


def _normalize_image_size(raw: str, scale: str) -> str:
    text = (raw or "").strip()
    if text:
        text = (
            text.replace("×", "*")
            .replace("x", "*")
            .replace("X", "*")
            .replace(" ", "")
            .replace("＊", "*")
        )
        if text in WAN_ALLOWED_SIZES:
            return text
        if "*" in text:
            try:
                w, h = [int(p) for p in text.split("*", 1)]
                if w > 1440 or h > 1440 or w < 512 or h < 512:
                    return SIZE_BY_SCALE.get((scale or "").strip(), DEFAULT_IMAGE_SIZE)
                # wan2.5 最小总像素 1280*1280；过小尺寸会报 size format / InvalidParameter
                if w * h < 1280 * 1280:
                    return DEFAULT_IMAGE_SIZE
            except ValueError:
                pass
    return SIZE_BY_SCALE.get((scale or "").strip(), DEFAULT_IMAGE_SIZE)


def _split_size(image_size: str) -> tuple[str, str]:
    if "*" not in image_size:
        return "1280", "640"
    w, h = image_size.split("*", 1)
    return w.strip(), h.strip()


def main(
    w1_json: Any = "{}",
    scale: str = "continent",
    image_size: str = "",
) -> dict:
    data = _unwrap_w1_root(w1_json)
    map_obj = _pick(data, "map", default={}) or {}
    locations = _pick(data, "locations", default=[]) or []
    nations = _pick(data, "nations", default=[]) or []

    size = _normalize_image_size(image_size, scale)
    width, height = _split_size(size)

    return {
        "world_rules": str(_pick(data, "world_rules", "worldRules", default="") or ""),
        "map_image_prompt": str(
            _pick(data, "map_image_prompt", "mapImagePrompt", default="") or ""
        ),
        "map_json": json.dumps(map_obj, ensure_ascii=False),
        "locations_json": json.dumps(locations, ensure_ascii=False),
        "nations_json": json.dumps(nations, ensure_ascii=False),
        "image_size": size,
        "image_width": width,
        "image_height": height,
        "bind_hint": _bind_hint(data, w1_json),
    }
