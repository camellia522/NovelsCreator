# Dify Prompt 模板

模板文件供复制到 Dify Workflow 各 LLM 节点。**变量替换**使用 `{{ variable }}`；**条件与循环**使用 **Jinja2**，须在对应 Prompt 编辑器右上角打开 **Jinja** 开关。

## 须开启 Jinja 的节点

| 节点 | 文件 | 条件逻辑 |
|------|------|----------|
| **N1** | `n1-draft.md` | `retry_count`、`previous_chapter_summary` |
| **N2a** | `n2a-outline-validate.md` | `chapter_goal` |
| **N2b** | `n2b-lore-validate.md` | `has_wizard`、`plot_memory` |

## 无需 Jinja 的节点

仅简单变量占位、无 `{% if %}` / `{% for %}`：

- `n3-polish.md`、`n4a-novel-body.md`
- `n4b-video-*.md`、`n5-memory-patch.md`

（`n5` 中 JSON 示例里的 `{{chapter_id}}` 为 Dify 变量插入，**不要**开 Jinja 亦可；若已开启 Jinja，保持 `{{ chapter_id }}` 即可。）

## 语法对照（旧 Handlebars → Jinja2）

| Handlebars | Jinja2 |
|------------|--------|
| `{{#if x}}` | `{% if x %}` |
| `{{#if x > 0}}` | `{% if x \| int > 0 %}` |
| `{{/if}}` | `{% endif %}` |
| `{{#each items}}` | `{% for item in items %}` |
| `{{/each}}` | `{% endfor %}` |
| `{{name}}`（循环内） | `{{ item.name }}` |

## System 占位符

`{{GLOBAL_AUTHOR_SYSTEM}}` / `{{GLOBAL_VALIDATOR_SYSTEM}}` 在 Dify 中**手动粘贴** `_global-system.md` 对应章节，不会自动替换。
