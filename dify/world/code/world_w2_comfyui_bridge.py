# W2B · Normalize image tool output (万相 / ComfyUI / FAL) for END_OK
# 万相仅输出 files / json / text 三项 → 与 main() 入参同名绑定
# 本节点输出 map_image_url、map_image_base64（END_OK 主要用前者）

import json
from typing import Any


def _first_url(raw: Any) -> str:
    if raw is None:
        return ""
    if isinstance(raw, str):
        s = raw.strip()
        if s.startswith("http://") or s.startswith("https://"):
            return s
        if s.startswith("data:image"):
            return s
        try:
            parsed = json.loads(s)
        except json.JSONDecodeError:
            return ""
        return _first_url(parsed)
    if isinstance(raw, list):
        for item in raw:
            u = _first_url(item)
            if u:
                return u
        return ""
    if isinstance(raw, dict):
        for key in ("url", "remote_url", "download_url", "map_image_url", "signed_url"):
            v = raw.get(key)
            if isinstance(v, str) and (v.startswith("http") or v.startswith("data:image")):
                return v.strip()
        for key in ("files", "data", "images", "output"):
            u = _first_url(raw.get(key))
            if u:
                return u
    return ""


def main(
    files: Any = "",
    json: Any = "",
    text: str = "",
    image: Any = "",
    json_output: Any = "",
) -> dict:
    # json_output / image 为 ComfyUI 等旧画布兼容，万相只需绑 files + json + text
    url = (
        _first_url(files)
        or _first_url(json)
        or _first_url(json_output)
        or _first_url(image)
    )
    if not url and text.strip().startswith(("http://", "https://", "data:image")):
        url = text.strip()
    return {
        "map_image_url": url,
        "map_image_base64": "",
    }
