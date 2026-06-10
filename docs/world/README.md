# 世界观生成文档

地图由 **[Mindwerks WorldEngine](https://github.com/Mindwerks/worldengine)** 在本地生成；国家/城市文案可选 **Dify 社会层工作流**。

---

## 阅读路径

### 作者 / 开发者（地图管线）

| 顺序 | 文档 |
|------|------|
| 1 | [WORLDENGINE.md](./WORLDENGINE.md) — 环境、脚本、参数与官方 CLI 对齐 |
| 2 | [world-map-generation.md](./world-map-generation.md) — 客户端 IPC、数据结构、六边形编辑、持久化 |

### 搭 Dify「世界观生成」步（领土已绘）

目录：[w2-society/](./w2-society/)（结构与 [chapter/](../chapter/) 对齐）

| 顺序 | 文档 |
|------|------|
| 0 | [w2-society/README.md](./w2-society/README.md) — 阅读顺序 |
| 1 | [w2-society/DIFY-WORKFLOW-DESIGN.md](./w2-society/DIFY-WORKFLOW-DESIGN.md) — IO 契约 |
| 2 | [w2-society/DIFY-WORKFLOW-IMPLEMENTATION.md](./w2-society/DIFY-WORKFLOW-IMPLEMENTATION.md) — **Dify 搭建步骤** |
| 3 | [w2-society/DIFY-WORKFLOW-NODES-AND-FLOW.md](./w2-society/DIFY-WORKFLOW-NODES-AND-FLOW.md) — 节点与连线 |
| 4 | [w2-society/DIFY-WORKFLOW-MODULES-AND-PROCESS.md](./w2-society/DIFY-WORKFLOW-MODULES-AND-PROCESS.md) — 模块与流程 |
| 5 | [w2-society/PROMPT-DESIGN.md](./w2-society/PROMPT-DESIGN.md) · [WORLD-GENERATOR-WIZARD.md](./w2-society/WORLD-GENERATOR-WIZARD.md) |

资产：`dify/world/prompts/w2-territory-society.md` · `dify/world/mcp/schemas/world-society-generate.*.json`

---

## 向导步骤与文档对应

| UI 步骤 | 技术 |
|---------|------|
| 基础设定 / 地图参数 | WorldEngine → `world:generateNative` |
| 地图编辑 | 六边形领土涂抹（本地） |
| 世界观生成 | 本地规则 + 可选 Dify `novel-world-society-v1` |
| 预览与确认 | 写入 `knowledge/` |

---

## 已移除的文档

以下 **Dify 地图工作流**（W1 LLM + 万相/ComfyUI 文生图）文档已删除，不再维护：

- `DIFY-WORLD-WORKFLOW-*.md`、`CANVAS-REFACTOR.md`、`WORLD-PROMPT-DESIGN.md`、`PROCEDURAL-MAP-TEXTURE.md`
- `docs/world/w2/`（万相、ComfyUI、W2B 画布）

仓库中 `dify/world/` 下 W1 相关 Prompt/Code/MCP 仅作历史参考，客户端**不调用** `world:generate` / `novels_world_generate`。

总索引：[DIFY-WORKFLOWS-INDEX.md](../DIFY-WORKFLOWS-INDEX.md)
