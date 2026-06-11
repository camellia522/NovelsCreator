# NovelsCreator v1.0.0

Electron + Vue 3 桌面端，**默认内置 LangGraph 工作流** + **Deep Agents 小说助手**；Dify 为可选 Legacy 高级模式。

## 文档

| 文档 | 说明 |
|------|------|
| **[docs/app/USER-GUIDE.md](docs/app/USER-GUIDE.md)** | **用户手册**（安装、AI 配置、创作流程、排错） |
| **[docs/v1.0/RELEASE-NOTES-v1.0.0.md](docs/v1.0/RELEASE-NOTES-v1.0.0.md)** | **v1.0.0 发行说明** |
| **[docs/v1.0/README.md](docs/v1.0/README.md)** | v1.0 架构、迁移、验收、测试 |
| [docs/app/DEVELOPMENT.md](docs/app/DEVELOPMENT.md) | 开发者架构与模块 |
| [docs/app/UI-NAVIGATION.md](docs/app/UI-NAVIGATION.md) | 界面布局与路由 |
| [deploy/dify/README.md](deploy/dify/README.md) | Dify Legacy DSL 导入（可选） |
| [docs/DIFY-WORKFLOWS-INDEX.md](docs/DIFY-WORKFLOWS-INDEX.md) | 四条工作流契约索引 |

## 快速开始

```bash
npm install
npm run dev
```

1. 欢迎页 → **设置** → 填写 OpenAI 兼容 **API Key** 与模型 → **测试连接** → **保存**
2. **新建项目** 或打开已有项目
3. 工作区：编辑大纲/设定 → **Ctrl+Enter** 章节向导，或 **Shift+Ctrl+Enter** 快速生成；Activity Bar **助手** 可对话式创作

详见 **[docs/app/USER-GUIDE.md](docs/app/USER-GUIDE.md)** §3。

## 安装包（Release）

GitHub Release 安装包已 **内置 WorldEngine 用 Python**，用户无需 Node / Python。

```bash
npm run icons        # 可选：从 resources/icon.svg 生成 PNG/ICO
npm run pack:win     # Windows（需 Miniconda/Miniforge）
npm run pack:mac
npm run pack:linux
```

打 tag `v1.0.0` 推送后，`.github/workflows/release.yml` 会自动构建三平台安装包并创建 GitHub Release。

## v1.0 核心能力

- **内置 LangGraph**：大纲 / 知识库 / 章节 / 世界观社会层（默认引擎）
- **小说助手**：流式对话、工具调用、HITL 确认、**对话持久化**（按项目保存至 userData）
- **WorldEngine**：本地地图生成与编辑
- **IDE 工作区**：大纲、设定、记忆、Monaco 正文/视频稿、备份、全本导出
- **Dify Legacy**：设置 → AI → 高级，切换引擎后沿用 v0.x 四 Key

## 测试

```bash
npm run typecheck
npm run test:local-nodes          # 四工作流本地 Code 节点
npm run test:outline-code
npm run test:knowledge-code
npm run test:chapter-client
npm run test:outline-local-e2e    # 可选真实 LLM（LOCAL_LLM_API_KEY）
```

Dify Legacy E2E：`npm run test:outline-dify` · `test:chapter-dify` · `test:knowledge-dify`

## 故障速查

| 现象 | 处理 |
|------|------|
| `Electron uninstall` | `npm run electron:install` 后重试 `npm run dev` |
| 助手未配置 Key | 设置 → AI → 填写 API Key |
| 生成失败 / 熔断 | 控制台与 USER-GUIDE §15；Local 与 Dify 分别排错 |
| preload 未加载 | 确认 `out/preload/index.mjs` 存在并已重启 dev |

## 目录

- `electron/main` — 主进程、IPC、LangGraph 工作流、小说助手 Agent
- `electron/preload` — contextBridge API
- `src/` — Vue 3 UI
- `langgraph/` — Studio 调试图与本地节点
- `dify/` — Legacy 工作流资产（Prompt、Code、Fixture、Schema）
- `docs/` — 文档（[`v1.0/`](docs/v1.0/) · [`app/`](docs/app/) · 工作流子目录）
- `resources/` — 应用图标等资源

## 升级说明

自 **v0.2.x** 升级见 [docs/v1.0/07-MIGRATION-USER-GUIDE.md](docs/v1.0/07-MIGRATION-USER-GUIDE.md)。新安装默认 **Local** 引擎，无需部署 Dify。
