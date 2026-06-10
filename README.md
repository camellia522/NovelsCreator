# NovelsCreator 客户端

Electron + Vue 3 桌面端，通过 Main 进程调用 Dify Workflow（含客户端 retry loop）。

## 文档

| 文档 | 说明 |
|------|------|
| **[docs/app/USER-GUIDE.md](docs/app/USER-GUIDE.md)** | **完整用户操作手册（安装、配置、创作流程、排错）** |
| [docs/app/UI-NAVIGATION.md](docs/app/UI-NAVIGATION.md) | 界面布局与路由 |
| [docs/chapter/DIFY-WORKFLOW-IMPLEMENTATION.md](docs/chapter/DIFY-WORKFLOW-IMPLEMENTATION.md) | Dify 工作流搭建 |
| [deploy/dify/README.md](deploy/dify/README.md) | **Dify DSL 一键导入（推荐）** |
| [docs/app/DEVELOPMENT.md](docs/app/DEVELOPMENT.md) | 架构与开发 |

## 快速开始

```bash
npm install
npm run dev
```

1. 欢迎页 → **设置** → 配置 Dify Base URL + API Key → **测试连接** → **保存**
2. **新建项目** 或打开已有项目
3. 工作区：编辑大纲/设定 → **Ctrl+Enter** 向导生成，或 **Shift+Ctrl+Enter** 快速生成

详见 **[docs/app/USER-GUIDE.md](docs/app/USER-GUIDE.md)**。

## 安装包（Release）

GitHub Release 安装包已 **内置 WorldEngine 用 Python**，用户无需 Node / Python。维护者打包：

```bash
npm run pack:win   # Windows 需 Miniconda/Miniforge（conda-forge 依赖）
npm run pack:mac
npm run pack:linux
```

## 故障速查

| 现象 | 处理 |
|------|------|
| `Electron uninstall` | `npm run electron:install` 后重试 `npm run dev` |
| 测试连接 `config undefined` | 完全退出后重启 `npm run dev` |
| 生成 **400** | 核对 Dify START 变量，见 USER-GUIDE §15 |
| preload 未加载 | 确认 `out/preload/index.mjs` 存在并已重启 dev |

## 产品原则

- **一切可编辑**：大纲、知识库、正文、视频稿、剧情记忆均落盘，IDE 内直接改。
- **一切可生成**：章节、大纲、知识库、世界观社会层已接 Dify；地图由 WorldEngine 本地生成。
- **大纲可选**：生成时可关闭「使用大纲节拍」。

## 已实现功能

- IDE 工作区：MenuBar、ActivityBar、侧栏（资源/大纲/设定/记忆）、多标签编辑器、控制台、状态栏
- 欢迎页：新建/打开/最近项目、关于、Dify 设置（章节 / 大纲 / 社会层 / **知识库** 四槽 Key）
- 世界观生成器：WorldEngine 地图 + 可选 Dify 社会层；工作区内地图编辑
- **AI 生成大纲**：串行多章、进度推送、部分完成可续生成、熔断弹窗
- 三要素生成向导（`/workspace/generate/:chapterId`）
- 快速生成、章节/大纲熔断弹窗、脏数据关闭确认
- 章节生成 + 客户端 `status=retry` 循环；生成后自动更新大纲章状态
- 成功落盘 + **memory_patch 自动合并**
- 导出：单章另存为 / 复制到 `exports/`、**全本合并导出**（正文或视频脚本）
- **项目备份**：手动 ZIP、**备份管理**（列表恢复 / 外部 ZIP）；每日打开 + 每 5 章自动备份
- **布局持久化**：侧栏宽度、Activity、控制台折叠与**高度**（可拖拽）写入用户配置
- **Monaco 编辑器**：章节正文 / 视频稿；侧栏长文本（世界观补充设定、全局摘要）
- **AI 生成知识库**：结构化表单预填 → Dify → 合并 world/人物/势力/道具；熔断统一弹窗

## 测试（需 Dify + API Key）

```bash
npm run test:outline-dify    # 大纲 E2E
npm run test:chapter-dify    # 章节 E2E（DIFY_CHAPTER_API_KEY）
npm run test:knowledge-dify  # 知识库 E2E（DIFY_KNOWLEDGE_API_KEY）
npm run test:knowledge-client
npm run test:chapter-client
```

也可在 NovelsCreator 设置中配置 Key 后运行 E2E（脚本会从用户数据读取）。

## 目录

- `electron/main` — 主进程、IPC、Dify HTTP、项目文件
- `electron/preload` — contextBridge API
- `src/` — Vue 3 UI
- `dify/` — 工作流 Code、Prompt、Fixture、Schema
- `docs/` — 文档（[`app/`](docs/app/) · [`chapter/`](docs/chapter/) · [`outline/`](docs/outline/) · [`world/`](docs/world/)）
