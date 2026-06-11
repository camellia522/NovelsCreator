# 工具文档

> npm 脚本、`scripts/` 目录工具、LangGraph Studio、打包与本地调试

---

## 1. 日常开发命令

| 命令 | 说明 |
|------|------|
| `npm install` | 安装 Node 依赖；`postinstall` 下载 Electron 二进制 |
| `npm run dev` | electron-vite 热重载开发（Main + Renderer） |
| `npm run build` | 生产构建 → `out/main`、`out/preload`、`out/renderer` |
| `npm run typecheck` | `vue-tsc` 渲染进程类型检查 |
| `npm run preview` | 预览构建结果 |

### 环境变量（开发）

| 变量 | 用途 |
|------|------|
| `LOCAL_LLM_API_KEY` | 内置工作流 / Studio 用 LLM Key |
| `LOCAL_LLM_BASE_URL` | API Base（如 `https://api.deepseek.com`） |
| `LOCAL_LLM_MODEL` | 创作模型 |
| `LOCAL_LLM_REASONING_MODEL` | 推理/校验模型 |
| `LANGSMITH_API_KEY` | LangGraph Studio trace（可选） |
| `NC_SKIP_IF_READY=1` | Python bundle 已就绪时跳过重建 |
| `NC_USE_CONDA=1` | 强制 conda 路径构建 Python |
| `CSC_IDENTITY_AUTO_DISCOVERY=false` | 本地打包禁用代码签名发现 |

`.env` 仅用于本地 Studio，**勿提交 Git**。

---

## 2. 图标与打包

| 命令 | 说明 |
|------|------|
| `npm run icons` | `scripts/generate-app-icons.cjs`：SVG → PNG/ICO |
| `npm run build:python` | 构建 `resources/python` WorldEngine bundle |
| `npm run pack:win` | 图标 → build → python → `scripts/pack-win.cjs` |
| `npm run pack:mac` | macOS DMG |
| `npm run pack:linux` | Linux AppImage |
| `npm run pack` | 当前平台默认打包 |

### pack-win 三阶段（`scripts/pack-win.cjs`）

1. `electron-builder --win --dir` → `release/win-unpacked/`
2. `embed-win-icon.cjs`（rcedit 写入 exe 图标）
3. `electron-builder --win --prepackaged` → `NovelsCreator-1.0.0-win-x64.exe`

### Python 环境脚本

| 脚本 | 说明 |
|------|------|
| `scripts/build-python-bundle.cjs` | 发布用便携 Python；支持 `--force` |
| `scripts/setup-worldengine.ps1` | Windows 开发：conda/venv + worldengine |
| `scripts/worldengine_generate.py` | Main 进程调用的地图生成 CLI |
| `scripts/requirements-worldengine.txt` | `worldengine`、`Pillow` |

---

## 3. LangGraph Studio

| 命令 | 说明 |
|------|------|
| `npm run studio:dev` | 启动 LangGraph Studio（读取 `langgraph.json`） |
| `npm run studio:graphs-check` | 校验 Studio 图可编译 |

**相关路径**

- `langgraph.json` — 图入口注册
- `langgraph/studio/graphs/` — chapter / outline / knowledge / society
- `langgraph/studio/builders/` — 与 Main 侧图对齐的构建器
- `langgraph/studio/fixtures.ts` — 测试输入样例

详见 [../../v1.0/LANGGRAPH-STUDIO.md](../../v1.0/LANGGRAPH-STUDIO.md)。

---

## 4. 测试脚本总表

### 4.1 内置工作流节点（无 LLM）

| 命令 | 脚本 | 覆盖 |
|------|------|------|
| `npm run test:outline-local-nodes` | `test-outline-local-nodes.ts` | O1X、AGG、END 节点 |
| `npm run test:knowledge-local-nodes` | `test-knowledge-local-nodes.ts` | K1X、AGG、END |
| `npm run test:chapter-local-nodes` | `test-chapter-local-nodes.ts` | P0、AGG、N4b、N5、END |
| `npm run test:society-local-nodes` | `test-society-local-nodes.ts` | W2SX、END |
| `npm run test:local-nodes` | 上述四者串联 | 全部本地节点 |

### 4.2 客户端逻辑（无 LLM）

| 命令 | 脚本 | 覆盖 |
|------|------|------|
| `npm run test:outline-client` | `test-outline-client-flow.ts` | 大纲 ID 解析、占位过滤 |
| `npm run test:knowledge-client` | `test-knowledge-client-flow.ts` | Brief 合并、字段对齐 |
| `npm run test:chapter-client` | `test-chapter-client-flow.ts` | 章节输出校验、memory_patch |

### 4.3 Python Dify Code 节点

| 命令 | 脚本 | 覆盖 |
|------|------|------|
| `npm run test:outline-code` | `test-outline-code-nodes.py` | `dify/outline/code/` |
| `npm run test:knowledge-code` | `test-knowledge-code-nodes.py` | `dify/knowledge/code/` |
| `npm run test:outline-flow` | `test-outline-full-flow.py` | 大纲 Code 节点 + 客户端模拟 |
| `npm run test:outline-all` | flow + client | 大纲全链路（无 HTTP） |
| `npm run test:society-end-ok` | `test-society-end-ok.py` | 社会层 END_OK 节点 |

`run-outline-python.cjs` 统一用 `scripts/.conda-env` 或系统 Python 执行。

### 4.4 Dify E2E（需运行中的 Dify + Key）

| 命令 | 脚本 |
|------|------|
| `npm run test:outline-dify` | `test-outline-dify-e2e.ts` |
| `npm run test:knowledge-dify` | `test-knowledge-dify-e2e.ts` |
| `npm run test:chapter-dify` | `test-chapter-dify-e2e.ts` |

共用：`scripts/dify-e2e-common.ts`（凭据读取 + blocking HTTP）。

PowerShell 健康检查：`test-dify-outline.ps1`、`test-dify-world-society.ps1`。

### 4.5 社会层专项

| 命令 | 脚本 | 说明 |
|------|------|------|
| `npm run test:society-parse` | `test-society-dify-parse.ts` | 解析 Dify END 输出 |
| `npm run test:society-fixtures` | `test-society-dify-fixtures.ts` | Fixture 回归 |
| `npm run test:society-merge` | `test-society-merge-align.ts` | 地点 ID/坐标合并 |
| `npm run test:society-flow` | `simulate-society-full-flow.ts` | 本地→Dify→merge 模拟 |

### 4.6 LLM / Agent

| 命令 | 脚本 | 说明 |
|------|------|------|
| `npm run test:outline-local-e2e` | `test-outline-local-e2e.ts` | 真实 LLM 大纲 E2E |
| `npm run test-agent-spike` | `test-agent-spike.ts` | Deep Agents Harness 冒烟 |

### 4.7 辅助生成

| 命令 | 脚本 | 说明 |
|------|------|------|
| `npm run gen:dify-inputs-md` | `json-inputs-to-dify-markdown.ts` | Fixture → Dify 导入 Markdown |
| `npm run gen:knowledge-inputs-md` | 同上 `--knowledge` | 知识库 fixture |

---

## 5. 调试与密钥工具（仅开发）

| 脚本 | 说明 | 注意 |
|------|------|------|
| `scripts/dify-secrets-dump.cjs` | 解密 `%APPDATA%/novels-creator/dify-secrets.bin` | 勿在生产环境使用 |
| `scripts/llm-secrets-dump.cjs` | 解密 `llm-secrets.bin` | 同上 |

---

## 6. IPC 调试

渲染进程通过 `window.novelsCreator` 调用（定义于 `electron/preload/index.ts`）。

**命名空间**

- `config.*` — 配置读写、连接测试
- `project.*` — 项目 CRUD、大纲/知识/章节/记忆 IO
- `ai.*` — 章节/大纲/知识生成
- `agent.*` — 助手聊天、流式、HITL、会话持久化
- `dify.*` — Legacy 别名（与 `ai.*` 部分重叠）
- `backup.*` / `export.*` / `world.*`

类型契约：`src/types/api.ts`。

**推送通道（Main → Renderer）**

- `ai:outlineProgress` / `dify:outlineProgress`
- `agent:streamEvent`
- `agent:projectMutated`

---

## 7. 推荐工作流

### 新功能开发

```bash
npm run dev
npm run typecheck
npm run test:local-nodes    # 改工作流节点时
npm run test:chapter-client # 改客户端逻辑时
```

### 发版前

```bash
npm run typecheck
npm run build
npm run test:local-nodes
npm run test:outline-client
npm run test:knowledge-client
npm run test:chapter-client
NC_SKIP_IF_READY=1 npm run pack:win   # Windows
```

### 调试助手

```bash
npm run dev
# 设置 → AI → 配置助手模型
# 助手面板聊天；会话存于 %APPDATA%/novels-creator/assistant-sessions/
```

### 调试 WorldEngine

```bash
scripts/setup-worldengine.ps1   # 首次
npm run dev
# 世界生成器 → 原生引擎检测
```
