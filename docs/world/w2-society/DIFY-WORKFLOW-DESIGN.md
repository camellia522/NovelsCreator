# Dify 工作流 — 设计文档（MCP 协议对齐）

> 工作流 ID：**`novel-world-society-v1`**  
> MCP Tool：**`novels_world_society_generate`**  
> `generation_mode`：**`territory_society`**（客户端固定）  
> Schema 方言：**JSON Schema 2020-12**  
> 关联：[PROMPT-DESIGN.md](./PROMPT-DESIGN.md) · [WORLD-GENERATOR-WIZARD.md](./WORLD-GENERATOR-WIZARD.md) · [DIFY-WORKFLOW-IMPLEMENTATION.md](./DIFY-WORKFLOW-IMPLEMENTATION.md) · [DIFY-WORKFLOWS-INDEX.md](../../DIFY-WORKFLOWS-INDEX.md)

---

## 目录

1. [设计目标与边界](#1-设计目标与边界)
2. [MCP 协议映射](#2-mcp-协议映射)
3. [工作流拓扑](#3-工作流拓扑)
4. [节点规格书](#4-节点规格书)
5. [变量与状态](#5-变量与状态)
6. [输入输出契约](#6-输入输出契约)
7. [错误与降级模型](#7-错误与降级模型)
8. [与客户端 / MCP 消费者关系](#8-与客户端--mcp-消费者关系)
9. [与 WorldEngine 地图边界](#9-与-worldengine-地图边界)
10. [版本演进](#10-版本演进)

---

## 1. 设计目标与边界

### 1.1 目标

| 目标 | 说明 |
|------|------|
| **社会层外置** | 国家政体/文化/简介 + 聚落 JSON 在 Dify 内由 W2S 生成 |
| **环境差异化** | 依据 `territory_json` 各国海岸/荒漠/发展度等与 `projectConfig` 写出差异设定 |
| **MCP 可发现** | Tool + Schema + Manifest 可机器校验 |
| **结构化 IO** | 输入/输出符合 JSON Schema 2020-12 |
| **本地兜底** | 无 Key / 失败时客户端 `generateLocalSociety()` 仍可用 |
| **作者可改** | 生成后向导内可编辑国名、城名、政体等 |

### 1.2 边界（工作流不负责）

- WorldEngine 地图 / 卫星 PNG（本地 Python）
- 六边形领土涂抹（客户端 `WorldMapEditor`）
- 六边形格心**默认选址**（本地 `placeCitiesOnHexTerritory`）
- 项目文件落盘（Electron `knowledge.store`）
- 修改 `map` / `hexGrid` 地形

### 1.3 部署形态

```
┌─────────────────┐     POST /workflows/run    ┌──────────────────────┐
│ NovelsCreator   │ ─────────────────────────► │ Dify Workflow        │
│ world:generate  │   generation_mode=         │ novel-world-society  │
│ Society         │   territory_society        │ -v1                  │
└─────────────────┘                            └──────────────────────┘
        │                                                │
        │ 本地先算 generateLocalSociety                  │ W2S LLM
        ▼ mergeSocietyWithLlm                            ▼
   WorldGeneratorView 步骤 4
```

---

## 2. MCP 协议映射

### 2.1 MCP 能力矩阵

| MCP 原语 | NovelsCreator 映射 | 资产路径 |
|----------|---------------------|----------|
| **Tool** | `novels_world_society_generate` | [`dify/world/mcp/tools/novels_world_society_generate.json`](../../../dify/world/mcp/tools/novels_world_society_generate.json) |
| **Tool** | `novels_dify_health_check` | [`dify/shared/mcp/tools/novels_dify_health_check.json`](../../../dify/shared/mcp/tools/novels_dify_health_check.json) |
| **Resource** | Workflow Manifest | `novelscreator://dify/workflow/world-society-v1/manifest` |
| **Resource** | Input Schema | [`world-society-generate.input.json`](../../../dify/world/mcp/schemas/world-society-generate.input.json) |
| **Resource** | Output Schema | [`world-society-generate.output.json`](../../../dify/world/mcp/schemas/world-society-generate.output.json) |
| **Resource** | Prompt | `novelscreator://dify/world/prompts/w2-territory-society` |

Manifest：[`world-society-generate-manifest.json`](../../../dify/world/mcp/resources/world-society-generate-manifest.json)

### 2.2 调用约定

- `POST {baseUrl}/workflows/run`
- `response_mode: blocking`
- 所有 **inputs 值为 string**（与章节工作流一致）
- **重试**：v1 无 Dify 内重试环；失败由客户端回退本地结果

---

## 3. 工作流拓扑

### 3.1 标准 6 节点

```text
START → W2S(LLM) → W2SX(Code) → END_OK(Code) → PARSE(Code) → END
```

```mermaid
flowchart LR
    START([START]) --> W2S[W2S LLM]
    W2S --> W2SX[W2SX 解析]
    W2SX --> END_OK[END_OK 组装]
    END_OK --> PARSE[PARSE 扁平化]
    PARSE --> END([END])
```

### 3.2 禁止拓扑

- W2S → END（跳过 W2SX）
- 任何图像 / 万相 / ComfyUI 节点
- 与 `novel-world-generate-v1`（已废弃地图流）混用同一应用

---

## 4. 节点规格书

| ID | 类型 | 职责 | LLM |
|----|------|------|-----|
| START | 开始 | 14 个 string inputs | 否 |
| W2S | LLM | 社会层 JSON | **是** |
| W2SX | 代码 | 解析 W2S 输出 | 否 |
| END_OK | 代码 | 打包 end_outputs | 否 |
| PARSE | 代码 | 扁平化 outputs | 否 |
| END | 结束 | API outputs | 否 |

详表：[DIFY-WORKFLOW-NODES-AND-FLOW.md](./DIFY-WORKFLOW-NODES-AND-FLOW.md)

---

## 5. 变量与状态

### 5.1 无工作流内状态机

单次 `POST` 即完成；无 `retry_count` / 条件分支。

### 5.2 客户端合并状态

| 字段 | 值 |
|------|-----|
| `society.source` | `local` \| `llm` \| `hybrid` |
| `societyDone` | 向导步骤 4 是否已生成 |

---

## 6. 输入输出契约

### 6.1 输入（START）

Schema：[`world-society-generate.input.json`](../../../dify/world/mcp/schemas/world-society-generate.input.json)

| 变量 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目 id |
| `generation_mode` | string | 固定 `territory_society` |
| `world_name` … `creative_brief` | string | 见 [WORLD-GENERATOR-WIZARD.md](./WORLD-GENERATOR-WIZARD.md) |
| `territory_json` | string | 领土 + projectConfig JSON 串 |
| `nations_outline_json` | string | `[{id,name}]` JSON 串 |

### 6.2 输出（END ← PARSE）

Schema：[`world-society-generate.output.json`](../../../dify/world/mcp/schemas/world-society-generate.output.json)

| 变量 | 优先级 | 说明 |
|------|--------|------|
| `society_json` | **推荐** | `{world_rules,nations,locations}` |
| `nations_json` | 备选 | |
| `locations_json` | 备选 | |
| `world_rules` | 备选 | |
| `status` | 可选 | `success` |

### 6.3 `society_json` 逻辑对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `world_rules` | string | 300–600 字 |
| `nations` | array | 保留输入 `id` |
| `locations` | array | x,y ∈ [0,100]，陆格内 |

TypeScript：[`WorldNation`](../../../src/types/project.ts) · [`WorldLocation`](../../../src/types/project.ts)

---

## 7. 错误与降级模型

| 情况 | Dify | 客户端 |
|------|------|--------|
| 无 API Key | — | 仅 `generateLocalSociety()` |
| 无 society_json | END 缺字段 | 保留 local，`societySource` 提示 |
| LLM locations 过少 | — | 保留本地选址 |
| HTTP 4xx/5xx | 报错 | 保留 local + error 文案 |
| 未涂领土 | — | 阻止进入步骤 4 |

---

## 8. 与客户端 / MCP 消费者关系

| 组件 | 路径 |
|------|------|
| IPC | `world:generateSociety` · `electron/main/ipc/world-gen.ipc.ts` |
| Dify HTTP | `electron/main/services/world-society.service.ts` |
| 领土 JSON | `buildTerritoryBriefJson()` · `src/utils/world-territory-society.ts` |
| 本地 + 合并 | `generateLocalSociety` · `mergeSocietyWithLlm` |
| UI | `src/views/WorldGeneratorView.vue` |

端到端：[DIFY-WORKFLOW-MODULES-AND-PROCESS.md §6](./DIFY-WORKFLOW-MODULES-AND-PROCESS.md#6-端到端流程设计)

---

## 9. 与 WorldEngine 地图边界

| 能力 | WorldEngine | novel-world-society-v1 |
|------|-------------|------------------------|
| 高程 / PNG | ✓ | ✗ |
| 领土涂抹 | 客户端 | 前提 |
| 国家/城市文案 | 本地默认 | LLM 可选 |

---

## 10. 版本演进

| 版本 | 说明 |
|------|------|
| v1 | START → W2S → W2SX → END_OK → PARSE → END（当前） |
| v1.1（规划） | 独立 `societyApiKey` 设置项；MCP Server 正式代理 |
