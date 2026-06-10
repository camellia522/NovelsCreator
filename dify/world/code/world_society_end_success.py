# END_OK · World Society Success Assembler (Dify 代码节点)
#
# 【输入变量】类型均为 String（JSON 内容也是字符串），建议全部绑定 W2SX：
#   society_json, world_rules, nations_json, locations_json, workflow_version
# 可选：w2sx_bundle — 若 Dify 将 W2SX 四字段合成一个 JSON 字符串再传入
#
# 【输出变量】只登记 2 个，类型 String：
#   end_outputs, end_outputs_（内容相同，兼容不同画布命名）
#
# 勿将 society_json / locations_json 登记为 END_OK 的「输出」，否则会报
# Not all output parameters are validated

import json
from typing import Any, Union

WORKFLOW_VERSION_DEFAULT = "world-society-v1"


def _is_empty(raw: Any) -> bool:
    if raw is None:
        return True
    if isinstance(raw, str):
        t = raw.strip()
        return not t or t.lower() in ("null", "none", "{}")
    return False


def parse_json_str(raw: Union[str, dict, list, None], fallback: Any) -> Any:
    if raw is None:
        return fallback
    if isinstance(raw, (dict, list)):
        return raw
    text = str(raw).strip()
    if not text or text.lower() in ("null", "none"):
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
        start, end = text.find("["), text.rfind("]")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
        return fallback


def _as_list(raw: Any) -> list:
    if isinstance(raw, list):
        return raw
    parsed = parse_json_str(raw, [])
    return parsed if isinstance(parsed, list) else []


def _merge_w2sx_bundle(bundle: Any) -> dict[str, Any]:
    """从 w2sx_bundle 或已是 dict 的上游对象读取字段。"""
    if isinstance(bundle, dict):
        data = bundle
    else:
        data = parse_json_str(bundle, {})
    if not isinstance(data, dict):
        return {}
    out: dict[str, Any] = {}
    for key in ("society_json", "world_rules", "nations_json", "locations_json"):
        if key in data and not _is_empty(data.get(key)):
            out[key] = data[key]
    return out


def _pick_list(society_val: Any, separate_json: Any) -> list:
    sep = _as_list(separate_json)
    if len(sep) > 0:
        return sep
    if isinstance(society_val, list) and len(society_val) > 0:
        return society_val
    return []


def _build_packed(
    society_json: Any = "",
    world_rules: Any = "",
    nations_json: Any = "[]",
    locations_json: Any = "[]",
    workflow_version: Any = "",
    w2sx_bundle: Any = "",
) -> tuple[dict[str, Any], dict[str, Any]]:
    merged = _merge_w2sx_bundle(w2sx_bundle)

    sj = merged.get("society_json", society_json)
    wr_in = merged.get("world_rules", world_rules)
    nj_in = merged.get("nations_json", nations_json)
    lj_in = merged.get("locations_json", locations_json)

    society = parse_json_str(sj, {})
    if isinstance(society, str):
        society = parse_json_str(society, {})
    if not isinstance(society, dict):
        society = {}

    wr = str(wr_in or society.get("world_rules") or "").strip()
    nations = _pick_list(society.get("nations"), nj_in)
    locations = _pick_list(society.get("locations"), lj_in)

    packed = {
        "world_rules": wr,
        "nations": nations,
        "locations": locations,
    }

    has_data = bool(wr) or len(nations) > 0 or len(locations) > 0
    status = "success" if has_data else "error"
    error_message = ""
    if not has_data:
        error_message = (
            "END_OK 未收到 W2SX 数据：请检查 society_json/world_rules/nations_json/"
            "locations_json 是否绑定到 W2SX 对应输出，且勿单独运行 END_OK（输入为 null）。"
        )

    wv = str(workflow_version or WORKFLOW_VERSION_DEFAULT).strip() or WORKFLOW_VERSION_DEFAULT

    end_outputs = {
        "status": status,
        "society_json": json.dumps(packed, ensure_ascii=False),
        "world_rules": wr,
        "nations_json": json.dumps(nations, ensure_ascii=False),
        "locations_json": json.dumps(locations, ensure_ascii=False),
        "workflow_version": wv,
        "error_message": error_message,
    }
    return packed, end_outputs


def _pack_return(end_outputs: dict[str, Any]) -> dict[str, str]:
    packed_str = json.dumps(end_outputs, ensure_ascii=False)
    return {
        "end_outputs": packed_str,
        "end_outputs_": packed_str,
    }


def main(
    society_json: Any = "",
    world_rules: Any = "",
    nations_json: Any = "[]",
    locations_json: Any = "[]",
    workflow_version: Any = WORKFLOW_VERSION_DEFAULT,
    w2sx_bundle: Any = "",
) -> dict[str, str]:
    try:
        _, end_outputs = _build_packed(
            society_json=society_json,
            world_rules=world_rules,
            nations_json=nations_json,
            locations_json=locations_json,
            workflow_version=workflow_version,
            w2sx_bundle=w2sx_bundle,
        )
        return _pack_return(end_outputs)
    except Exception as exc:
        err = {
            "status": "error",
            "society_json": json.dumps(
                {"world_rules": "", "nations": [], "locations": []},
                ensure_ascii=False,
            ),
            "world_rules": "",
            "nations_json": "[]",
            "locations_json": "[]",
            "workflow_version": WORKFLOW_VERSION_DEFAULT,
            "error_message": f"END_OK 异常: {exc}",
        }
        return _pack_return(err)
