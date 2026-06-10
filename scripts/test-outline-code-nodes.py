"""本地验证大纲工作流 Code 节点（无需 Dify）。"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CODE = ROOT / "dify" / "outline" / "code"


def load_module(name: str, filename: str):
    path = CODE / filename
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def test_pipeline():
    o1x = load_module("o1x", "outline_o1_extract.py")
    agg = load_module("agg", "outline_agg_validation.py")
    end_ok = load_module("end_ok", "outline_end_success.py")
    parse = load_module("parse", "outline_parse_end_outputs.py")

    o1_text = json.dumps(
        {
            "outline_summary": "林渊调查密信，揭开皇室盟约。",
            "outline": {
                "volumes": [
                    {
                        "id": "vol-01",
                        "title": "第一卷",
                        "chapters": [
                            {
                                "id": "ch-001",
                                "title": "第一章",
                                "status": "draft",
                                "beats": [
                                    {"order": 1, "text": "林渊在档案馆发现匿名密信"},
                                    {"order": 2, "text": "密信指向平京地下妖市"},
                                    {"order": 3, "text": "天机阁使者暗中监视"},
                                ],
                            }
                        ],
                    }
                ]
            },
        },
        ensure_ascii=False,
    )

    extracted = o1x.main(o1_result=o1_text)
    assert extracted["outline_summary"]
    assert "volumes" in json.loads(extracted["outline_json"])

    validate = json.dumps(
        {
            "outline_valid": True,
            "outline_issues": [],
            "structure_score": 90,
            "beat_quality_score": 85,
            "lore_consistency_score": 88,
            "chapter_count_ok": True,
            "volume_balance_ok": True,
        }
    )
    routed = agg.main(
        validate_result=validate,
        retry_count="0",
        max_retry="3",
        outline_json=extracted["outline_json"],
    )
    assert routed["route"] == "continue"

    ok = end_ok.main(
        outline_summary=extracted["outline_summary"],
        outline_json=extracted["outline_json"],
        validation_report=routed["validation_report"],
        retry_count="0",
    )
    flat = parse.main(ok_end_outputs=ok["end_outputs"])
    assert flat["status"] == "success"
    assert json.loads(flat["outline_json"])["volumes"]
    print("OK outline code pipeline")


if __name__ == "__main__":
    try:
        test_pipeline()
    except Exception as exc:
        print("FAIL:", exc, file=sys.stderr)
        sys.exit(1)
