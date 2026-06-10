# P0 · Context Merge
# Dify Code 节点 · 语言 Python3
# 输入变量：generation_prompt, knowledge_snapshot, outline_beats, generation_prompt_text(可选)
# 输出变量：merged_context, effective_beats, has_wizard, chapter_goal

import json


def safe_json(s: str, default=None):
    if not s or not str(s).strip():
        return default if default is not None else {}
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return default if default is not None else {}


def find_char(characters, char_id, name):
    for c in characters or []:
        if char_id and c.get("id") == char_id:
            return c
        if name and c.get("name") == name:
            return c
    return None


def main(
    generation_prompt: str = "",
    knowledge_snapshot: str = "",
    outline_beats: str = "",
    generation_prompt_text: str = "",
    **kwargs,
) -> dict:
    gp = safe_json(generation_prompt, None)
    ks = safe_json(knowledge_snapshot, {})
    beats = safe_json(outline_beats, [])

    if gp and gp.get("plot") and gp["plot"].get("beats"):
        effective_beats = gp["plot"]["beats"]
        chapter_goal = gp["plot"].get("chapterGoal", "")
    else:
        effective_beats = beats if isinstance(beats, list) else []
        chapter_goal = ""

    characters = []
    if gp and gp.get("characters"):
        for wc in gp["characters"]:
            kb = find_char(ks.get("characters", []), wc.get("id"), wc.get("name"))
            merged = dict(wc)
            if kb:
                merged["relationships"] = kb.get("relationships", [])
                merged["factionId"] = kb.get("factionId")
                merged["arc"] = kb.get("arc")
            characters.append(merged)
    else:
        characters = ks.get("characters", [])

    world = dict(ks.get("world") or {})
    wizard_env = gp.get("environment") if gp else None

    merged = {
        "has_wizard": gp is not None,
        "world": world,
        "wizard_env": wizard_env,
        "characters": characters,
        "factions": ks.get("factions", []),
        "items": ks.get("items", []),
        "nations": ks.get("nations", []),
        "locations": ks.get("locations", []),
        "regions": ks.get("regions", []),
        "mapMeta": ks.get("mapMeta"),
    }

    return {
        "merged_context": json.dumps(merged, ensure_ascii=False),
        "effective_beats": json.dumps(effective_beats, ensure_ascii=False),
        "has_wizard": "true" if gp else "false",
        "chapter_goal": chapter_goal or "",
    }
