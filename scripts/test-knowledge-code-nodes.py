"""本地验证知识库工作流 Code 节点（无需 Dify）。"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CODE = ROOT / "dify" / "knowledge" / "code"


def load_module(name: str, filename: str):
    path = CODE / filename
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def test_pipeline():
    k1x = load_module("k1x", "knowledge_k1_extract.py")
    agg = load_module("agg", "knowledge_agg_validation.py")
    end_ok = load_module("end_ok", "knowledge_end_success.py")
    parse = load_module("parse", "knowledge_parse_end_outputs.py")

    k1_text = json.dumps(
        {
            "knowledge_summary": "边关斥候周衍卷入四国权谋，密信指向地下妖市。",
            "knowledge": {
                "world": {
                    "title": "NewWorld",
                    "rules": "冷兵器低魔大陆，禁止修仙与穿越；权谋与边境战争为主轴，魔法仅表现为稀世异象与古老盟约，不可大规模施法。",
                    "conflictFocus": "边境谍战与四国盟约",
                },
                "characters": [
                    {"id": "char-001", "name": "周衍", "role": "主角", "traits": ["冷静"]},
                    {"id": "char-002", "name": "沈青", "role": "盟友", "traits": ["机敏"]},
                    {"id": "char-003", "name": "韩烈", "role": "反派", "traits": ["狠辣"]},
                ],
                "factions": [
                    {
                        "id": "faction-001",
                        "name": "天机阁",
                        "description": "暗中监视边境密信的神秘组织",
                        "goals": "控制盟约",
                    }
                ],
                "items": [
                    {
                        "id": "item-001",
                        "name": "匿名密信",
                        "description": "指向地下妖市的线索",
                    }
                ],
            },
        },
        ensure_ascii=False,
    )

    extracted = k1x.main(k1_result=k1_text)
    assert extracted["knowledge_summary"]
    doc = json.loads(extracted["knowledge_json"])
    assert doc["world"]["title"] == "NewWorld"
    assert len(doc["characters"]) >= 3

    validate = json.dumps(
        {
            "knowledge_valid": True,
            "knowledge_issues": [],
            "structure_score": 92,
            "lore_consistency_score": 88,
            "character_coverage_ok": True,
        }
    )
    routed = agg.main(
        validate_result=validate,
        retry_count="0",
        max_retry="3",
        knowledge_json=extracted["knowledge_json"],
    )
    assert routed["route"] == "continue"

    ok = end_ok.main(
        knowledge_summary=extracted["knowledge_summary"],
        knowledge_json=extracted["knowledge_json"],
        validation_report=routed["validation_report"],
        retry_count="0",
    )
    flat = parse.main(ok_end_outputs=ok["end_outputs"])
    assert flat["status"] == "success"
    assert flat["workflow_version"] == "novel-knowledge-generation-v1"
    print("knowledge code pipeline OK")


if __name__ == "__main__":
    try:
        test_pipeline()
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
