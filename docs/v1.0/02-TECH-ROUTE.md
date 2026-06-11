# v1.0 技术路线

> **已定稿**：工作流 = **LangGraph.js**；小说助手 = **Deep Agents Harness**（`deepagents` npm 包）。

## 1. 总览

```text
┌─────────────────────────────────────────────────────────┐
│  Renderer (Vue 3)                                        │
│  · IDE 工作区 / NovelAssistantPanel                      │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC agent:* / ai:*
┌───────────────────────────▼─────────────────────────────┐
│  Electron Main                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Deep Agents Harness (deepagents)                  │  │
│  │ createDeepAgent + 小说专用 Tools + HITL           │  │
│  │ （底层仍是 LangGraph 编译图）                      │  │
│  └───────────────────────┬──────────────────────────┘  │
│                          │ generate_* tools             │
│  ┌───────────────────────▼──────────────────────────┐  │
│  │ WorkflowRunner                                    │  │
│  │  · LocalLangGraphRunner ★默认                     │  │
│  │  · DifyWorkflowRunner legacy                      │  │
│  └───────────────────────┬──────────────────────────┘  │
│  ┌───────────────────────▼──────────────────────────┐  │
│  │ LangGraph.js 确定性工作流图                        │  │
│  │ chapter / outline / knowledge / society           │  │
│  └───────────────────────┬──────────────────────────┘  │
│  ┌───────────────────────▼──────────────────────────┐  │
│  │ @langchain/openai（OpenAI 兼容 baseURL）           │  │
│  └──────────────────────────────────────────────────┘  │
│  WorldEngine CLI（Python 子进程，不变）                  │
└─────────────────────────────────────────────────────────┘
```

## 2. LangChain 三层与 NovelsCreator 分工

| 层级 | 产品 | 本项目用途 |
|------|------|------------|
| **Framework** | LangChain | Tool 定义、`ChatOpenAI`、结构化输出 |
| **Runtime** | **LangGraph.js** | 四条 **固定 pipeline**（retry / circuit_break / PARSE） |
| **Harness** | **[Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/overview)** | **小说助手**（规划、多轮、子任务、Tool 循环） |

官方定义：Harness **不是** LangGraph 的替代品，而是基于 LangGraph 的 **开箱即用智能体层**。  
因此 v1.0 **同时采用两者**，各管一块。

## 3. 选型结论

| 层级 | 选型 | 理由 |
|------|------|------|
| **工作流编排** | LangGraph.js（自写图） | 确定性拓扑；与 Dify 画布 1:1 移植 |
| **小说助手** | **deepagents Harness** | 省 ReAct/planning/长对话压缩；TS 版可进 Main |
| **LLM 调用** | `@langchain/openai` + `baseURL` | DeepSeek / 通义 / OpenAI 兼容 |
| **结构化输出** | Zod + `dify/mcp/schemas` | 工作流节点契约 |
| **Prompt** | `dify/*/prompts/` | 工作流 + `agent/prompts/assistant-system.md` |
| **Code 节点** | TS 移植 `dify/*/code/*.py` | 仅 workflow 图；助手不用 Python |
| **Dify（Legacy）** | `DifyWorkflowRunner` | 高级模式保留 |

## 4. 为何不整条链路都用 Harness

| 场景 | 用 LangGraph 自写图 | 用 Harness |
|------|---------------------|------------|
| 章节 retry 环、熔断 | ✅ 精确控制 | ❌ 过度抽象 |
| 助手多轮对话、todo 规划 | 需自研 | ✅ 内置 |
| 菜单「快速生成」 | 直连 Runner，无助手 | 不应绕 Harness |
| 输出字段对齐 fixture | 必须严格 | 助手输出是自然语言 |

**原则**：Harness **只包裹 M13 小说助手**；M09 工作流 **不用** `createDeepAgent` 跑全流程。

## 5. 依赖规划（package.json 草案）

```json
{
  "dependencies": {
    "deepagents": "^1.x",
    "langchain": "^1.x",
    "@langchain/core": "^1.x",
    "@langchain/langgraph": "^1.x",
    "@langchain/openai": "^1.x",
    "zod": "^3.x"
  }
}
```

> 版本在 Phase 1 spike 时锁定；`deepagents` 入口使用 Node：`import { createDeepAgent } from 'deepagents'`。  
> 文档：[deepagentsjs](https://github.com/langchain-ai/deepagentsjs) · [npm deepagents](https://www.npmjs.com/package/deepagents)

## 6. Harness 集成要点（桌面端）

| 项 | 策略 |
|----|------|
| **默认 FS Tools** | **禁用** Harness 对真实磁盘的 `read_file`/`write_file`；改用 **StateBackend** 或仅暴露小说 Tools |
| **项目读写** | 只读 Tool 调 `project-files.service`；写入经 IPC + 用户确认 |
| **generate_* Tools** | 内部调 `WorkflowRunner`，与菜单同源 |
| **HITL** | `interrupt_on` / UI 确认后再 resume 生成类 Tool |
| **会话持久化** | LangGraph checkpointer → `userData/assistant-sessions/` |
| **模型** | 助手可用单模型；工作流仍用 creative + reasoning 双模型 |

## 7. 模型配置（用户侧）

| 配置项 | 说明 |
|--------|------|
| `llm.baseUrl` | OpenAI 兼容根路径 |
| `llm.apiKey` | 单个 Key（加密存储） |
| `llm.creativeModel` | 工作流创作节点 |
| `llm.reasoningModel` | 工作流校验节点 |
| `llm.assistantModel` | 助手对话（默认可同 creative） |
| `ai.engine` | `local` \| `dify`（v1.0 默认 `local`） |

## 8. 与 WorldEngine 关系

- 地图：**不变**（内置 Python）  
- AI：**Node 栈 only**（Harness + LangGraph），不与 WorldEngine 共享解释器  

## 9. 资产复用映射

| 现有目录 | v1.0 用途 |
|----------|-----------|
| `dify/*/prompts/` | LangGraph 工作流模板 |
| `dify/*/code/` | 移植为 `workflows/nodes/*.ts` |
| `dify/mcp/schemas/` + `fixtures/` | 工作流契约与 E2E |
| `deploy/dify/workflows/` | Legacy Dify |
| **新增** `electron/main/agent/` | Harness 实例化、Tools、checkpointer |

## 10. 测试策略

- **工作流**：LangGraph 图 + mock LLM；fixture 对比  
- **助手**：Harness invoke + mock Tools；生成 Tool 集成测调真实 Runner  
- **安全**：断言助手无法访问项目根外路径  
- **Legacy**：Dify runner E2E 保留  

## 11. 参考链接

- [Frameworks, runtimes, and harnesses（LangChain 概念）](https://docs.langchain.com/oss/javascript/concepts/products)
- [Deep Agents overview（JS）](https://docs.langchain.com/oss/javascript/deepagents/overview)
- [LangGraph.js overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
