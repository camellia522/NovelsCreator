# Dify 工作流 — 实现文档（MCP 协议对齐）

> 逐步在 Dify 搭建 **`novel-world-society-v1`**。  
> 设计：[DIFY-WORKFLOW-DESIGN.md](./DIFY-WORKFLOW-DESIGN.md) · 节点：[DIFY-WORKFLOW-NODES-AND-FLOW.md](./DIFY-WORKFLOW-NODES-AND-FLOW.md)

---

## 目录

1. [前置条件](#1-前置条件)
2. [仓库资产清单](#2-仓库资产清单)
3. [Dify 应用创建](#3-dify-应用创建)
4. [Start / End 节点配置](#4-start--end-节点配置)
5. [LLM 节点 W2S](#5-llm-节点-w2s)
6. [Code 节点实现](#6-code-节点实现)
7. [画布连线与发布](#7-画布连线与发布)
8. [客户端联调](#8-客户端联调)
9. [测试清单](#9-测试清单)
10. [故障排查](#10-故障排查)

---

## 1. 前置条件

| 项 | 要求 |
|----|------|
| Dify | ≥ 0.15，Workflow + Code + LLM |
| 模型 | 支持 Structured Output / JSON（GPT-4o / Claude Sonnet / DeepSeek-V3） |
| API | `POST /v1/workflows/run` |
| 本地 | 仓库含 `dify/world/`；WorldEngine 已可生成地图 |

**环境变量（联调 / 脚本）**

```bash
DIFY_BASE_URL=http://127.0.0.1/v1
DIFY_API_KEY=app-xxxxxxxx                    # novel-world-society-v1 应用 Key
DIFY_WORKFLOW_ID=novel-world-society-v1
```

---

## 2. 仓库资产清单

```
dify/world/
├── prompts/
│   ├── w2-territory-society.md      # W2S System
│   └── w2s-user.jinja.md            # W2S User
├── code/
│   ├── world_s2_extract.py          # W2SX
│   ├── world_society_end_success.py   # END_OK
│   └── world_society_parse_end_outputs.py  # PARSE
├── fixtures/society-run.sample.json # Dify 试运行
└── mcp/
    ├── schemas/world-society-generate.*.json
    ├── tools/novels_world_society_generate.json
    └── resources/world-society-generate-manifest.json

scripts/test-dify-world-society.ps1
```

---

## 3. Dify 应用创建

1. Dify → **创建应用** → **工作流（Workflow）**
2. 名称：`Novel World Society v1`
3. **不要**使用 Chatflow（无「用户输入→直接回复」）
4. 配置 LLM 供应商（设置 → 模型供应商）

---

## 4. Start / End 节点配置

### 4.1 START（开始）

类型均为 **文本 / String**：

| 变量名 | 必填 | 默认 |
|--------|------|------|
| project_id | ✓ | |
| generation_mode | ✓ | territory_society |
| world_name | ✓ | |
| era | ✓ | |
| atmosphere | ✓ | |
| scale | ✓ | continent |
| climate | ✓ | mixed |
| city_count | ✓ | 8 |
| include_landmarks | ✓ | true |
| seed | ✓ | |
| geological_years_ma | | 80 |
| territory_json | ✓ | |
| nations_outline_json | ✓ | |
| creative_brief | ✓ | |

Schema：[`world-society-generate.input.json`](../../../dify/world/mcp/schemas/world-society-generate.input.json)

### 4.2 END（结束）

输出 ← **PARSE** 同名（类型 **文本**），至少：

| END 输出 | PARSE 来源 |
|----------|------------|
| society_json | ✓ 推荐 |
| nations_json | 备选 |
| locations_json | |
| world_rules | |
| status | |

---

## 5. LLM 节点 W2S

详见 [PROMPT-DESIGN.md § W2S](./PROMPT-DESIGN.md#3-节点-w2s国家与城市-json) 与 [NODES § W2S](./DIFY-WORKFLOW-NODES-AND-FLOW.md#w2s--llm-国家与城市-json)。

| 配置项 | 值 |
|--------|-----|
| System | 复制 `w2-territory-society.md` |
| User | 复制 `w2s-user.jinja.md`，开 Jinja |
| temperature | 0.7 |
| 结构化 JSON | **开** |
| Max tokens | ≥ 8192 |
| 记忆 / RAG / 视觉 | **关** |
| 输出 | `text` → 建议改名 `w2s_json` → W2SX |

---

## 6. Code 节点实现

| 节点 | 源码 | 入参 → 出参 |
|------|------|-------------|
| **W2SX** | `world_s2_extract.py` | w2s_json ← W2S → society_json 等 4 字段 |
| **END_OK** | `world_society_end_success.py` | W2SX + workflow_version 常量 → end_outputs |
| **PARSE** | `world_society_parse_end_outputs.py` | end_outputs → status, society_json, … |

Code 节点「输出变量」须与 `main()` return **键名、类型（String）** 一致。

---

## 7. 画布连线与发布

```text
开始 → W2S → W2SX → END_OK → PARSE → 结束
```

1. 按 [NODES §1.2](./DIFY-WORKFLOW-NODES-AND-FLOW.md#12-画布连线表) 连接五条边  
2. **发布**应用  
3. API 访问 → 复制 **API Key**

---

## 8. 客户端联调

1. NovelsCreator **设置 → Dify 工作流**：Base URL + **世界观社会层** 应用 API Key  
2. `npm run dev`  
3. 工具 → 世界观生成器 → 涂领土 → **世界观生成**  
4. 应显示「本地选址 + 大模型润色」或本地兜底提示  
5. 侧栏点击国家可改国名

可选脚本：

```powershell
$env:DIFY_API_KEY = "app-..."
.\scripts\test-dify-world-society.ps1
```

---

## 9. 测试清单

### Dify 控制台

- [ ] START 14 变量齐全  
- [ ] W2S 开 JSON + Jinja  
- [ ] W2SX ← W2S 整段 text  
- [ ] END 暴露 society_json  
- [ ] 样例 [`society-run.sample.json`](../../../dify/world/fixtures/society-run.sample.json) 运行成功  
- [ ] 两国 nations 设定明显不同  

### NovelsCreator

- [ ] `world:generateSociety` 返回 ok  
- [ ] 无 Key 时仍有本地结果  
- [ ] 生成后可编辑国名/城名  
- [ ] 应用到项目后 knowledge 含 nations/locations  

---

## 10. 故障排查

| 现象 | 处理 |
|------|------|
| 未返回 society_json | END / W2SX 绑定；见 NODES § 排错 |
| W2SX 空 | 开结构化输出；w2s_json ← W2S.text |
| 401 | Key 须为本应用 |
| 各国雷同 | territory_json 是否含 developmentTier / traits |
| 客户端仅本地 | 检查设置 API Key 与 Dify 超时（300s） |

模块流程：[DIFY-WORKFLOW-MODULES-AND-PROCESS.md §11](./DIFY-WORKFLOW-MODULES-AND-PROCESS.md#11-验收与测试流程)
