# v1.0 需替换内容对照表

> **状态（2026-06）**：v1.0.0 核心替换项 **已落地**（WorkflowRunner、Local 四流、助手 Agent、Settings AI 面板等）。  
> **图例**：🔄 重构/替换 · ✅ 保留 · 📦 仅作资产源 · ⚠️ 废弃但暂留 · ✅✔ 已完成

---

## 1. Electron Main

| 路径 | 动作 | 说明 |
|------|------|------|
| `electron/main/services/dify.service.ts` | 🔄 | 逻辑迁入 `workflows/dify/dify-workflow-runner.ts` |
| `electron/main/services/dify-inputs.ts` | ✅→📦 | 入参构建复用；local 与 dify 共用 |
| `electron/main/services/outline-dify-inputs.ts` | ✅ | 同上 |
| `electron/main/services/knowledge-dify-inputs.ts` | ✅ | 同上 |
| `electron/main/services/config.service.ts` | 🔄 | 扩展 `AiConfig`、LLM 密钥读写 |
| `electron/main/ipc/dify.ipc.ts` | 🔄 | 改为 `ai.ipc.ts` + legacy alias |
| `electron/main/services/worldengine-cli.service.ts` | ✅ | 地图不变 |
| `electron/main/services/project.service.ts` | ✅ | `project.json.settings.dify` 可扩展为 `settings.ai` |
| **新增** `electron/main/workflows/**` | 🆕 | LangGraph 与 runner |
| **新增** `electron/main/agent/` | 🆕 | Deep Agents Harness、`createDeepAgent`、Tools |
| `package.json` dependencies | 🆕 | `deepagents`、`langchain`、`@langchain/*` |

---

## 2. Preload & 类型

| 路径 | 动作 |
|------|------|
| `electron/preload/index.ts` | 🔄 `novelsCreator.ai.*` + `novelsCreator.agent.*` |
| `src/types/api.ts` | 🔄 `AiConfig`、`Generate*` 响应保持不变优先 |

---

## 3. Renderer / Stores

| 路径 | 动作 |
|------|------|
| `src/stores/dify.store.ts` | 🔄 重命名或扩展为 `ai.store.ts` |
| `src/components/settings/*Dify*` | 🔄 `SettingsAiPanel`：Local 默认 + Dify 高级折叠 |
| `src/components/generate/*` | ✅ 调用改为 `window.novelsCreator.ai.*` |
| `src/components/knowledge/GenerateKnowledgeDialog.vue` | ✅ IPC 路径更新 |
| **新增** `src/components/agent/*` | 🆕 助手 UI |
| **新增** `src/stores/assistant.store.ts` | 🆕 |

---

## 4. 常量与配置

| 路径 | 动作 |
|------|------|
| `src/constants/dify-workflows.ts` | ✅ 槽位 ID 保留；可 rename 为 `ai-workflows.ts` |
| `src/constants/app-meta.ts` | ✅✔ | `APP_VERSION` = **1.0.0** |

---

## 5. dify/ 资产目录

| 路径 | 动作 |
|------|------|
| `dify/chapter/` | 📦 prompts + code → 移植源 |
| `dify/outline/` | 📦 |
| `dify/knowledge/` | 📦 |
| `dify/world/` | 📦 |
| `dify/mcp/schemas/` | ✅ 契约基准 |
| `dify/*/fixtures/` | ✅ E2E 黄金文件 |

**不删除** `dify/`；Legacy Dify 与文档仍依赖。

---

## 6. deploy/

| 路径 | 动作 |
|------|------|
| `deploy/dify/workflows/*.yml` | ✅ 保留，标为 **Legacy 高级模式** |
| `deploy/dify/README.md` | ✅✔ | 已标 **v1.0 Legacy 可选** |

---

## 7. 文档

| 路径 | 动作 |
|------|------|
| `docs/app/DEVELOPMENT.md` §7～§8 | 🔄 增加 v1.0 架构链接，Dify 标 legacy |
| `docs/app/MODULES.md` M09 | 🔄 拆为 M09 Local + M09b Dify Legacy |
| `docs/app/USER-GUIDE.md` §3 | 🔄 v1.0 默认 Local 配置章节 |
| `docs/v1.0/*` | 🆕 本目录 |

---

## 8. 测试脚本

| 路径 | 动作 |
|------|------|
| `scripts/test-*-dify-e2e.ts` | ✅ 保留（Legacy） |
| **新增** `scripts/test-*-local-e2e.ts` | 🆕 |
| `scripts/test-*-client-flow.ts` | 🔄 mock runner 而非 mock dify |

---

## 9. CI / Release

| 路径 | 动作 |
|------|------|
| `.github/workflows/ci.yml` | 🔄 增加 local runner 单测（mock LLM） |
| `.github/workflows/release.yml` | ✅ 打包流程不变 |

---

## 10. 模块级替换摘要（M09）

| v0.x M09 | v1.0 |
|----------|------|
| Dify 平台跑 Workflow | Main 进程 LangGraph |
| HTTP `POST /workflows/run` | HTTPS `POST /chat/completions` 等 |
| 4× app Key | 1× API Key + 2× model name |
| Code 节点在 Dify Python | TS 节点在 `workflows/nodes/` |
| PARSE 节点输出 11 字段 | 同结构，由 graph END 节点组装 |

---

## 11. 不需替换

- 项目文件布局（knowledge / outline / memory / chapters）  
- Monaco 编辑器、备份、导出、WorldEngine  
- 三要素向导 UI（仅 IPC 目标变更）  
- 熔断弹窗 UX（状态码仍用 `retry` / `circuit_break`）
