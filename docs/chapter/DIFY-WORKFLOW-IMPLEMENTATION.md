# Dify 工作流 — 实现文档（MCP 协议对齐）

> 逐步在 Dify 平台搭建 **`novel-chapter-generation-v1.1`**，并可选部署 **MCP Server** 供 Cursor 等宿主调用。  
> 设计说明见 [DIFY-WORKFLOW-DESIGN.md](./DIFY-WORKFLOW-DESIGN.md)

---

## 目录

1. [前置条件](#1-前置条件)
2. [仓库资产清单](#2-仓库资产清单)
3. [Dify 应用创建](#3-dify-应用创建)
4. [Start / End 节点配置](#4-start--end-节点配置)
5. [Code 节点实现](#5-code-节点实现)
6. [LLM 节点实现](#6-llm-节点实现)
7. [条件分支与重试环](#7-条件分支与重试环)
8. [并行网关配置](#8-并行网关配置)
9. [发布与 API 获取](#9-发布与-api-获取)
10. [客户端联调](#10-客户端联调)
11. [MCP Server 桥接（可选）](#11-mcp-server-桥接可选)
12. [测试清单](#12-测试清单)
13. [故障排查](#13-故障排查)

---

## 1. 前置条件

| 项 | 要求 |
|----|------|
| Dify | ≥ 0.15，支持 Workflow、Code 节点、并行分支 |
| 模型 | 至少 2 个 LLM Provider（创作 + 推理各一） |
| API | 可访问 `POST /v1/workflows/run` |
| 本地 | 克隆本仓库，路径含 `dify/` 目录 |

**环境变量（MCP Server / 联调用）**

```bash
DIFY_BASE_URL=https://api.dify.ai/v1          # 或自托管地址
DIFY_API_KEY=app-xxxxxxxx                     # Workflow 应用 API Key
DIFY_WORKFLOW_ID=novel-chapter-generation-v1.1  # 逻辑 ID，用于日志
```

---

## 2. 仓库资产清单

```
dify/
├── code/                          # Code 节点源码（复制到 Dify）
│   ├── p0_context_merge.py
│   ├── agg_validation.py
│   ├── retry_end.py
│   ├── n4b_mux.py
│   ├── cb_circuit_break.py
│   ├── end_success.py
│   └── parse_end_outputs.py
├── prompts/                       # LLM Prompt（复制 System/User）
│   ├── _global-system.md
│   ├── n1-draft.md … n5-memory-patch.md
├── mcp/
│   ├── schemas/                   # JSON Schema 2020-12（契约 SSOT）
│   ├── tools/                     # MCP tools/list 定义
│   └── resources/                 # MCP resources 索引
└── README.md
```

---

## 3. Dify 应用创建

### 3.1 新建 Workflow 应用

1. Dify 控制台 → **创建应用** → **工作流（Workflow）**
2. 名称：`Novel Chapter Generation v1.1`
3. 图标/描述自定

### 3.2 配置模型供应商

**设置 → 模型供应商** 中配置：

| 用途 | 建议 |
|------|------|
| N1/N3/N4 | GPT-4o / Claude Sonnet / DeepSeek-V3 |
| N2/N5 | GPT-4o-mini / Claude Haiku / DeepSeek-R1 |

---

## 4. Start / End 节点配置

### 4.1 Start 节点 — 输入变量

在 **开始** 节点添加变量（类型与 MCP inputSchema 一致）：

| 变量名 | 类型 | 必填 | 默认值 |
|--------|------|------|--------|
| project_id | 文本 | ✓ | |
| chapter_id | 文本 | ✓ | |
| chapter_title | 文本 | ✓ | |
| outline_beats | 文本 | ✓ | |
| knowledge_snapshot | 文本 | ✓ | |
| plot_memory | 文本 | ✓ | |
| previous_chapter_summary | 文本 | | 空 |
| video_platform_template | 文本 | ✓ | generic-v1 / platform-x-v1 / configurable-v1 |
| video_template_config | 文本 | | configurable-v1 必填 |
| **estimated_duration_sec** | 数字 | | **180**（N4b-G / N4b-X） |
| max_retry | 数字 | ✓ | 3 |
| generation_prompt | 文本 | | 空 |
| generation_prompt_text | 文本 | | 空 |
| **retry_count** | 数字 | | **0** |
| **retry_issues_formatted** | 文本 | | 空 |

### 4.2 重试状态（Start 输入 · 方案 B）

> **不再使用** Dify「工作流变量」存 `retry_count`。校验重试由 **客户端 / MCP** 多次 `POST` 实现；Dify 画布 **不回连 N1**。

| 变量 | 首轮 | 收到 `status=retry` 后 |
|------|------|------------------------|
| retry_count | 0 | `outputs.retry_count` |
| retry_issues_formatted | `""` | `outputs.retry_issues_formatted` |

N1 USER 绑定：**开始 → retry_count**、**开始 → retry_issues_formatted**。  
AGG 的 `retry_count` 输入绑定：**开始 → retry_count**。

### 4.3 End 节点 — 输出变量

三条出口（**RE / CB / END_OK**）均输出 JSON 字符串 `end_outputs`，经 **PARSE** 扁平化后，在 **结束 / 输出** 节点逐字段绑定。

#### 4.3.1 画布连线（出口层）

```
RE ──────┐
CB ──────┼──→ PARSE ──→ END（结束 / 输出）
END_OK ──┘
```

#### 4.3.2 PARSE 代码节点

1. 添加 **Code** 节点，命名 `PARSE End Outputs`
2. 语言：**Python3**
3. 输入变量（**三个，各绑一路**）：

| PARSE 输入 | 绑定 |
|------------|------|
| re_end_outputs | **RE → end_outputs** |
| cb_end_outputs | **CB → end_outputs** |
| ok_end_outputs | **END_OK → end_outputs** |

单次 run 仅一路有值；代码自动取首个非空，**无需** route 判断。若 UI 仍支持第四个兼容参数 `end_outputs`，可留空。

4. 粘贴 [`dify/chapter/code/parse_end_outputs.py`](../../dify/chapter/code/parse_end_outputs.py)
5. 输出变量（与 `main` 返回值一致）：

| PARSE 输出 | 说明 |
|------------|------|
| status | success / retry / circuit_break |
| circuit_break | 布尔 |
| human_action_required | 布尔 |
| retry_count | 整数 |
| novel_body / video_script | 成功路径正文 |
| draft_text | retry / 熔断路径草稿 |
| retry_issues_formatted | retry 路径驳回清单 |
| memory_patch | JSON 字符串 |
| validation_report | JSON 字符串 |
| workflow_version | 常量 v1.1 |

#### 4.3.3 END 绑定表（均 ← PARSE）

| END 输出字段 | 绑定 |
|--------------|------|
| status | PARSE.status |
| circuit_break | PARSE.circuit_break |
| human_action_required | PARSE.human_action_required |
| retry_count | PARSE.retry_count |
| novel_body | PARSE.novel_body |
| video_script | PARSE.video_script |
| draft_text | PARSE.draft_text |
| retry_issues_formatted | PARSE.retry_issues_formatted |
| memory_patch | PARSE.memory_patch |
| validation_report | PARSE.validation_report |
| workflow_version | PARSE.workflow_version |

在 Dify 中：点 **设置变量值** → `/` → 选 **PARSE** → 选对应字段。

#### 4.3.4 方案 A（可选 · 单字段）

若不需要扁平字段，可跳过 PARSE，END 只暴露一个变量：

| END 输出 | 绑定 |
|----------|------|
| end_outputs | RE / CB / END_OK → end_outputs |

MCP 客户端会对 `outputs.end_outputs` 做 `JSON.parse`（见 §11.2）。

---

## 5. Code 节点实现

### 5.1 P0 — Context Merge

1. 添加 **Code** 节点，命名 `P0 Context Merge`
2. 语言：**Python3**
3. 输入变量映射：
   - `generation_prompt` ← Start.generation_prompt
   - `knowledge_snapshot` ← Start.knowledge_snapshot
   - `outline_beats` ← Start.outline_beats
4. 粘贴 [`dify/chapter/code/p0_context_merge.py`](../../dify/chapter/code/p0_context_merge.py) 中 `main` 及以上代码
5. 输出：`merged_context`, `effective_beats`, `has_wizard`, `chapter_goal`

**连线**：START → P0 → N1

### 5.2 AGG — Validation Aggregate

1. 命名 `AGG Validation Aggregate`
2. 输入：
   - `outline_result` ← N2a 输出
   - `lore_result` ← N2b 输出
   - `retry_count` ← **Start.retry_count**
   - `max_retry` ← Start.max_retry
   - `draft_text` ← N1.text
3. 粘贴 [`dify/chapter/code/agg_validation.py`](../../dify/chapter/code/agg_validation.py)
4. **无需** 更新 Dify 工作流变量（方案 B）

### 5.3 RE / CB / END_OK / PARSE

| 节点 | 代码文件 | 输入 |
|------|----------|------|
| **RE** | retry_end.py | draft_text, retry_count, outline_valid, lore_valid, retry_issues, retry_issues_formatted ← AGG |
| CB | cb_circuit_break.py | draft_text, retry_count, outline_valid, lore_valid, retry_issues |
| END_OK | end_success.py | novel_body, video_script, memory_patch, retry_count ← **Start** |
| **PARSE** | parse_end_outputs.py | re_end_outputs ← RE；cb_end_outputs ← CB；ok_end_outputs ← END_OK |

| 节点 | 下游 |
|------|------|
| RE | **PARSE** |
| CB | **PARSE** |
| END_OK | **PARSE** |
| **PARSE** | **END** |

三者均输出 `end_outputs` → **PARSE** 扁平化 → **END**

---

## 6. LLM 节点实现

### 6.1 通用步骤（每个 LLM 节点）

1. 添加 **LLM** 节点
2. **System Prompt**：从 [`dify/chapter/prompts/_global-system.md`](../../dify/chapter/prompts/_global-system.md) 复制对应段落 + 节点 `## System` 节
3. **User Prompt**：从对应 `n*.md` 复制 `## User` 节，将 `{{变量}}` 替换为 Dify 变量选择器
4. **上下文**：勾选所需上游变量

### 6.2 各节点变量绑定

| 节点 | User Prompt 变量 |
|------|-------------------|
| **N1** | generation_prompt_text, knowledge_snapshot, plot_memory, previous_chapter_summary, **retry_issues_formatted ← Start**, **retry_count ← Start** |
| **N2a** | draft_text ← N1, effective_beats ← P0, chapter_goal ← P0 |
| **N2b** | draft_text, merged_context ← P0, has_wizard ← P0, plot_memory ← Start |
| **N3** | draft_text, merged_issues_for_polish ← AGG |
| **N4a** | polished_text ← N3, chapter_title ← Start |
| **N4b** | polished_text ← N3; chapter_id/title; video_platform_template；**configurable-v1 时 + video_template_config ← Start** |
| **N5** | novel_body ← N4a, plot_memory, chapter_id, chapter_title |

### 6.3 N2a / N2b / N5 — 结构化 JSON 输出

**推荐配置（Dify 结构化输出）**：

1. 打开 LLM 节点 → **输出** → **JSON**
2. 粘贴 PROMPT-DESIGN 中对应 Schema 字段定义，或手动添加：

**N2a 最小 Schema**

```json
{
  "outline_valid": "boolean",
  "outline_issues": "array[string]",
  "beat_coverage": "array[object]",
  "sequence_integrity": "boolean",
  "goal_drift_detected": "boolean",
  "reviewer_summary": "string"
}
```

**N2b 最小 Schema**

```json
{
  "lore_valid": "boolean",
  "lore_issues": "array[string]",
  "character_checks": "array[object]",
  "world_rules_violations": "array[string]",
  "unauthorized_expansions": "array[string]",
  "continuity_conflicts": "array[string]",
  "reviewer_summary": "string"
}
```

3. temperature：**0.2**

### 6.4 Jinja2（N1 / N2a / N2b）

以下节点 **USER Prompt** 须打开编辑器右上角 **Jinja** 开关，模板见 [`dify/chapter/prompts/`](../../dify/chapter/prompts/)（已用 `{% if %}` / `{% for %}`，勿用 `{{#if}}`）：

| 节点 | 条件变量 |
|------|----------|
| N1 | `retry_count \| int > 0`、`previous_chapter_summary` |
| N2a | `chapter_goal` |
| N2b | `has_wizard == "true"`、`plot_memory` |

详见 [`dify/chapter/prompts/README.md`](../../dify/chapter/prompts/README.md)。

### 6.5 N1 / N3 / N4 — 纯文本输出

- 关闭 JSON 模式
- N1 temperature：0.85
- N3：0.5
- N4a：0.4
- N4b：0.5

### 6.6 N1 特殊：generation_prompt_text 为空

User Prompt 顶部添加 Dify **条件模板** 或使用 IF 节点：

```
若 Start.generation_prompt_text 为空：
  使用快速生成 Fallback（见 PROMPT-DESIGN §4）
否则：
  使用 generation_prompt_text
```

---

## 7. 条件分支（方案 B · 无画布回环）

### 7.1 IF/ELSE 节点（AGG 之后）

添加 **条件分支**，变量 **AGG → route**；运算符用 **等于**（勿用「包含」）：

| 条件 | 目标节点 |
|------|----------|
| `route` 等于 `retry` | **RE** → **PARSE** → END（**禁止**连 N1） |
| `route` 等于 `circuit_break` | **CB** → **PARSE** → END |
| `route` 等于 `continue` | **N3** |
| ELSE 默认 | **N3** |

### 7.2 客户端重试环（替代画布回边）

```
POST #1 (retry_count=0)
  → status=retry → POST #2 (retry_count=1, retry_issues_formatted=…)
  → status=success → 落盘
  → status=circuit_break → Modal
```

### 7.3 RE 节点配置

1. 添加 **Code** 节点 `RE Retry Handoff`
2. 粘贴 [`dify/shared/code/retry_end.py`](../../dify/shared/code/retry_end.py)
3. 输入均来自 **AGG**（`draft_text` 来自 **N1.text**）
4. 输出 `end_outputs` → **PARSE** → **END**

### 7.4 熔断路径

```
AGG → CB → PARSE → END
```

### 7.5 PARSE 与 END 配置步骤

1. 添加 **PARSE** Code 节点，粘贴 `parse_end_outputs.py`
2. **断开** RE/CB/END_OK 到 END 的旧连线
3. **RE → PARSE**、**CB → PARSE**、**END_OK → PARSE**、**PARSE → END**
4. PARSE 输入：`re_end_outputs` ← RE、`cb_end_outputs` ← CB、`ok_end_outputs` ← END_OK（**三路都绑**，勿只绑 END_OK）
5. END（输出）节点：按 §4.3.3 表，11 个字段均绑 **PARSE.xxx**
6. 运行调试 → **上次运行**  tab 确认 `status` 等有值

---

## 8. 并行网关配置

### 8.1 校验并行（N2a ∥ N2b）

1. N1 完成后添加 **并行分支** 节点
2. 分支 A → N2a → 汇聚
3. 分支 B → N2b → 汇聚
4. 汇聚 → AGG（等待两分支完成）

### 8.2 输出并行（N4a ∥ N4b 三分支）

**画布结构（N3 之后）**

```text
N3 ──┬──→ N4a ────────────────┐
     │                        ├──→ N5 ──→ END_OK
     └──→ IF-VIDEO            │
            ├─ generic-v1     → N4b-G ──┐
            ├─ platform-x-v1  → N4b-X ──┼──→ N4B-MUX ──┘
            ├─ configurable-v1 → N4b-C ──┘
            └─ ELSE           → N4b-G
```

1. **N3** 拖两条线：→ **N4a**；→ **IF-VIDEO**  
2. 配置 **IF-VIDEO**（变量：**开始.video_platform_template**，运算符 **等于**）  
3. 新建三个 LLM：**N4b-G / N4b-X / N4b-C**，粘贴对应 Prompt  
4. 三分支 **text** 均连 **N4B-MUX**  
5. **N4a** 与 **N4B-MUX** 均连 **N5**  
6. **END_OK**：`video_script` ← **N4B-MUX.video_script**（勿绑单路 N4b）

### 8.3 N4B-MUX 代码节点

| 输入 | 来源 |
|------|------|
| generic_text | N4b-G → text |
| platform_text | N4b-X → text |
| configurable_text | N4b-C → text |

粘贴 [`dify/chapter/code/n4b_mux.py`](../../dify/chapter/code/n4b_mux.py)，输出 `video_script`。

### 8.4 各 N4b Prompt 与 USER 绑定

| 节点 | Prompt | 额外 USER |
|------|--------|-----------|
| N4b-G | `n4b-video-generic-v1.md` | — |
| N4b-X | `n4b-video-platform-x-v1.md` | — |
| N4b-C | `n4b-video-configurable-v1.md` | **开始.video_template_config** |

共用：**N3.text**，**开始.chapter_title**，**开始.chapter_id**，**开始.estimated_duration_sec**（N4b-G/X；默认 180）；温度 **0.5**；结构化 **关**。

**若画布上有旧单节点 N4b**：删除连线 → 按上表重建 IF + 三路 + MUX。

---

## 9. 发布与 API 获取

### 9.1 调试运行

1. 使用 [§12.1](#121-fixture-输入) fixture 在 Dify 画布 **运行**
2. 确认 success 与 circuit_break 两条路径

### 9.2 发布

1. **发布** 工作流
2. **访问 API** → 复制：
   - Base URL
   - API Key（Bearer）
   - 工作流 ID（如有）

### 9.3 验证 HTTP

```bash
curl -X POST "${DIFY_BASE_URL}/workflows/run" \
  -H "Authorization: Bearer ${DIFY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @dify/chapter/fixtures/run-request-success.json
```

Fixture 文件见 [§12](#12-测试清单)。

---

## 10. 客户端联调

### 10.1 NovelsCreator 配置

1. 设置 → Dify：`baseUrl` + API Key（safeStorage）
2. `project.json` → `settings.dify.workflowId`: `novel-chapter-generation-v1.1`

### 10.2 useDifyWorkflow 调用

```typescript
const body = {
  inputs: {
    project_id: project.id,
    chapter_id: chapter.id,
    chapter_title: chapter.title,
    outline_beats: JSON.stringify(chapter.beats),
    knowledge_snapshot: JSON.stringify(knowledgeStore.buildSnapshot()),
    plot_memory: JSON.stringify(memoryStore.buildPayload()),
    previous_chapter_summary: memoryStore.getPreviousSummary(chapter.id) ?? '',
    video_platform_template: project.settings.videoPlatformTemplate,
    max_retry: 3,
    generation_prompt: wizardPayload ? JSON.stringify(wizardPayload) : '',
    generation_prompt_text: wizardPayload ? renderGenerationPromptText(wizardPayload) : fallbackText,
    retry_count: 0,
    retry_issues_formatted: '',
  },
  response_mode: 'blocking',
  user: `novelscreator-${project.id}-${chapter.id}`,
};
```

### 10.3 客户端重试 Orchestration（方案 B）

```typescript
async function runChapterWithRetry(baseInputs: ChapterInputs): Promise<ChapterOutputs> {
  let retryCount = 0;
  let retryIssuesFormatted = '';

  for (;;) {
    const outputs = await difyWorkflowRun({
      ...baseInputs,
      retry_count: retryCount,
      retry_issues_formatted: retryIssuesFormatted,
    });

    if (outputs.status === 'success') return outputs;
    if (outputs.status === 'circuit_break') throw new CircuitBreakError(outputs);
    if (outputs.status === 'retry') {
      retryCount = outputs.retry_count;
      retryIssuesFormatted = outputs.retry_issues_formatted ?? '';
      continue;
    }
    throw new Error(`Unexpected workflow status: ${outputs.status}`);
  }
}
```

UI 可在 `status=retry` 时展示「第 N 次修订中…」。

### 10.4 输出校验（ajv）

```typescript
import Ajv from 'ajv';
import outputSchema from '../../../../dify/chapter/mcp/schemas/novel-chapter-generate.output.schema.json';

const ajv = new Ajv({ strict: false });
const validate = ajv.compile(outputSchema);
if (!validate(outputs)) throw new Error('Invalid Dify outputs');
```

---

## 11. MCP Server 桥接（可选）

供 Cursor / Claude Desktop 通过 MCP 调用同一 Dify 工作流，Schema 与 Electron 客户端共用。

### 11.1 架构

```
MCP Host (Cursor)
  │ stdio JSON-RPC
  ▼
novelscreator-dify-mcp (Node.js)
  │ tools/call → novels_chapter_generate
  ▼
POST DIFY_BASE_URL/workflows/run
  ▼
structuredContent ← data.outputs
```

### 11.2 最小 Server 实现要点

**依赖**：`@modelcontextprotocol/sdk`, `ajv`, `axios`

**tools/list**：读取 `dify/chapter/mcp/tools/*.json` 返回 Tool 定义

**tools/call**（方案 B · 内含重试 loop）：

```typescript
async function handleNovelsChapterGenerate(args: Record<string, unknown>) {
  let retryCount = 0;
  let retryIssuesFormatted = '';
  const base = { ...args };

  for (;;) {
    const inputs = {
      ...base,
      retry_count: retryCount,
      retry_issues_formatted: retryIssuesFormatted,
    };
    // ajv 校验 inputs …
    const res = await axios.post(`${DIFY_BASE_URL}/workflows/run`, {
      inputs,
      response_mode: 'blocking',
      user: `mcp-${args.project_id}-${args.chapter_id}`,
    }, { headers: { Authorization: `Bearer ${DIFY_API_KEY}` }, timeout: 600_000 });

    if (res.data?.data?.status === 'failed') {
      return { content: [{ type: 'text', text: res.data.data.error }], isError: true };
    }

    const outputs = res.data.data.outputs;
    let structured: Record<string, unknown>;
    if (typeof outputs.end_outputs === 'string') {
      structured = JSON.parse(outputs.end_outputs);
    } else {
      structured = { ...outputs };
      if (typeof structured.memory_patch === 'string') {
        structured.memory_patch = JSON.parse(structured.memory_patch);
      }
      if (typeof structured.validation_report === 'string') {
        structured.validation_report = JSON.parse(structured.validation_report);
      }
    }

    validateOutput(structured);

    if (structured.status === 'retry') {
      retryCount = structured.retry_count;
      retryIssuesFormatted = structured.retry_issues_formatted ?? '';
      continue;
    }

    return {
      content: [{ type: 'text', text: `status=${structured.status}, retry=${structured.retry_count}` }],
      structuredContent: structured,
      isError: false,
    };
  }
}
```

**resources/list**：读取 `dify/chapter/mcp/resources/manifest.json`

**resources/read**：URI `novelscreator://…` 映射到仓库相对路径读文件

### 11.3 Cursor mcp.json 配置示例

```json
{
  "mcpServers": {
    "novelscreator-dify": {
      "command": "node",
      "args": ["dify/chapter/mcp/server/dist/index.js"],
      "env": {
        "DIFY_BASE_URL": "https://api.dify.ai/v1",
        "DIFY_API_KEY": "app-xxx",
        "NOVELSCREATOR_ROOT": "d:/selfProgram files/projectCategory/NovelsCreator"
      }
    }
  }
}
```

### 11.4 MCP Prompts（可选扩展）

可注册 MCP **Prompt** `novel-chapter-brief`，arguments 为 generation_prompt 字段，供宿主填充后交给 `novels_chapter_generate`。

---

## 12. 测试清单

### 12.1 Fixture 输入

创建 `dify/chapter/fixtures/run-request-success.json`：

```json
{
  "inputs": {
    "project_id": "550e8400-e29b-41d4-a716-446655440000",
    "chapter_id": "ch-001",
    "chapter_title": "第一章",
    "outline_beats": "[{\"order\":1,\"text\":\"主角抵达破庙避雨\"},{\"order\":2,\"text\":\"遭遇神秘剑客\"}]",
    "knowledge_snapshot": "{\"world\":{\"rules\":\"灵气复苏\"},\"characters\":[{\"id\":\"char-001\",\"name\":\"张三\",\"traits\":[\"冷静\"]}],\"factions\":[],\"items\":[]}",
    "plot_memory": "{\"version\":1,\"globalSummary\":\"\",\"chapterSummaries\":[],\"foreshadowing\":[]}",
    "previous_chapter_summary": "",
    "video_platform_template": "generic-v1",
    "max_retry": 3,
    "generation_prompt": "",
    "generation_prompt_text": ""
  },
  "response_mode": "blocking",
  "user": "test-ch-001"
}
```

### 12.2 测试用例

| ID | 场景 | 期望 status | 验证点 |
|----|------|-------------|--------|
| T1 | 正常向导输入 | success | novel_body、video_script、memory_patch 非空 |
| T2 | 快速生成（空 wizard） | success | 仅 knowledge + beats |
| T3 | 故意错误 beats（不可覆盖） | circuit_break | draft_text + issues |
| T4 | max_retry=0 + 故意失败 | circuit_break | retry_count=0 |
| T5 | platform-x-v1 | success | video_script 含表头行 |
| T6 | MCP tools/call | 同 T1 | structuredContent 过 output Schema |
| T7 | 无效 input（缺 chapter_id） | MCP/HTTP 4xx | isError true |

### 12.3 Schema 本地校验

```bash
npx ajv validate -s dify/chapter/mcp/schemas/novel-chapter-generate.input.schema.json -d dify/chapter/fixtures/run-request-success.json --spec=draft2020
```

---

## 13. 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| N2 始终 fail | JSON 未解析 | 开结构化输出；查 AGG parse_llm_json |
| 无限 retry | IF 连 N1 或客户端未读 status | retry 分支应连 **RE**；客户端 loop 见 §10.3 |
| N1 收不到 retry_issues | Start 未传 retry_issues_formatted | 下轮 inputs 传入 outputs.retry_issues_formatted |
| memory_patch 空 | N5 JSON 失败 | 降 temperature；开 JSON Schema |
| MCP isError 但 Dify 成功 | outputs 解析路径错误 | END 字段应绑 **PARSE**；或检查 `end_outputs` |
| Token 超限 | plot_memory 过长 | 客户端摘要后再传 |
| 并行分支卡住 | 一分支异常未汇聚 | Dify 日志查失败分支 |

---

## 附录 A：Dify 节点连线检查表

- [ ] START → P0 → N1
- [ ] N1 → 并行 → N2a, N2b → AGG
- [ ] AGG → IF → retry→**RE** / CB / N3（**无** N1 回边）
- [ ] N3 → N4a + IF-VIDEO → N4b-G/X/C → N4B-MUX → N5
- [ ] END_OK video_script ← N4B-MUX
- [ ] N5 → END_OK → **PARSE** → END
- [ ] CB → **PARSE**（非直连 END）
- [ ] RE → **PARSE**（非直连 END）
- [ ] END 11 字段均绑 PARSE
- [ ] Start 含 retry_count、retry_issues_formatted
- [ ] 客户端 / MCP 重试 loop（§10.3）
- [ ] End 输出字段与 output.schema 一致
- [ ] 已发布并拿到 API Key

---

## 附录 B：与 MCP 规范对照检查

- [ ] Tool inputSchema：`type: object`，2020-12
- [ ] Tool outputSchema：定义 structuredContent 结构
- [ ] circuit_break 时 `isError: false`
- [ ] HTTP 失败时 `isError: true`
- [ ] resources/read 返回 Schema 与 Prompt 原文
- [ ] 无 API Key 写入 Tool arguments

---

*文档版本：v1.0 · 2026-06-01*
