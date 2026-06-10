{% if retry_issues_formatted %}

## 编辑驳回（最高优先级 · 须逐条修复）

以下 hard issue 必须在本次 JSON 中全部消除；**不得**再引入相同违规设定。

{{ retry_issues_formatted }}

{% endif %}



## 知识库（必填，不可为空）

{{ knowledge_snapshot }}



## 剧情记忆

{{ plot_memory }}



{% if generation_mode == 'single_chapter' %}

## 单章生成模式（必填）

- 目标卷 id：**{{ volume_id }}**（outline 中 volumes[].id 须与此一致）

- 新章 id：**{{ next_chapter_id }}**（chapter.id 必须使用该值，不可改）

- 只输出 **1 章**：`outline.volumes` 仅 1 个卷条目，该卷 `chapters` 仅 1 条

- **必须**在 `outline.volumes[0].chapters[0].beats` 写 **3–8 条**具体事件节拍（每条 20–80 字）；**禁止**只在 `outline_summary` 写故事而不输出 beats

- **必须**严格遵循 `knowledge_snapshot.world.settingConstraints`、`world.magicConstraint` 与 `outline_brief` 中「设定锚点」及「实体白名单」
- **禁止**修仙/魔教/灵力/丹道/宗门/法术/穿越/系统/浮空岛/古神/星盘/超自然（除非 settingConstraints 明确允许）
- **禁止**现代都市创业/商战/互联网题材（除非 settingConstraints 明确允许）
- **beats 中须出现** brief 指定的主角姓名 + 至少 1 个 knowledge 已登记国家名 + 至少 1 个已登记地点名
- **禁止**自造与 knowledge 冲突的具名主角/都城/国家（如 brief 要求周衍则禁止写李然等替代名）

- `outline_summary` 写**本章**梗概（50–150 字），须与 beats 同一故事、同一设定

- 若 `existing_volume_outline.chapters` 为空，表示本卷尚无落盘章节，**仍须**输出完整 `chapter` + `beats`（id = `next_chapter_id`）

- 须承接 **existing_volume_outline** 最后一章与 plot_memory 前序摘要，不得吃书
- **plot_memory 与 existing_volume_outline 冲突时，以 existing_volume_outline 为准**



## 本卷已有章节

{{ existing_volume_outline }}



## 要求

- 类型：{{ genre | default("未指定", true) }}

- 基调：{{ tone | default("未指定", true) }}

- 补充说明：{{ outline_brief | default("无", true) }}



{% else %}

## 要求（必填）

- 目标 **{{ target_volumes }}** 卷、约 **{{ target_chapters }}** 章

- 类型：{{ genre | default("未指定", true) }}

- 基调：{{ tone | default("未指定", true) }}

- 补充说明：{{ outline_brief | default("无", true) }}

{% endif %}



只输出一个 JSON 对象。禁止 Markdown 代码块。禁止输出 think / redacted_thinking 思考过程。

