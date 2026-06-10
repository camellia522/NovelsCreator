{% if retry_issues_formatted %}

## 编辑驳回（最高优先级 · 须逐条修复）

以下 hard issue 必须在本次 JSON 中全部消除；**不得**再引入相同违规设定。

{{ retry_issues_formatted }}

{% endif %}

## 创作 Brief（必填）

{{ knowledge_brief }}

## 已有知识库快照

{% if existing_knowledge_snapshot %}

{{ existing_knowledge_snapshot }}

{% else %}

{}

{% endif %}

## 生成模式

- **generation_mode**：{{ generation_mode | default("bootstrap", true) }}
{% if generation_mode == 'expand' %}
- **expand 模式**：保留 snapshot 中已有 id 与姓名，只补充/深化缺失字段；禁止删除或重命名已有实体。
{% else %}
- **bootstrap 模式**：在 brief 约束下从零搭建；若 snapshot 非空，与之冲突的字段以 brief 为准。
{% endif %}

## 世界观标签

- 类型：{{ genre | default("未指定", true) }}
- 基调：{{ tone | default("未指定", true) }}
- 时代：{{ era | default("未指定", true) }}
- 场景：{{ scene | default("未指定", true) }}

## 输出要求

1. `knowledge_summary`：150–400 字，概括世界格局、核心冲突与主角处境。
2. `knowledge.world`：含 `title`、`rules`（≥80 字硬性设定），可填 genre/era/atmosphere/techLevel/magicConstraint/conflictFocus 等。
3. `knowledge.characters`：至少 3 名，每人含 id/name/role；主角须出现在 brief 指定姓名。
4. `knowledge.factions`：至少 1 个秘密或公开势力，含 goals。
5. `knowledge.items`：至少 1 件关键道具。
6. **不要**输出 map/locations/nations。

请直接输出符合 Schema 的 JSON。
