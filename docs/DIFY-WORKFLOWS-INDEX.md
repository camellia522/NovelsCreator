# Dify 工作流文档索引

NovelsCreator 的 **Dify Workflow** 用于章节、大纲、以及世界观向导中的 **社会层**（国家/城市文案）。**地图**由本地 **WorldEngine** 生成，不走 Dify。

| 类型 | 技术 | 文档 |
|------|------|------|
| 地图 + 卫星贴图 | **WorldEngine**（Python） | [world/WORLDENGINE.md](./world/WORLDENGINE.md) · [world/world-map-generation.md](./world/world-map-generation.md) |
| 国家/城市（领土已绘） | **Dify** `novel-world-society-v1` | [world/w2-society/](./world/w2-society/) |

---

## Dify 应用一览

| 工作流 | workflow_id | MCP Tool | 客户端入口 | 文档 |
|--------|-------------|----------|------------|------|
| **章节生成** | `novel-chapter-generation-v1.1` | `novels_chapter_generate` | 大纲 / 三要素向导 | [§1](#1-章节生成) |
| **大纲生成** | `novel-outline-generation-v1` | `novels_outline_generate` | AI 生成大纲 | [§2](#2-大纲生成) |
| **世界观社会层** | `novel-world-society-v1` | `novels_world_society_generate` | 世界观生成器 → **世界观生成** | [§3](#3-世界观社会层) |
| **知识库生成** | `novel-knowledge-generation-v1` | `novels_knowledge_generate` | 设定 → **AI 生成知识库** | [§4](#4-知识库生成) |

> **已下线**：`novel-world-generate-v1`（W1 JSON + 万相/ComfyUI 地图图）— 相关文档已删除，客户端不调用。

通用约定：

- Schema：**JSON Schema 2020-12**
- 调用：`POST {baseUrl}/workflows/run`，`response_mode: blocking`
- 资产：[`dify/`](../dify/)（`chapter/` · `outline/` · `knowledge/` · `world/` · `shared/`）
- **DSL 导入包**：[`deploy/dify/workflows/`](../deploy/dify/workflows/)（推荐用户一键导入，见 [deploy/dify/README.md](../deploy/dify/README.md)）

---

## 1. 章节生成

目录：[`chapter/`](./chapter/)

| 文档 | 说明 |
|------|------|
| [DIFY-WORKFLOW-DESIGN.md](./chapter/DIFY-WORKFLOW-DESIGN.md) | 设计目标、MCP 映射 |
| [DIFY-WORKFLOW-IMPLEMENTATION.md](./chapter/DIFY-WORKFLOW-IMPLEMENTATION.md) | 搭建步骤 |
| [DIFY-WORKFLOW-NODES-AND-FLOW.md](./chapter/DIFY-WORKFLOW-NODES-AND-FLOW.md) | 节点配置 |
| [DIFY-WORKFLOW-MODULES-AND-PROCESS.md](./chapter/DIFY-WORKFLOW-MODULES-AND-PROCESS.md) | 端到端流程 |

**Prompt / Code**：`dify/chapter/prompts/n1-draft.md` …

---

## 2. 大纲生成

目录：[`outline/`](./outline/)

| 文档 | 说明 |
|------|------|
| [DIFY-OUTLINE-WORKFLOW-DESIGN.md](./outline/DIFY-OUTLINE-WORKFLOW-DESIGN.md) | IO 契约 |
| [DIFY-OUTLINE-WORKFLOW-IMPLEMENTATION.md](./outline/DIFY-OUTLINE-WORKFLOW-IMPLEMENTATION.md) | 搭建步骤 |
| [DIFY-OUTLINE-WORKFLOW-NODES-AND-FLOW.md](./outline/DIFY-OUTLINE-WORKFLOW-NODES-AND-FLOW.md) | 节点配置 |

---

## 3. 世界观社会层

目录：[`world/w2-society/`](./world/w2-society/)

| 文档 | 说明 |
|------|------|
| [DIFY-WORKFLOW-DESIGN.md](./world/w2-society/DIFY-WORKFLOW-DESIGN.md) | 设计目标、MCP 映射 |
| [DIFY-WORKFLOW-IMPLEMENTATION.md](./world/w2-society/DIFY-WORKFLOW-IMPLEMENTATION.md) | 搭建步骤 |
| [DIFY-WORKFLOW-NODES-AND-FLOW.md](./world/w2-society/DIFY-WORKFLOW-NODES-AND-FLOW.md) | 节点配置 |
| [DIFY-WORKFLOW-MODULES-AND-PROCESS.md](./world/w2-society/DIFY-WORKFLOW-MODULES-AND-PROCESS.md) | 端到端流程 |
| [PROMPT-DESIGN.md](./world/w2-society/PROMPT-DESIGN.md) | W2S Prompt 体系 |
| [WORLD-GENERATOR-WIZARD.md](./world/w2-society/WORLD-GENERATOR-WIZARD.md) | 五步向导与客户端组装 |

**IPC**：`world:generateSociety` · `generation_mode=territory_society`

**Prompt / Code**：`dify/world/prompts/w2-territory-society.md` · `world_s2_extract.py`

---

## 4. 知识库生成

目录：[`dify/knowledge/`](../dify/knowledge/) · [`docs/knowledge/`](./knowledge/)

| 文档 | 说明 |
|------|------|
| [DIFY-KNOWLEDGE-WORKFLOW-IMPLEMENTATION.md](./knowledge/DIFY-KNOWLEDGE-WORKFLOW-IMPLEMENTATION.md) | **逐步搭建**（Prompt / Code / END 绑定） |
| [KNOWLEDGE-BRIEF-GUIDE.md](./knowledge/KNOWLEDGE-BRIEF-GUIDE.md) | **创作 brief 模板与作者参考** |
| [README.md](../dify/knowledge/README.md) | START/END 契约摘要 |

**IPC**：`dify:generateKnowledge` · `generation_mode=bootstrap|expand`

**Prompt / Code**：`dify/knowledge/prompts/k1-knowledge-generate.md` · `knowledge_k1_extract.py` …

**客户端合并**：`src/utils/knowledge-dify-merge.ts`

---

## 5. 设置与 API Key

客户端 **设置 → Dify 工作流**：共用 Base URL，各工作流独立 API Key。

| 工作流 | workflow_id | 设置项 |
|--------|-------------|--------|
| 章节生成 | `novel-chapter-generation-v1.1` | 章节生成 |
| 大纲生成 | `novel-outline-generation-v1` | 大纲生成 |
| 世界观社会层 | `novel-world-society-v1` | 世界观社会层 |
| 知识库生成 | `novel-knowledge-generation-v1` | 知识库生成 |
| 地图 | — | **无需 Dify**（WorldEngine 本地） |

旧版单 Key 配置会在首次启动时**迁移到「章节生成」**槽位。

---

## 6. MCP Tools

| Tool | 状态 |
|------|------|
| `novels_chapter_generate` | 活跃 |
| `novels_outline_generate` | 活跃 |
| `novels_world_generate` | **已废弃**（地图改 WorldEngine） |
| `novels_world_society_generate` | 活跃 · `dify/world/mcp/tools/novels_world_society_generate.json` |
| `novels_knowledge_generate` | 活跃 · `dify/knowledge/mcp/tools/novels_knowledge_generate.json` |
| `novels_dify_health_check` | 活跃 |

社会层 Schema：`dify/world/mcp/schemas/world-society-generate.*.json`  
知识库 Schema：`dify/knowledge/mcp/schemas/knowledge-generate.*.json`

---

## 7. 客户端应用文档

[`app/`](./app/) — [USER-GUIDE.md](./app/USER-GUIDE.md) · [DEVELOPMENT.md](./app/DEVELOPMENT.md)
