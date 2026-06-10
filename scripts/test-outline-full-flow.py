"""大纲工作流全流程本地测试（Code 节点 + 客户端逻辑模拟，无需 Dify LLM）。"""
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


def assert_eq(label: str, got, expected):
    if got != expected:
        raise AssertionError(f"{label}: got {got!r}, expected {expected!r}")


def test_o1x_structured_output():
    o1x = load_module("o1x", "outline_o1_extract.py")
    payload = {
        "outline_summary": "周衍在赤城边关发现敌国密使。",
        "outline": {
            "volumes": [
                {
                    "id": "vol-01",
                    "title": "第一卷",
                    "chapters": [
                        {
                            "id": "ch-001",
                            "title": "边关密使",
                            "status": "draft",
                            "beats": [
                                {"order": 1, "text": "周衍于赤城城头巡防，发现可疑信使"},
                                {"order": 2, "text": "温静带来青木帝国急报"},
                                {"order": 3, "text": "密信指向玄朔帝国边境异动"},
                            ],
                        }
                    ],
                }
            ],
        },
    }
    # Dify Structured Output 路径：text 空，JSON 在 structured_output
    out = o1x.main(o1_result="", structured_output=payload)
    doc = json.loads(out["outline_json"])
    assert len(doc["volumes"][0]["chapters"]) == 1
    assert len(doc["volumes"][0]["chapters"][0]["beats"]) == 3


def test_o1x_summary_only_fails_agg():
    o1x = load_module("o1x", "outline_o1_extract.py")
    agg = load_module("agg", "outline_agg_validation.py")
    summary_only = json.dumps(
        {"outline_summary": "都市灵魂突破，与四帝国无关的长篇摘要…", "outline": {"volumes": []}},
        ensure_ascii=False,
    )
    extracted = o1x.main(o1_result=summary_only)
    doc = json.loads(extracted["outline_json"])
    assert doc.get("volumes") == []

    routed = agg.main(
        validate_result=json.dumps({"outline_valid": False, "outline_issues": [{"severity": "hard"}]}),
        retry_count="3",
        max_retry="3",
        outline_json=extracted["outline_json"],
    )
    assert routed["route"] == "circuit_break"
    assert routed["outline_valid"] is False
    assert "无有效章节/beats" in routed["retry_issues_formatted"]
    # 应只有一条 AGG 硬错误，不应保留 O2 多条幻觉
    assert routed["retry_issues_formatted"].count("[hard]") == 1


def test_o1x_chapters_without_beats():
    o1x = load_module("o1x", "outline_o1_extract.py")
    agg = load_module("agg", "outline_agg_validation.py")
    raw = json.dumps(
        {
            "outline_summary": "摘要",
            "outline": {
                "volumes": [
                    {
                        "id": "vol-01",
                        "title": "第一卷",
                        "chapters": [{"id": "ch-001", "title": "第一章", "status": "draft", "beats": []}],
                    }
                ],
            },
        },
        ensure_ascii=False,
    )
    extracted = o1x.main(o1_result=raw)
    routed = agg.main(
        validate_result="{}",
        retry_count="0",
        max_retry="3",
        outline_json=extracted["outline_json"],
    )
    assert routed["route"] == "retry"
    assert "无有效章节/beats" in routed["retry_issues_formatted"]


def test_happy_pipeline():
    o1x = load_module("o1x", "outline_o1_extract.py")
    agg = load_module("agg", "outline_agg_validation.py")
    end_ok = load_module("end_ok", "outline_end_success.py")
    parse = load_module("parse", "outline_parse_end_outputs.py")
    cb = load_module("cb", "outline_cb_circuit_break.py")
    re = load_module("re", "outline_retry_end.py")

    o1_text = json.dumps(
        {
            "outline_summary": "周衍调查边关密使。",
            "outline": {
                "volumes": [
                    {
                        "id": "vol-01",
                        "title": "第一卷",
                        "chapters": [
                            {
                                "id": "ch-001",
                                "title": "边关密使",
                                "status": "draft",
                                "beats": [
                                    {"order": 1, "text": "周衍于赤城城头巡防发现可疑信使"},
                                    {"order": 2, "text": "温静带来青木帝国急报"},
                                ],
                            }
                        ],
                    }
                ],
            },
        },
        ensure_ascii=False,
    )
    extracted = o1x.main(o1_result=o1_text, structured_output=o1_text)
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
    assert_eq("route", routed["route"], "continue")

    ok = end_ok.main(
        outline_summary=extracted["outline_summary"],
        outline_json=extracted["outline_json"],
        validation_report=routed["validation_report"],
        retry_count="0",
    )
    flat = parse.main(ok_end_outputs=ok["end_outputs"])
    assert_eq("status", flat["status"], "success")
    assert json.loads(flat["outline_json"])["volumes"]

    retry = re.main(
        outline_json=extracted["outline_json"],
        outline_summary=extracted["outline_summary"],
        retry_count="1",
        retry_issues_formatted="- test",
        validation_report=routed["validation_report"],
    )
    flat_re = parse.main(re_end_outputs=retry["end_outputs"])
    assert_eq("re status", flat_re["status"], "retry")

    cb_out = cb.main(
        outline_json=extracted["outline_json"],
        outline_summary=extracted["outline_summary"],
        retry_count="3",
        validation_report=routed["validation_report"],
    )
    flat_cb = parse.main(cb_end_outputs=cb_out["end_outputs"])
    assert_eq("cb status", flat_cb["status"], "circuit_break")
    assert flat_cb["circuit_break"] == "true"


def test_agg_prose_outline_json_normalized():
    agg = load_module("agg", "outline_agg_validation.py")
    prose = "林逸在矿洞获得玉佩，开启修仙之路……" * 200
    routed = agg.main(
        validate_result="{}",
        retry_count="0",
        max_retry="3",
        outline_json=prose,
    )
    assert routed["route"] == "retry"
    doc = json.loads(routed["outline_json"])
    assert doc == {"volumes": []}


def test_o1x_thinking_only_returns_empty_volumes():
    o1x = load_module("o1x", "outline_o1_extract.py")
    thinking = "<think>\n我们被要求生成大纲，但知识库为空……\n" * 50
    out = o1x.main(o1_result=thinking)
    assert json.loads(out["outline_json"]) == {"volumes": []}


def test_o1x_empty_structured_prefers_text():
    o1x = load_module("o1x", "outline_o1_extract.py")
    good = json.dumps(
        {
            "outline_summary": "周衍巡防赤城。",
            "outline": {
                "volumes": [
                    {
                        "id": "vol-01",
                        "title": "第一卷",
                        "chapters": [
                            {
                                "id": "ch-001",
                                "title": "边关",
                                "status": "draft",
                                "beats": [
                                    {"order": 1, "text": "周衍于赤城城头巡防发现可疑信使"},
                                    {"order": 2, "text": "温静带来青木帝国急报"},
                                ],
                            }
                        ],
                    }
                ],
            },
        },
        ensure_ascii=False,
    )
    out = o1x.main(structured_output={}, o1_result=good)
    assert len(json.loads(out["outline_json"])["volumes"][0]["chapters"]) == 1


def main():
    tests = [
        test_o1x_structured_output,
        test_o1x_thinking_only_returns_empty_volumes,
        test_o1x_empty_structured_prefers_text,
        test_agg_prose_outline_json_normalized,
        test_o1x_summary_only_fails_agg,
        test_o1x_chapters_without_beats,
        test_happy_pipeline,
    ]
    for fn in tests:
        fn()
        print(f"OK {fn.__name__}")
    print("ALL OUTLINE FULL-FLOW TESTS PASSED")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("FAIL:", exc, file=sys.stderr)
        sys.exit(1)
