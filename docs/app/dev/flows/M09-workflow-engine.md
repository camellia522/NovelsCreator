# M09 工作流引擎（Local LangGraph + Dify Legacy）

## 职责

四类 AI 工作流统一接口；v1.0 默认内置 Local 图；可选 HTTP 调 Dify。

## WorkflowRunner 接口

```typescript
// workflow-runner.types.ts
runChapter(inputs) → ChapterWorkflowOutputs
runOutline(inputs) → OutlineWorkflowOutputs
runKnowledge(inputs) → KnowledgeWorkflowOutputs
runSociety(inputs) → SocietyWorkflowOutputs
```

## 内置引擎目录

```
electron/main/workflows/
├── workflow-runner.factory.ts
├── local/
│   ├── local-workflow-runner.ts
│   ├── graphs/          # StateGraph 定义
│   ├── nodes/           # 确定性 + LLM 节点
│   ├── prompts/         # Jinja/模板加载（对齐 dify/）
│   ├── llm/llm-provider.ts
│   └── *-local.service.ts  # 客户端重试环
└── dify/
    └── dify-workflow-runner.ts
```

---

## 章节工作流（Chapter）

**拓扑：** P0 预处理 → N1 草稿 → N2a∥N2b 校验 → AGG → N3 润色 → N4 → MUX → N5 memory → END

| 节点 | 类型 | 文件 |
|------|------|------|
| P0 | 确定性 | `nodes/chapter/p0.node.ts` |
| AGG | 聚合校验 | `nodes/chapter/agg.node.ts` |
| N4b MUX | 多路合并 | `nodes/chapter/n4b-mux.node.ts` |
| N5 | memory 解析 | `nodes/chapter/n5-parse.node.ts` |
| END | 成功/重试/熔断 | `nodes/chapter/end-nodes.ts` |

图：`graphs/chapter.graph.ts` · 契约：`dify/chapter/`

---

## 大纲工作流（Outline）

**拓扑：** O1 LLM → O1X 提取 → O2 校验 → AGG → END_OK / RETRY / CIRCUIT_BREAK

- 图：`graphs/outline.graph.ts`
- 顺序多章：`outline-sequential.service.ts`
- 契约：`dify/outline/`

---

## 知识库工作流（Knowledge）

**拓扑：** K1 → K1X → K2 → AGG → END

- 图：`graphs/knowledge.graph.ts`
- 合并：`knowledge-generation.service.ts`
- 契约：`dify/knowledge/`

---

## 社会层工作流（Society / W2）

**拓扑：** W2S LLM → W2SX 提取 → END_OK → PARSE；按领土分批

- 图：`graphs/society.graph.ts`
- 编排：`world-society.service.ts`
- 契约：`dify/world/`

---

## Dify Legacy 路径

1. `dify-workflow-runner.ts` 调 `dify.service.ts`
2. HTTP POST workflow run（blocking）
3. 解析 END 节点 JSON（与 Local 输出形状一致）
4. Prompt/Code 契约与 `dify/` 目录共享

## LLM 配置（Local）

- 设置 → AI → 内置引擎：`config.ai.local`
- 密钥：`llm-secrets.bin`（safeStorage）
- 提供方：`llm-provider.ts`（creative / reasoning 双模型）

## 测试

- 节点：`npm run test:*-local-nodes`
- 图校验：`npm run studio:graphs-check`
- 契约 Python：`npm run test:*-code`

## 延伸阅读

- [../../v1.0/03-ARCHITECTURE.md](../../v1.0/03-ARCHITECTURE.md)
- [../../chapter/DIFY-WORKFLOW-NODES-AND-FLOW.md](../../chapter/DIFY-WORKFLOW-NODES-AND-FLOW.md)
- [../../outline/DIFY-OUTLINE-WORKFLOW-NODES-AND-FLOW.md](../../outline/DIFY-OUTLINE-WORKFLOW-NODES-AND-FLOW.md)
