# 开发文档索引（v1.0）

本目录为 **NovelsCreator 开发者** 的集中技术文档，涵盖技术栈、工具链、各模块流程与代码映射。

| 文档 | 说明 |
|------|------|
| [TECH-STACK.md](./TECH-STACK.md) | **技术栈总览**：前端、Electron、AI/LangGraph、Python、构建与 CI |
| [TOOLS.md](./TOOLS.md) | **工具文档**：npm 脚本、`scripts/`、LangGraph Studio、打包与调试 |
| [flows/README.md](./flows/README.md) | **模块流程索引**：14 个功能模块的端到端流程 |

## 与其他文档的关系

| 目录 | 用途 |
|------|------|
| [../DEVELOPMENT.md](../DEVELOPMENT.md) | 架构总览、数据模型、Dify 协议（历史与契约） |
| [../MODULES.md](../MODULES.md) | v0.x 时代 12 模块时序图与伪代码（仍作参考） |
| [../../v1.0/03-ARCHITECTURE.md](../../v1.0/03-ARCHITECTURE.md) | v1.0 WorkflowRunner、Harness、迁移矩阵 |
| [../../chapter/](../../chapter/) · [../../outline/](../../outline/) · [../../world/](../../world/) | 各工作流 Prompt / Dify 节点契约 |

## 推荐阅读顺序

1. [TECH-STACK.md](./TECH-STACK.md) — 了解所用技术与版本
2. [TOOLS.md](./TOOLS.md) — 本地开发与测试命令
3. [flows/M08-ai-orchestration.md](./flows/M08-ai-orchestration.md) — AI 生成主链路
4. [flows/M09-workflow-engine.md](./flows/M09-workflow-engine.md) — 内置 LangGraph 与 Dify Legacy
5. [flows/M13-novel-assistant.md](./flows/M13-novel-assistant.md) — 小说助手 Agent

## 模块一览

| ID | 模块 | 流程文档 |
|----|------|----------|
| M01 | 应用启动与壳层 | [flows/M01-app-shell.md](./flows/M01-app-shell.md) |
| M02 | 项目管理 | [flows/M02-project.md](./flows/M02-project.md) |
| M03 | 静态知识库 | [flows/M03-knowledge.md](./flows/M03-knowledge.md) |
| M04 | 三级剧情大纲 | [flows/M04-outline.md](./flows/M04-outline.md) |
| M05 | 动态剧情记忆库 | [flows/M05-memory.md](./flows/M05-memory.md) |
| M06 | IDE 布局与多标签编辑 | [flows/M06-ide-layout.md](./flows/M06-ide-layout.md) |
| M07 | 章节内容管理 | [flows/M07-chapter.md](./flows/M07-chapter.md) |
| M08 | AI 生成编排（客户端） | [flows/M08-ai-orchestration.md](./flows/M08-ai-orchestration.md) |
| M09 | 工作流引擎（Local / Dify） | [flows/M09-workflow-engine.md](./flows/M09-workflow-engine.md) |
| M10 | 导出 | [flows/M10-export.md](./flows/M10-export.md) |
| M11 | 备份与恢复 | [flows/M11-backup.md](./flows/M11-backup.md) |
| M12 | 配置与安全 | [flows/M12-config.md](./flows/M12-config.md) |
| M13 | 小说助手（Deep Agents） | [flows/M13-novel-assistant.md](./flows/M13-novel-assistant.md) |
| M14 | 世界地图与社会层 | [flows/M14-world-generation.md](./flows/M14-world-generation.md) |
