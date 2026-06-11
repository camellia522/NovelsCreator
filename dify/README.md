# Dify 工作流资产（Legacy）

本目录为 **Dify Legacy 高级模式** 的工作流实现资产，与 **MCP JSON Schema 2020-12** 对齐。  
**v1.0 默认**使用 `electron/main/workflows/` 内置 LangGraph；本目录仍作契约基准与 DSL 导入源。

**总索引**：[docs/README.md](../docs/README.md) · [DIFY-WORKFLOWS-INDEX.md](../docs/DIFY-WORKFLOWS-INDEX.md) · [v1.0/README.md](../docs/v1.0/README.md)

---

## 目录结构

```
dify/
├── chapter/          # 章节生成 novel-chapter-generation-v1.1
├── outline/          # 大纲生成 novel-outline-generation-v1
├── knowledge/        # 知识库生成 novel-knowledge-generation-v1
├── world/            # 世界观社会层 novel-world-society-v1
└── shared/           # 多工作流共用 Code / MCP
```

---

## 四条工作流（Legacy）

| 工作流 | workflow_id | 资产目录 |
|--------|-------------|----------|
| **章节生成** | `novel-chapter-generation-v1.1` | [`chapter/`](./chapter/) |
| **大纲生成** | `novel-outline-generation-v1` | [`outline/`](./outline/) |
| **知识库生成** | `novel-knowledge-generation-v1` | [`knowledge/`](./knowledge/) |
| **世界观社会层** | `novel-world-society-v1` | [`world/`](./world/) |

> **地图**由客户端内置 **WorldEngine** 生成，不经过 Dify。

---

## 客户端对接（v1.0）

| 能力 | 默认（Local） | Legacy（Dify） |
|------|---------------|----------------|
| 章节 | `ai:generateChapter` | 同上（runner 切换） |
| 大纲 | `ai:generateOutline` | 同上 |
| 知识库 | `ai:generateKnowledge` | 同上 |
| 社会层 | `world:generateSociety` | 同上 |
| 地图 | `world:generate` | — |

设置 → **AI** → 引擎：**内置 LangGraph** / **Dify Legacy**。

---

## 重试策略

章节与大纲采用 **方案 B**（客户端多次 POST）。详见各工作流 `DIFY-WORKFLOW-NODES-AND-FLOW.md`。

---

*文档版本：v1.0 · 与 NovelsCreator 1.0.0 对齐*
