# Dify 知识库生成工作流 — 实现文档（逐步搭建）

> 契约摘要：[`dify/knowledge/README.md`](../../dify/knowledge/README.md)  
> 画布清单：[`knowledge-generation-v1-manifest.json`](../../dify/knowledge/mcp/resources/knowledge-generation-v1-manifest.json)

**客户端已对接**：设定侧栏 / 菜单 **生成 → AI 生成知识库** → `dify:generateKnowledge`（见 `electron/main/ipc/dify.ipc.ts`）。

---

## 1. 前置条件

| 项 | 要求 |
|----|------|
| Dify | ≥ 0.15，Workflow + Code + LLM Structured Output |
| 模型 | 创作模型（K1）+ 推理模型（K2） |
| API | `POST /v1/workflows/run` |
| 本地 | 本仓库 `dify/knowledge/` 目录 |

```bash
DIFY_BASE_URL=http://127.0.0.1/v1
DIFY_API_KEY=app-xxxxxxxx          # 知识库应用独立 Key
```

---

## 2. 仓库资产

```
dify/knowledge/
├── prompts/
│   ├── k1-knowledge-generate.md      # K1 System
│   ├── k1-knowledge-user.jinja.md    # K1 User（Jinja）
│   ├── k2-knowledge-validate.md      # K2 System
│   └── k2-knowledge-user.jinja.md    # K2 User
├── code/
│   ├── knowledge_k1_extract.py       # K1X
│   ├── knowledge_agg_validation.py   # AGG
│   ├── knowledge_retry_end.py        # RE
│   ├── knowledge_cb_circuit_break.py # CB
│   ├── knowledge_end_success.py      # END_OK
│   └── knowledge_parse_end_outputs.py# PARSE
├── mcp/schemas/
│   ├── knowledge-generate.input.json
│   ├── knowledge-generate.output.json
│   ├── k1-knowledge.output.json
│   └── k2-knowledge-validate.output.json
├── mcp/tools/novels_knowledge_generate.json
└── fixtures/knowledge-run.sample.json
```

本地自检（无需 Dify）：

```bash
python scripts/test-knowledge-code-nodes.py
```

---

## 3. 创建 Dify 应用

1. Dify → **创建应用** → **工作流（Workflow）**
2. 名称：`Novel Knowledge Generation v1`
3. 与章节/大纲应用 **分开** 发布，复制 **独立 API Key**
4. NovelsCreator → 设置 → Dify → **知识库生成** 填入该 Key

---

## 4. START（开始）变量

**全部设为「文本 / String」**（数字也以 string 传入）。

| 变量名 | 必填 | 默认 | 说明 |
|--------|------|------|------|
| project_id | ✓ | | 项目 UUID |
| knowledge_brief | ✓ | | 用户创作 brief |
| existing_knowledge_snapshot | ✓ | `{}` | 客户端轻量 JSON 快照 |
| genre / tone / era / scene | | 空 | 来自 world 设定 |
| generation_mode | ✓ | `bootstrap` | `bootstrap` \| `expand` |
| max_retry | ✓ | `3` | 最大重试 |
| retry_count | | `0` | 客户端重试轮次 |
| retry_issues_formatted | | 空 | K2 驳回清单，供 K1 修订 |

Schema：[`knowledge-generate.input.json`](../../dify/knowledge/mcp/schemas/knowledge-generate.input.json)

---

## 5. 画布拓扑（11 节点）

```text
START → K1 → K1X → K2 → AGG → IF-ROUTE
                              ├─ retry         → RE    ─┐
                              ├─ circuit_break → CB    ─┼→ PARSE → END
                              └─ continue      → END_OK ─┘
```

**禁止** RE → K1 回连（Plan B：客户端收到 `status=retry` 后递增 `retry_count` 再 POST）。

**K2/AGG/RE/CB/END_OK 的 knowledge_json 必须绑 K1X，勿绑 K1 原始输出。**

---

## 6. K1 — 知识库生成 LLM

| 配置项 | 值 |
|--------|-----|
| **System** | 复制 `prompts/k1-knowledge-generate.md` 中 **「System 正文」** 整段 |
| **User** | 复制 `prompts/k1-knowledge-user.jinja.md`，**开启 Jinja** |
| temperature | **0.75** |
| 结构化输出 | **开**，Schema 粘贴 `mcp/schemas/k1-knowledge.output.json` |
| 记忆 / RAG / 视觉 | **关** |
| 输出变量 | 建议将 `text` 重命名为 `k1_result` |

**User 绑定变量**（来自 START）：

`retry_issues_formatted`, `knowledge_brief`, `existing_knowledge_snapshot`, `generation_mode`, `genre`, `tone`, `era`, `scene`

---

## 7. K1X — K1 解析 Code

| 项 | 值 |
|----|-----|
| 源码 | `code/knowledge_k1_extract.py` |
| 输入 | `k1_result` ← **K1.text**；`structured_output` ← **K1.structured_output** |
| 输出 | `knowledge_summary`（String）、`knowledge_json`（String） |

下游统一使用 **K1X.knowledge_json**（仅 `{ world, characters, factions, items }`）。

---

## 8. K2 — 结构校验 LLM

| 配置项 | 值 |
|--------|-----|
| **System** | 复制 `prompts/k2-knowledge-validate.md` 中 **「System 正文」** 整段 |
| **User** | 复制 `prompts/k2-knowledge-user.jinja.md` |
| temperature | **0.2** |
| 结构化输出 | **开**，Schema 粘贴 `mcp/schemas/k2-knowledge-validate.output.json` |
| 输出 | `text` → 建议重命名 `validate_result` |

**User 绑定**：

`knowledge_json` ← K1X.knowledge_json  
`knowledge_summary` ← K1X.knowledge_summary  
`knowledge_brief`, `existing_knowledge_snapshot`, `generation_mode`, `genre`, `tone`, `era`, `scene` ← START

---

## 9. AGG — 校验聚合 Code

| 项 | 值 |
|----|-----|
| 源码 | `code/knowledge_agg_validation.py` |
| 输入 | `validate_result` ← K2.text；`retry_count`, `max_retry` ← START；`knowledge_json` ← **K1X** |
| 输出 | `route`, `retry_count`, `retry_issues_formatted`, `knowledge_valid`, `validation_report`, `knowledge_json` |

---

## 10. IF-ROUTE — 条件分支

| 条件 | 目标 |
|------|------|
| `AGG.route` == `retry` | RE |
| `AGG.route` == `circuit_break` | CB |
| `AGG.route` == `continue` | END_OK |

---

## 11. RE / CB / END_OK — 终端 Code

| 节点 | 源码 | 关键输入 |
|------|------|----------|
| RE | `knowledge_retry_end.py` | knowledge_json/summary ← K1X；retry_count/issues/report ← AGG |
| CB | `knowledge_cb_circuit_break.py` | 同上（无 retry_issues） |
| END_OK | `knowledge_end_success.py` | knowledge_json/summary ← K1X；validation_report ← AGG；retry_count ← START |

各节点输出变量名统一为 **`end_outputs`**（String JSON）。

---

## 12. PARSE → END

**PARSE**（`knowledge_parse_end_outputs.py`）：

| 输入 | 来源 |
|------|------|
| re_end_outputs | RE.end_outputs |
| cb_end_outputs | CB.end_outputs |
| ok_end_outputs | END_OK.end_outputs |

**END 节点输出变量**（全部 String，绑 PARSE）：

| END 字段 | PARSE 字段 |
|----------|------------|
| status | PARSE.status |
| circuit_break | PARSE.circuit_break |
| human_action_required | PARSE.human_action_required |
| retry_count | PARSE.retry_count |
| knowledge_summary | PARSE.knowledge_summary |
| knowledge_json | PARSE.knowledge_json |
| validation_report | PARSE.validation_report |
| retry_issues_formatted | PARSE.retry_issues_formatted |
| workflow_version | PARSE.workflow_version |

---

## 13. 试运行

Dify 调试或 curl，导入 [`fixtures/knowledge-run.sample.md`](../../dify/knowledge/fixtures/knowledge-run.sample.md)（**Markdown 导入**）或 [`knowledge-run.sample.json`](../../dify/knowledge/fixtures/knowledge-run.sample.json) 的 `inputs`。

期望成功时：

- `status` = `success`
- `knowledge_json` 含非空 `world.rules` 与 ≥3 个 `characters`
- `workflow_version` = `novel-knowledge-generation-v1`

客户端在 `status=retry` 时会携带 `retry_issues_formatted` 与递增后的 `retry_count` 再次调用。

---

## 14. 与客户端合并

- 解析：`src/utils/knowledge-dify-merge.ts` → `parseKnowledgeJson`
- 合并：`mergeKnowledgeDocument`（bootstrap 覆盖空档 / expand 按 id 增量）
- **不写入** map/locations/nations（保留 WorldEngine 与社会层结果）

---

## 15. 常见问题

| 现象 | 处理 |
|------|------|
| K1X 输出空 characters | 检查 K1 Structured Output Schema 是否粘贴完整；K1X 须绑 `structured_output` |
| 一直 retry | 看 `retry_issues_formatted`；多为 brief 与 world.rules 冲突 |
| circuit_break | 已达 max_retry；客户端提示人工修订 brief 或手动编辑 knowledge.json |
| 客户端 401 | 设置里填的是 **知识库生成** Key，不是章节/大纲 Key |
