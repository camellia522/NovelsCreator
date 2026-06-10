{% if merged_context %}

## 上下文（P0 合并）

{{ merged_context }}



## 待校验大纲（O1X 输出，必填）

{{ outline_json }}

{% else %}

## 待校验大纲（必填，O1X.outline_json · 须为 JSON 含 volumes）

{{ outline_json }}

{% if not outline_json or outline_json == '{}' or outline_json == '{"volumes":[]}' or outline_json == '{"volumes": []}' %}
⚠️ outline_json 为空或 volumes 为空 → 只输出 1 条 hard issue，勿臆造其它校验项。
{% endif %}



## 知识库

{{ knowledge_snapshot }}



## 剧情记忆

{{ plot_memory }}



{% if generation_mode == 'single_chapter' %}

## 单章校验模式（generation_mode=single_chapter）

- 目标卷：**{{ volume_id }}**

- 待校验新章 id：**{{ next_chapter_id }}**（outline_json 中应仅有此 1 章）

- 目标章数：**{{ target_chapters }}**（应为 1）



## 本卷已有章节（canonical · 高于 plot_memory）

{{ existing_volume_outline }}



**记忆优先级（审读时必须遵守）**

1. `existing_volume_outline` 中已有章节的 beats = 已落盘大纲，**不得**因 plot_memory 中旧摘要不同而判 hard fail。

2. plot_memory 仅用于校验**新章**是否承接 existing_volume_outline 最后一章的因果。

3. **禁止**用 plot_memory 里「未出现在 existing_volume_outline 的章 id」或「正文遗留摘要」否定新章。

4. 勿校验 plot_memory 与 `next_chapter_id` 是否一致（新章本来就要写入/更新）。



{% else %}

## 目标（全书模式）

- 卷数约 **{{ target_volumes }}**

- 章数约 **{{ target_chapters }}**

{% endif %}

{% endif %}



请按 System 要求输出校验 JSON。禁止输出 think / redacted_thinking 思考过程。

