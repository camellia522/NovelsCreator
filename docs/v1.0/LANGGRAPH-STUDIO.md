# LangGraph Studio 使用指南

NovelsCreator 四条内置工作流已导出为 **LangGraph `StateGraph`**，可在 [LangSmith Studio](https://smith.langchain.com/studio) 中可视化调试。

---

## 1. 图定义位置

| 图 ID | Studio 入口 | 构建器 | 复用的节点 / Prompt |
|-------|-------------|--------|---------------------|
| `outline` | `langgraph/studio/graphs/outline.ts` | `builders/outline-builder.ts` | `electron/main/workflows/local/nodes/outline/` |
| `knowledge` | `langgraph/studio/graphs/knowledge.ts` | `builders/knowledge-builder.ts` | `nodes/knowledge/` |
| `chapter` | `langgraph/studio/graphs/chapter.ts` | `builders/chapter-builder.ts` | `nodes/chapter/` |
| `society` | `langgraph/studio/graphs/society.ts` | `builders/society-builder.ts` | `nodes/society/` |

配置文件：**项目根目录 `langgraph.json`**

Electron 应用内仍使用 `electron/main/workflows/local/graphs/*.graph.ts` 的 `invoke*Graph()`（顺序编排）；Studio 专用图与之一 **拓扑同构**，便于对照 Dify 画布。

---

## 2. 前置条件

1. [LangSmith](https://smith.langchain.com) 账号与 **API Key**
2. 有效 **OpenAI 兼容 LLM Key**（如 DeepSeek）
3. Node.js **20+**

---

## 3. 一次性配置

```bash
# 1. 复制环境变量模板
copy .env.studio.example .env

# 2. 编辑 .env，填写：
#    LANGSMITH_API_KEY=lsv2_...
#    LOCAL_LLM_API_KEY=sk-...
```

安装 CLI（已写入 `package.json` devDependencies）：

```bash
npm install
```

---

## 4. 启动 Studio

```bash
npm run studio:dev
```

终端会输出本地 Agent Server 地址（默认 `http://127.0.0.1:2024`），并打开 Studio 链接。

浏览器访问（若未自动打开）：

```
https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
```

> **Safari** 可能拦截 localhost，可加 `--tunnel`：  
> `npx @langchain/langgraph-cli dev --tunnel`

---

## 5. 在 Studio 中运行

### 5.1 选择图

左上图列表选择：`outline` / `knowledge` / `chapter` / `society`。

### 5.2 输入 state

每次运行需传入 **完整 state 的 `inputs` 字段**。可从 fixture 复制：

| 图 | Fixture 路径 |
|----|----------------|
| outline | `dify/outline/fixtures/outline-run.epic-fantasy.json` → `inputs` |
| knowledge | `dify/knowledge/fixtures/knowledge-run.sample.json` → `inputs` |
| chapter | `dify/chapter/fixtures/run-request-success.json` → `inputs` |
| society | `dify/world/fixtures/society-run.sample.json` → `inputs` |

**示例（outline）**——在 Studio Input 中提交：

```json
{
  "inputs": {
    "project_id": "550e8400-e29b-41d4-a716-446655440002",
    "knowledge_snapshot": "{...}",
    "plot_memory": "{\"version\":1,\"globalSummary\":\"\",...}",
    "outline_brief": "...",
    "volume_id": "vol-01",
    "next_chapter_id": "ch-001",
    "generation_mode": "single_chapter",
    "max_retry": 3,
    "retry_count": 0
  }
}
```

也可在 Node 中查看默认 fixture：

```bash
npx tsx -e "import { defaultOutlineInputs } from './langgraph/studio/fixtures.ts'; console.log(JSON.stringify({ inputs: defaultOutlineInputs() }, null, 2))"
```

### 5.3 观察执行

Studio 会逐步高亮节点：`o1` → `o1x` → `o2` → `agg` → …  
最终 state 的 `result` 字段即为与 Dify END/PARSE 等价的输出对象。

---

## 6. 拓扑速查

### outline / knowledge

```text
LLM → 解析(X) → 校验 LLM → AGG → (END_OK | RE | CB) → PARSE
```

### chapter

```text
merge_p0 → N1 → N2a ∥ N2b → AGG → (RE|CB|N3 → N4a ∥ N4b → MUX → N5 → END_OK) → PARSE
```

### society

```text
W2S → W2SX → END_OK → PARSE
```

---

## 7. 与 Electron 的关系

| 项 | Studio | Electron 应用 |
|----|--------|---------------|
| 图实现 | `langgraph/studio/builders/*` StateGraph | `electron/.../graphs/*.graph.ts` 顺序 invoke |
| LLM 凭证 | `.env` 的 `LOCAL_LLM_*` | 设置 → AI / `llm-secrets.bin` |
| 客户端 retry | 单轮图内 AGG 路由；**跨轮 retry** 需在应用内或手动改 `retry_count` | `*-local.service.ts` 自动 retry |
| 小说助手 | 未纳入（需 `projectId`） | `createDeepAgent` |

---

## 8. 故障排除

| 现象 | 处理 |
|------|------|
| `LOCAL_LLM_API_KEY` 未配置 | 检查根目录 `.env` |
| Studio 连不上 localhost | 使用 `--tunnel` 或在 Studio UI 添加允许源 |
| 节点报 Prompt 文件找不到 | 须在 **仓库根目录** 启动 `studio:dev`（`dify/*/prompts` 相对路径） |
| LLM 调用失败 | 检查 Base URL、模型名、余额 |

---

## 相关文档

- [02-TECH-ROUTE.md](./02-TECH-ROUTE.md) — LangGraph 技术路线
- [FULL-FLOW-TEST.md](./FULL-FLOW-TEST.md) — 全流程验收
- [LangSmith Studio 官方文档](https://docs.langchain.com/oss/javascript/langgraph/studio)
