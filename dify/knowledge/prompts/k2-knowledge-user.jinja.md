## 待校验知识库（K1X 输出）

### knowledge_summary

{{ knowledge_summary }}

### knowledge_json

{{ knowledge_json }}

## 创作 Brief

{{ knowledge_brief }}

## 已有快照（expand 模式须比对）

{{ existing_knowledge_snapshot }}

## 模式与标签

- generation_mode：{{ generation_mode | default("bootstrap", true) }}
- genre：{{ genre | default("未指定", true) }}
- tone：{{ tone | default("未指定", true) }}
- era：{{ era | default("未指定", true) }}
- scene：{{ scene | default("未指定", true) }}

请审读上述 JSON，输出校验结果 JSON（符合 Schema）。
