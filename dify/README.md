# Dify 工作流资产

本目录包含 NovelsCreator 在 Dify 平台的**三条工作流**实现资产，与 **MCP JSON Schema 2020-12** 对齐。

**总索引**：[docs/README.md](../docs/README.md) · [DIFY-WORKFLOWS-INDEX.md](../docs/DIFY-WORKFLOWS-INDEX.md)

---

## 目录结构

```
dify/
├── chapter/          # 章节生成 novel-chapter-generation-v1.1
│   ├── code/
│   ├── prompts/
│   ├── mcp/schemas|tools|resources/
│   └── fixtures/
├── outline/          # 大纲生成 novel-outline-generation-v1
│   ├── code/
│   ├── prompts/
│   └── mcp/schemas|tools|resources/
├── world/            # 世界观地图 novel-world-generate-v1
│   ├── code/
│   ├── prompts/
│   └── mcp/schemas|tools|resources/
└── shared/           # 多工作流共用
    ├── code/         # retry_end.py、cb_circuit_break.py
    └── mcp/tools/    # novels_dify_health_check
```

---

## 三条工作流

| 工作流 | workflow_id | MCP Tool | 资产目录 | 文档套件 |
|--------|-------------|----------|----------|----------|
| **章节生成** | `novel-chapter-generation-v1.1` | `novels_chapter_generate` | [`chapter/`](./chapter/) | [DIFY-WORKFLOW-*.md](../docs/chapter/DIFY-WORKFLOW-DESIGN.md) |
| **大纲生成** | `novel-outline-generation-v1` | `novels_outline_generate` | [`outline/`](./outline/) | [DIFY-OUTLINE-WORKFLOW-*.md](../docs/outline/DIFY-OUTLINE-WORKFLOW-DESIGN.md) |
| **世界观地图** | `novel-world-generate-v1` | `novels_world_generate` | [`world/`](./world/) | [docs/world/](../docs/world/README.md) · W2 [万相](../docs/world/w2/WANXIANG.md) |

---

## Prompt 文件对照

| 工作流 | 路径 |
|--------|------|
| 章节 | `chapter/prompts/n1-draft.md` … `n5-memory-patch.md` |
| 大纲 | `outline/prompts/o1-outline-generate.md`, `o2-outline-validate.md` |
| 世界观 | `world/prompts/w1-world-generate.md` |

Prompt 设计文档：

- [PROMPT-DESIGN.md](../docs/chapter/PROMPT-DESIGN.md) — 章节
- [OUTLINE-PROMPT-DESIGN.md](../docs/outline/OUTLINE-PROMPT-DESIGN.md) — 大纲
- [WORLD-PROMPT-DESIGN.md](../docs/world/WORLD-PROMPT-DESIGN.md) — 世界观

---

## Code 节点对照

| 工作流 | 主要 Code |
|--------|-----------|
| 章节 | `chapter/code/end_success.py`, `agg_validation.py`, `parse_end_outputs.py` 等 |
| 大纲 | `outline/code/outline_end_success.py`, `outline_agg_validation.py`, `outline_parse_end_outputs.py`, `outline_retry_end.py`, `outline_cb_circuit_break.py` |
| 世界观 | `world/code/world_end_success.py`, `world_parse_end_outputs.py` |
| **共用** | `shared/code/retry_end.py`, `cb_circuit_break.py`（**仅章节**重试环） |

---

## MCP Tools

| name | 路径 |
|------|------|
| `novels_chapter_generate` | `chapter/mcp/tools/novel_chapter_generate.json` |
| `novels_outline_generate` | `outline/mcp/tools/novels_outline_generate.json` |
| `novels_world_generate` | `world/mcp/tools/novels_world_generate.json` |
| `novels_dify_health_check` | `shared/mcp/tools/novels_dify_health_check.json` |

---

## 重试策略

章节与大纲工作流采用 **方案 B**（Dify 不回连首 LLM；客户端多次 POST）。  
世界观工作流 v1 **无重试环**，用户改 seed 重新生成。

详见 [DIFY-WORKFLOW-NODES-AND-FLOW.md](../docs/chapter/DIFY-WORKFLOW-NODES-AND-FLOW.md) §〇。

---

## 客户端对接状态

| 工作流 | Electron IPC | UI |
|--------|--------------|-----|
| 章节 | `dify:generateChapter` ✓ | 三要素向导 / 快速生成 |
| 世界观 | `world:generate` ✓ | 世界观生成器 |
| 大纲 | `outline:generate` 规划中 | 大纲面板 |
