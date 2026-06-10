# N4B-MUX · Video Script Branch Merge
# 三分支 N4b 仅有一路执行；合并为单一 video_script 供 N5 汇聚与 END_OK 使用。
# 输入：generic_text, platform_text, configurable_text（未执行分支为空）

def main(
    generic_text: str,
    platform_text: str,
    configurable_text: str,
) -> dict:
    video_script = (generic_text or platform_text or configurable_text or "").strip()
    return {"video_script": video_script}
