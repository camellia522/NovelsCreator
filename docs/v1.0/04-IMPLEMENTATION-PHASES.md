# v1.0 分阶段实现流程

> **状态（2026-06）**：Phase 0～3 **已完成**，当前产品版本 **v1.0.0**。Phase 4 为 v1.0 之后增强项。

## 总览

```text
Phase 0 (v0.3)     抽象层 + 设置预留 + Dify 体验
Phase 1 (spike)    单条工作流 LangGraph 原型（大纲）
Phase 2 (beta)     四条工作流内置 + Dify legacy
Phase 3 (v1.0)     小说助手 MVP + 默认切换 local
Phase 4 (v1.0+)    助手增强 / 可选云端
```

---

## Phase 0 — v0.3.x 铺垫（不改变默认引擎）

**目标**：为 v1.0 动刀时不全盘重写。

| 任务 | 产出 |
|------|------|
| P0-1 | 定义 `WorkflowRunner` 接口与 factory |
| P0-2 | `DifyWorkflowRunner` 包装现有 `dify.service.ts` |
| P0-3 | IPC 改为 `ai:*`，内部仍调 Dify runner |
| P0-4 | 设置 UI：`AI 引擎` 下拉（仅 Dify 可选，Local 灰显「即将推出」） |
| P0-5 | `deploy/dify` + 首次配置 checklist（v0.3 用户价值） |

**完成标志**：现有 E2E 全绿；接口稳定。

---

## Phase 1 — Spike：大纲本地图（约 1～2 周）

**目标**：验证 LangGraph + LLM + fixture 对齐。

| 步骤 | 内容 |
|------|------|
| P1-1 | 添加 LangGraph / LangChain 依赖 |
| P1-2 | `llm-provider.ts`：OpenAI 兼容 + DeepSeek 测通 |
| P1-3 | 移植 `outline_o1_extract`、`outline_agg_validation` 等节点 → TS |
| P1-4 | `outline.graph.ts`：O1 → O1X → O2 → AGG → RE/CB → END |
| P1-5 | `LocalLangGraphRunner.generateOutline` only |
| P1-6 | 对比 `dify/outline/fixtures/outline-run.sample.json` |

**完成标志**：同一 fixture 输入，local 输出 schema 与 Dify 版一致；人工抽检质量可接受。

---

## Phase 2 — Beta：四条工作流 + Legacy（约 3～6 周）

| 顺序 | 工作流 | 复杂度 | 说明 |
|------|--------|--------|------|
| P2-1 | 知识库 | 中 | 表单预填已有，适合第二条 |
| P2-2 | 社会层 | 中低 | 输入领土 JSON，输出结构化 |
| P2-3 | 章节 | **高** | retry 环 + memory_patch + 双产物 |
| P2-4 | 设置 | — | Local 引擎可切换；双模型配置 |
| P2-5 | E2E | — | `test:*-local` + 保留 dify E2E |

**完成标志**：

- 设置选 Local 时可完成：建项目 → 生成知识库 → 大纲 → 章节 → 社会层  
- Dify 模式仍可用  

---

## Phase 3 — v1.0 正式：Deep Agents 助手 + 默认 Local

| 任务 | 内容 |
|------|------|
| P3-1 | 添加 `deepagents` 依赖；spike `createDeepAgent` + mock Tools |
| P3-2 | `novel-assistant.service.ts` + 小说 Tools + checkpointer |
| P3-3 | 禁用 Harness 默认 FS/shell；`generate_*` 配置 HITL |
| P3-4 | `NovelAssistantPanel` + `agent:chat` / `agent:stream` / `agent:resume` |
| P3-5 | 首次启动向导：填 Key → 测连接 → 助手简介 |
| P3-6 | 默认 `ai.engine = local`；Dify 移入「高级」 |
| P3-7 | 文档与 Release `v1.0.0` |

**完成标志**：见 [08-ACCEPTANCE-CRITERIA.md](./08-ACCEPTANCE-CRITERIA.md)。

---

## Phase 4 — v1.0 之后（不阻塞正式版）

- 助手：多轮规划整卷、伏笔提醒、角色一致性问答  
- RAG：可选向量检索设定（本地 sqlite）  
- 官方云端 / 订阅 Key  
- 工作流可视化调试面板（开发模式）

---

## 里程碑与时间（建议）

| 里程碑 | 版本 tag | 依赖 |
|--------|----------|------|
| Runner 抽象 | v0.3.0 | Phase 0 |
| 大纲 local demo | v0.4.0-alpha / beta 渠道 | Phase 1 |
| 四流 local beta | v1.0.0-beta.1 | Phase 2 |
| 助手 + 默认 local | **v1.0.0** ✅ | Phase 3 |

---

## 分支策略（v1.0 发布后）

- `main`：稳定 **v1.0.x** 集成分支  
- 功能分支合并后打 **v1.0.x** 或 **v1.1.0** tag  
- 重大变更继续引用本目录 Phase 编号

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Local 与 Dify 输出不一致 | fixture 对比 + 客户端 parse 层共用 |
| Token 成本飙升（助手） | 助手默认不自动连读全书；Tool 需确认 |
| 打包体积增大 | 按需 import LangChain；不引入 Python AI |
| 开发周期过长 | Phase 1 大纲先 ship beta，收集反馈 |
