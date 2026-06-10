# Dify 大纲生成工作流 — 实现文档（逐步搭建）

> 设计：[DIFY-OUTLINE-WORKFLOW-DESIGN.md](./DIFY-OUTLINE-WORKFLOW-DESIGN.md)  
> 节点详述：[DIFY-OUTLINE-WORKFLOW-NODES-AND-FLOW.md](./DIFY-OUTLINE-WORKFLOW-NODES-AND-FLOW.md)  
> 画布清单：[outline-generation-v1-manifest.json](../../dify/outline/mcp/resources/outline-generation-v1-manifest.json)

**客户端已对接**：NovelsCreator 侧栏「AI 生成」→ `dify:generateOutline`（见 `electron/main/ipc/dify.ipc.ts`）。

---

## 1. 前置条件

| 项 | 要求 |
|----|------|
| Dify | ≥ 0.15，Workflow + Code + LLM Structured Output |
| 模型 | 创作模型（O1）+ 推理模型（O2） |
| API | `POST /v1/workflows/run` |
| 本地 | 本仓库 `dify/outline/` 目录 |

```bash
# 联调环境变量
DIFY_BASE_URL=http://127.0.0.1/v1
DIFY_API_KEY=app-xxxxxxxx          # 大纲应用独立 Key
```

---

## 2. 仓库资产

```
dify/outline/
├── prompts/
│   ├── o1-outline-generate.md      # O1 System
│   ├── o1-outline-user.jinja.md    # O1 User（Jinja）
│   ├── o2-outline-validate.md      # O2 System
│   └── o2-outline-user.jinja.md    # O2 User
├── code/
│   ├── outline_o1_extract.py       # O1X：解析 O1 JSON
│   ├── outline_agg_validation.py   # AGG
│   ├── outline_retry_end.py        # RE
│   ├── outline_cb_circuit_break.py # CB
│   ├── outline_end_success.py      # END_OK
│   └── outline_parse_end_outputs.py# PARSE
├── mcp/schemas/
│   ├── outline-generate.input.json
│   ├── outline-generate.output.json
│   ├── o1-outline.output.json      # O1 结构化输出 Schema
│   └── o2-outline-validate.output.json
└── fixtures/outline-run.sample.json
```

本地自检（无需 Dify）：

```bash
python scripts/test-outline-code-nodes.py
```

---

## 3. 创建 Dify 应用

1. Dify → **创建应用** → **工作流（Workflow）**
2. 名称：`Novel Outline Generation v1`
3. 与章节应用 **分开** 发布，复制 **独立 API Key**
4. NovelsCreator → 设置 → Dify → **大纲生成** 填入该 Key

---

## 4. START（开始）变量

**全部设为「文本 / String」**（数字也以 string 传入）。  
**串行单章模式缺一不可**：`generation_mode`、`volume_id`、`next_chapter_id`、`existing_volume_outline`。

| 变量名 | 必填 | 默认 | 说明 |
|--------|------|------|------|
| project_id | ✓ | | 项目 UUID |
| knowledge_snapshot | ✓ | | JSON 串：world / characters / nations / locations |
| plot_memory | | `{"version":1,"globalSummary":"","chapterSummaries":[],"foreshadowing":[]}` | 剧情记忆 |
| outline_brief | | 空 | 客户端会自动拼设定锚点 |
| target_volumes | ✓ | `1` | 目标卷数 |
| target_chapters | ✓ | `1` | 单章模式客户端传 `1`；全书模式传章数 |
| genre | | 空 | 如 `史诗（架空）` |
| tone | | 空 | 如 `史诗` |
| **volume_id** | ✓ | `vol-01` | 单章：目标卷 id |
| **next_chapter_id** | ✓ | `ch-001` | 单章：待生成章 id |
| **generation_mode** | ✓ | `single_chapter` | `single_chapter` \| `full` |
| **existing_volume_outline** | ✓ | `{"id":"vol-01","title":"第一卷","chapters":[]}` | 本卷已有章节 JSON |
| max_retry | ✓ | `3` | 最大重试 |
| retry_count | | `0` | 客户端重试轮次 |
| retry_issues_formatted | | 空 | O2 驳回清单，供 O1 修订 |

Schema：[`outline-generate.input.json`](../../dify/outline/mcp/schemas/outline-generate.input.json)

---

## 5. 画布拓扑（12 节点）

完整连线与 **§1.3 变量绑定总表** 见 [NODES-AND-FLOW.md §0–§1.3](./DIFY-OUTLINE-WORKFLOW-NODES-AND-FLOW.md#13-变量绑定总表dify-画布对照用)。

```text
START → O1 → O1X → O2 → AGG → IF-ROUTE
                              ├─ retry         → RE    ─┐
                              ├─ circuit_break → CB    ─┼→ PARSE → END
                              └─ continue      → END_OK ─┘
```

**禁止** RE → O1 回连。**O2/AGG/RE/CB/END_OK 的 outline_json 必须绑 O1X，勿绑 O1。**

---

## 6. O1 — 大纲生成 LLM

| 配置项 | 值 |
|--------|-----|
| **System** | 复制 `prompts/o1-outline-generate.md` 中 **「System 正文」** 整段（从「你是一位具备出版级…」到「`order` 与 `text`」） |
| **User** | 复制 `prompts/o1-outline-user.jinja.md`，**开启 Jinja** |
| temperature | **0.75** |
| 结构化输出 | **开**，Schema 粘贴 `mcp/schemas/o1-outline.output.json` |
| 记忆 / RAG / 视觉 | **关** |
| 输出变量 | 建议将 `text` 重命名为 `o1_result` |

全局片段参考（可选单独维护）：[`prompts/_outline-global-system.md`](../../dify/outline/prompts/_outline-global-system.md)

**User 绑定变量**（来自 START，**须全部绑定**）：

`retry_issues_formatted`, `knowledge_snapshot`, `plot_memory`, `target_volumes`, `target_chapters`, `genre`, `tone`, `outline_brief`, **`generation_mode`**, **`volume_id`**, **`next_chapter_id`**, **`existing_volume_outline`**

---

## 7. O1X — O1 解析 Code

| 项 | 值 |
|----|-----|
| 源码 | `code/outline_o1_extract.py` |
| 输入 | `o1_result` ← **O1.text**（或 O1.o1_result） |
| 输出 | `outline_summary`（String）、`outline_json`（String） |

下游统一使用 **O1X.outline_json**（仅 `{ volumes: [...] }`），勿直接把 O1 整段 JSON 传给 O2。

---

## 8. O2 — 结构校验 LLM

| 配置项 | 值 |
|--------|-----|
| **System** | 复制 `prompts/o2-outline-validate.md` 中 **「System 正文」** 整段 |
| **User** | 复制 `prompts/o2-outline-user.jinja.md` |
| temperature | **0.2** |
| 结构化输出 | **开**，Schema 粘贴 `mcp/schemas/o2-outline-validate.output.json` |
| 输出 | `text` → 建议重命名 `validate_result` |

**User 绑定**：

| 变量 | 来源 |
|------|------|
| outline_json | **O1X.outline_json** |
| knowledge_snapshot | START |
| plot_memory | START |
| target_volumes | START |
| target_chapters | START |
| generation_mode | START |
| volume_id | START |
| next_chapter_id | START |
| existing_volume_outline | START |

---

## 9. AGG — 校验汇总 Code

| 项 | 值 |
|----|-----|
| 源码 | `code/outline_agg_validation.py` |

| 输入 | 来源 |
|------|------|
| validate_result | O2.text |
| retry_count | **开始.retry_count** |
| max_retry | **开始.max_retry** |
| outline_json | **O1X.outline_json** |

| 输出 | Dify 类型 | 用途 |
|------|-----------|------|
| route | String | IF-ROUTE |
| retry_count | **Number** | RE / 客户端 |
| retry_issues_formatted | String | 下轮 O1 |
| outline_valid | **Boolean** | 调试（勿选 String） |
| validation_report | String | END_OK / RE / CB |
| outline_json | String | 透传 |

> 勿保留章节 AGG 的 `lore_valid`、`retry_issues` 等输出变量。输入 `validate_result` 为 null 时，代码会走 retry 并给出明确 issue。

---

## 10. IF-ROUTE — 条件分支

| 条件 | 值 | 目标 |
|------|-----|------|
| AGG.route | 等于 `retry` | **RE** |
| AGG.route | 等于 `circuit_break` | **CB** |
| AGG.route | 等于 `continue`（或 ELSE） | **END_OK** |

---

## 11. RE / CB / END_OK

| 节点 | 源码 | 关键输入 |
|------|------|----------|
| RE | `outline_retry_end.py` | O1X.outline_json, O1X.outline_summary, AGG.retry_count, AGG.retry_issues_formatted, AGG.validation_report |
| CB | `outline_cb_circuit_break.py` | O1X.outline_json, O1X.outline_summary, AGG.retry_count, AGG.validation_report |
| END_OK | `outline_end_success.py` | O1X.outline_summary, O1X.outline_json, AGG.validation_report, **开始.retry_count** |

> **勿**使用章节版 `retry_end.py` / `cb_circuit_break.py` / `end_success.py`。

---

## 12. PARSE → END

### PARSE

| 项 | 值 |
|----|-----|
| 源码 | **`outline_parse_end_outputs.py` 整文件替换**（删除 Dify 默认 `def main(arg1, arg2)` 模板） |
| 输入 | `re_end_outputs` ← RE.end_outputs（**非必填**，默认空） |
| | `cb_end_outputs` ← CB.end_outputs |
| | `ok_end_outputs` ← END_OK.end_outputs |

| PARSE 输出 | Dify 类型 |
|------------|-----------|
| status, circuit_break, human_action_required, outline_summary, outline_json, validation_report, retry_issues_formatted, workflow_version | **String** |
| retry_count | **Number** |

`circuit_break` 输出 `"true"` / `"false"` 字符串（画布类型选 String，勿选 Boolean）。

### END（结束）输出绑定 ← PARSE

| END 变量 | PARSE 字段 |
|----------|------------|
| status | status |
| circuit_break | circuit_break |
| human_action_required | human_action_required |
| retry_count | retry_count |
| outline_summary | outline_summary |
| outline_json | outline_json |
| validation_report | validation_report |
| retry_issues_formatted | retry_issues_formatted |
| workflow_version | workflow_version |

---

## 13. 发布与试运行

1. **保存** → **发布** 工作流  
2. API 访问 → 复制 **API Key**  
3. Dify 画布「运行」→ 导入 [`outline-run.sample.json`](../../dify/outline/fixtures/outline-run.sample.json) 的 `inputs`  
4. 或 PowerShell：

```powershell
$env:DIFY_API_KEY = "app-xxxxxxxx"
.\scripts\test-dify-outline.ps1
```

期望：`status=success`，`outline_json` 含 `volumes` 数组。

---

## 14. NovelsCreator 联调

1. 设置 → Dify → Base URL + **大纲生成** API Key  
2. `npm run dev`  
3. 打开项目 → 侧栏大纲 → **AI 生成**  
4. 成功后 `outline/outline.json` 自动更新

---

## 15. 测试清单

- [ ] O1X 能从 O1 文本提取 `outline_summary` + `outline_json`
- [ ] O1 输出合法 OutlineDocument（每章 3–8 beats）
- [ ] O2 能 catch 空泛节拍 → `outline_valid=false`
- [ ] retry 路径 `status=retry`，含 `retry_issues_formatted`
- [ ] success 后客户端写入 `outline.json`
- [ ] 章节工作流能读取新大纲 beats

---

## 16. 故障排查

| 现象 | 处理 |
|------|------|
| `TypeError: main() got an unexpected keyword argument` | Code 节点须用本仓库最新版（`main(**kwargs)`） |
| END 输出 status 为空 | RE/CB/END_OK 须经 **PARSE**，勿直连 END |
| outline_json 为空 | 检查 O1X 是否连接；O1 结构化输出 Schema 是否匹配 |
| 400 Bad Request | 核对 START 变量名与客户端 [`outline-dify-inputs.ts`](../../electron/main/services/outline-dify-inputs.ts) |
| 402 Insufficient Balance | Dify 模型供应商充值 |
| 超时 | 减少 target_chapters 或换更快模型 |

---

*文档版本：v1.1 · 含 O1X · 客户端已对接*
