# v1.0 产品愿景

## 1. 一句话

**NovelsCreator v1.0**：下载安装 → 填写模型 API Key → 在 IDE 内完成设定、大纲、记忆、章节创作；AI 由 **内置 LangGraph 工作流 + Deep Agents 小说助手** 驱动，**默认不依赖 Dify**。

## 2. 解决什么问题

| 痛点（v0.x） | v1.0 目标 |
|--------------|-----------|
| 用户需部署 Dify、导入 4 个 DSL、配置 4 个 Key | **一个（或创作/推理两个）模型配置** 即可 |
| 教程链路过长，非技术用户门槛高 | 首次启动 **配置向导 + 助手引导** |
| AI 逻辑在外部平台，调试需两边对照 | 工作流在 **主进程可测、可版本化** |
| 功能分散在菜单与面板 | **小说助手** 统一理解项目上下文并调度生成 |

## 3. 核心能力（v1.0 必须）

1. **四条生成管线内置化**（与 v0.x 行为对齐）  
   - 章节生成 `novel-chapter-generation-v1.1`  
   - 大纲生成 `novel-outline-generation-v1`  
   - 知识库生成 `novel-knowledge-generation-v1`  
   - 社会层 `novel-world-society-v1`  

2. **WorldEngine 地图** — 延续 v0.2 内置 Python，无变更主题。

3. **小说助手（Deep Agents Harness）** — 见 [06-NOVEL-ASSISTANT-AGENT.md](./06-NOVEL-ASSISTANT-AGENT.md)：
   - 基于 `deepagents` 的 `createDeepAgent`，非自写 ReAct  
   - 理解当前项目：设定 / 大纲 / 记忆 / 当前章  
   - 可回答创作问题、建议下一步、**经 HITL 确认后**触发四条管线  
   - 不替代 IDE 编辑器；助手是 **Harness 编排与引导层**

4. **Dify 高级模式（Legacy）** — 可选，服务已有 v0.x 用户，非默认。

## 4. 非目标（v1.0 不做）

- 官方云端 SaaS（可 v1.1+ 规划）
- 多人协作 / 云同步
- 内置 AI 视频生成（仍只出视频脚本文本）
- 可视化工作流编辑器（工作流用代码 + LangGraph 定义）
- 完全去掉 `dify/` 资产目录（保留为 prompt/schema/fixture 源）

## 5. 目标用户

| 用户 | v1.0 体验 |
|------|-----------|
| 能跟教程的作者 | 默认内置引擎，5 分钟内填 Key 开写 |
| v0.x Dify 用户 | 设置中切换「Dify 高级模式」，继续用 DSL |
| 开发者 | `WorkflowRunner` + LangGraph 工作流 + Harness 助手；fixture E2E |

## 6. 版本号语义

- **v0.3.x**：Dify onboarding 优化 + `WorkflowRunner` 抽象（不改变默认引擎）
- **v1.0.0-beta***：内置引擎预览，与 Dify 并行
- **v1.0.0**：默认内置引擎 + 小说助手 MVP + Dify 降为高级模式
