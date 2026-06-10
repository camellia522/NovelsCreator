# NovelsCreator 用户操作手册

> 面向作者与操作者的完整使用说明。技术实现见 [DEVELOPMENT.md](./DEVELOPMENT.md)；界面结构见 [UI-NAVIGATION.md](./UI-NAVIGATION.md)。

---

## 目录

1. [产品简介](#1-产品简介)
2. [环境与安装](#2-环境与安装)
3. [首次配置 Dify](#3-首次配置-dify)
4. [项目管理](#4-项目管理)
5. [工作区总览](#5-工作区总览)
6. [大纲（可选 / 可编辑 / 可生成）](#6-大纲可选--可编辑--可生成)
7. [知识库设定](#7-知识库设定)
8. [剧情记忆库](#8-剧情记忆库)
9. [章节生成](#9-章节生成)
10. [编辑正文与视频稿](#10-编辑正文与视频稿)
11. [导出](#11-导出)
12. [熔断与重试](#12-熔断与重试)
13. [项目目录说明](#13-项目目录说明)
14. [快捷键](#14-快捷键)
15. [常见问题](#15-常见问题)
16. [相关文档索引](#16-相关文档索引)

---

## 1. 产品简介

NovelsCreator 是 **IDE 风格** 的长篇小说创作桌面应用：

- **本地项目**：大纲、世界观、人物、剧情记忆、章节正文均保存在你的硬盘。
- **Dify 工作流**：AI 生成由自托管或云端 Dify 的 **Workflow** 完成，客户端负责组参、重试、落盘。
- **双产物**：每次成功生成得到 **小说正文** + **视频脚本** 两个文件。
- **原则**：一切可手写编辑，一切可 AI 生成；**大纲可选**（可不传节拍，由 Brief 与设定驱动）。

---

## 2. 环境与安装

### 2.1 前置条件

| 项 | 要求 |
|----|------|
| 操作系统 | Windows 10+ / macOS / Linux |
| Dify | 已部署 Workflow 应用（章节 / 大纲 / 知识库 / 社会层），且已 **发布** |
| 网络 | 客户端能访问 Dify 的 `/v1` API |

> **Release 安装包**已内置 WorldEngine 用的 Python，**无需**单独安装 Python 或 Node.js。  
> 以下 `npm` 方式仅适用于从源码参与开发。

### 2.2 安装与启动（Release 用户）

1. 从 [GitHub Releases](https://github.com/camellia522/NovelsCreator/releases) 下载对应系统的安装包  
2. 安装并启动 NovelsCreator  
3. 按 [§3 首次配置 Dify](#3-首次配置-dify) 填写 API Key  

### 2.3 从源码开发

| 项 | 要求 |
|----|------|
| Node.js | 18+（推荐 20 LTS） |
| Python / conda | 仅地图功能需要；可运行 `scripts/setup-worldengine.ps1` |

```bash
cd NovelsCreator
npm install
npm run dev
```

若报错 `Error: Electron uninstall`：

```bash
npm run electron:install
npm run dev
```

### 2.4 打包发布（维护者）

内置便携 Python + Electron 安装包：

```bash
# Windows 建议已安装 Miniconda/Miniforge（用于 worldengine 依赖）
npm run pack:win

# 或分步
npm run build
npm run build:python   # 生成 resources/python
npx electron-builder --win
```

产物在 `release/` 目录。

---

## 3. 首次配置 Dify

**推荐**：从仓库导入 DSL，见 **[deploy/dify/README.md](../../deploy/dify/README.md)**（`deploy/dify/workflows/*.yml`）。

简要步骤：

1. 部署 Dify → 逐个 **导入 DSL** → **发布** → 复制各应用 **API Key**（`app-...`）
2. 启动 NovelsCreator，左下 **⚙ 设置** → **Dify** 标签
3. 填写 **Base URL**（各工作流通常共用）：
   - 自建示例：`http://127.0.0.1/v1`
   - 云端示例：`https://api.dify.ai/v1`
4. 为每个 **工作流** 分别填写 **API Key**（导入 DSL 后，Dify 应用 → **访问 API** → 复制 `app-...`）：

   | 设置项 | workflow_id |
   |--------|-------------|
   | **章节生成** | `novel-chapter-generation-v1.1` |
   | **大纲生成** | `novel-outline-generation-v1` |
   | **世界观社会层** | `novel-world-society-v1` |
   | **知识库生成** | `novel-knowledge-generation-v1` |

   > **地图**由本地 WorldEngine 生成，**无需** Dify Key。

5. 每个区块可点 **测试连接**（无需先保存；使用当前表单内容）。
6. 点 **保存 Dify 配置**。Key 经系统加密存于用户目录，不会写入项目文件夹。

**设置其他标签**：**外观**（深色/浅色/跟随系统、编辑器字号与行号）、**常规**（默认项目目录）、**工作区**（恢复默认布局）。

> **注意**：必须使用 **Workflow（工作流）** 应用的 Key，不是 Chatflow。各应用 Key 不同，勿混用。

### 3.1 Dify 工作流发布检查清单

在 Dify 控制台确认：

- [ ] 应用类型为 **工作流**，非对话型 Chatflow  
- [ ] 已点击 **发布**  
- [ ] **开始** 节点变量与 `dify/chapter/fixtures/run-request-success.json` 一致（含 `retry_count`、`estimated_duration_sec` 等 v1.1 字段）  
- [ ] END 经 **PARSE** 节点输出 11 个扁平字段  

详见 [DIFY-WORKFLOW-IMPLEMENTATION.md](../chapter/DIFY-WORKFLOW-IMPLEMENTATION.md)。

---

## 4. 项目管理

### 4.1 新建项目

**欢迎页** → **新建项目** 卡片：

1. 输入书名（将作为文件夹名）。
2. （可选）选择父目录；不选则创建时弹出系统目录选择。
3. 点 **创建并打开** → 自动进入工作区。

新建后会生成默认结构：`ch-001`、空知识库、示例节拍等（见 [§13](#13-项目目录说明)）。

### 4.2 打开项目

- **打开项目**：选择包含 `project.json` 的文件夹。  
- **最近项目**：单击卡片即可打开。

### 4.3 数据如何保存

所有创作内容都会 **自动写入当前项目文件夹**（即包含 `project.json` 的目录），无需手动点保存：

| 内容 | 落盘路径 |
|------|----------|
| 大纲 | `outline/outline.json` |
| 世界观 / 人物 / 势力 / 道具 | `knowledge/*.json` |
| 剧情记忆 | `memory/plot-memory.json` |
| 章节正文 / 视频稿 | `chapters/vol-01/{章ID}/novel.txt`、`video-script.txt` |

- 侧栏编辑后约 **0.8 秒** 自动保存；正文编辑约 **1.2 秒** 后自动保存。
- 关闭窗口或关闭项目前会 **立即落盘**。
- **重启客户端后**，请在欢迎页从 **最近项目** 或 **打开项目** 进入 **同一文件夹**，数据才会加载回来。

侧栏底部显示「已保存到项目文件夹」即表示已成功写入磁盘。

### 4.4 关闭项目

**菜单栏** → **文件** → **关闭项目**。关闭前会自动保存所有未落盘更改。

---

## 5. 工作区总览

```
┌─────────────────────────────────────────────────────────────┐
│ 菜单栏（文件 / 生成 / 工具 / 视图）                           │
├──┬────────────┬─────────────────────────────────────────────┤
│📁│  侧栏面板   │  中央：标签页 + 编辑器                       │
│📋│  (随左侧    │  [大纲·第一章] [ch-001 正文] ...             │
│📖│   图标切换) │                                             │
│🧠│            ├─────────────────────────────────────────────┤
│⚙│            │  Generation Console（可折叠）                │
├──┴────────────┴─────────────────────────────────────────────┤
│ 状态栏：项目名 | 当前章 | 就绪/生成中                          │
└─────────────────────────────────────────────────────────────┘
```

| 左侧图标 | 面板 | 作用 |
|----------|------|------|
| 📁 资源 | 项目资源树 | 章节列表，**双击**打开正文+视频稿标签 |
| 📋 大纲 | 大纲树 | 卷章、节拍、生成本章入口 |
| 📖 设定 | 知识库 | 世界 / 人物 / 势力 / 道具 |
| 🧠 记忆 | 剧情记忆 | 全局摘要、章摘要（生成后自动合并 patch） |
| ⚙ | 设置 | 外观 / Dify / 常规 / 工作区 |

**菜单栏补充**

| 菜单 | 项 | 说明 |
|------|-----|------|
| **文件** | 导出… / 备份项目 / **备份管理…** | 见 [§11](#11-导出) · [§13](#13-项目目录说明) |
| **生成** | 三要素向导 / 快速生成 / **AI 生成大纲** / **AI 生成知识库** | 见 [§6.3](#63-ai-生成大纲) · [§7.2](#72-ai-生成知识库) |
| **工具** | **世界观生成器** | WorldEngine 地图 + 可选 Dify 社会层，见 [§7.3](#73-世界观生成器) |
| **视图** | 切换控制台 / 切换侧栏 | 布局状态会持久化；控制台顶部可**拖动**调整高度 |

---

## 6. 大纲（可选 / 可编辑 / 可生成）

### 6.1 表单编辑（无需手写 JSON）

1. 点左侧 **📋 大纲**。
2. 在章节列表中点击选中一章；下方表单可编辑 **章标题**、**状态**、**节拍列表**。
3. 使用 **+ 章** / **+ 节拍** 增删内容；可编辑卷名。
4. 修改后底部 **保存大纲** 变亮，点击后由客户端写入 `outline/outline.json`。

> 中央编辑器仅用于 **正文** 与 **视频稿** 文本，不再用 JSON 标签编辑大纲。

### 6.2 大纲与生成的关系

| 情况 | 生成行为 |
|------|----------|
| 有节拍且勾选「使用大纲」 | `outline_beats` 传 JSON 数组，走 N2a 校验 |
| 无节拍或未勾选 | 传 `[]`，由 Brief / 知识库 / 记忆驱动 |

在 **快速生成** 或 **三要素向导** 中均可选择是否使用大纲。

### 6.3 AI 生成大纲

1. **生成 → AI 生成大纲**（或侧栏大纲面板入口）。
2. 在对话框中配置：目标卷、待生成章数、题材/时代/力量约束、创作 brief（可选）。
3. 客户端 **逐章串行** 调用 Dify `novel-outline-generation-v1`，每章成功后写入 `outline.json` 并更新章 `status`。
4. 若部分章节失败，可 **续生成** 剩余章；若 **熔断**，弹出对话框展示校验问题（见 [§12](#12-熔断与重试)）。

搭建 Dify 画布见 [DIFY-OUTLINE-WORKFLOW-IMPLEMENTATION.md](../outline/DIFY-OUTLINE-WORKFLOW-IMPLEMENTATION.md)。

侧栏 **+ 卷** 可新增卷；表单编辑节拍见 [§6.1](#61-表单编辑无需手写-json)。

---

## 7. 知识库设定

1. 点 **📖 设定**。
2. 切换 Tab：**世界** / **人物** / **势力** / **道具**，在表单中填写各字段。
3. 人物 Tab：左侧列表选人，右侧编辑姓名、身份、性格标签（逗号分隔）、外貌等。
4. 修改后点底部 **保存设定**，客户端分别写入 `knowledge/world.json`、`characters.json`、`factions.json`、`items.json`。

生成章节时，客户端自动组装 `knowledge_snapshot` 传入 Dify。

**建议**：至少配置 1 个主角，否则章节 lore 校验可能失败。

### 7.2 AI 生成知识库

1. **生成 → AI 生成知识库**，或设定侧栏 **AI 生成知识库**。
2. 对话框会 **根据当前设定预填** 世界名、题材、主角、地图国家名等；空白项在表单中补充。
3. 选择模式：
   - **扩充**：保留已有 id/姓名，按 id 合并新增人物/势力/道具。
   - **bootstrap**：以 brief 为主刷新 world 与列表。
4. 点击 **开始生成** → 客户端合成 brief 调用 Dify → 合并写入 `knowledge/*.json`（**不含** map/locations/nations）。

brief 写作指南：[KNOWLEDGE-BRIEF-GUIDE.md](../knowledge/KNOWLEDGE-BRIEF-GUIDE.md) · Dify 搭建：[DIFY-KNOWLEDGE-WORKFLOW-IMPLEMENTATION.md](../knowledge/DIFY-KNOWLEDGE-WORKFLOW-IMPLEMENTATION.md)

### 7.3 世界观生成器

1. **工具 → 世界观生成器**（路由 `/workspace/world-generator`）。
2. **地图**：本地 **WorldEngine** 生成地形与卫星风格贴图，可在工作区打开 **地图编辑**。
3. **社会层（可选）**：领土绘制完成后，调用 Dify `novel-world-society-v1` 生成国家/城市文案并写入 knowledge。

详见 [WORLD-GENERATOR-WIZARD.md](../world/w2-society/WORLD-GENERATOR-WIZARD.md)。

## 8. 剧情记忆库

1. 点 **🧠 记忆**。
2. 三个子 Tab：
   - **全局**：全书摘要文本框
   - **章摘要**：按章维护摘要与关键事件（逗号分隔）
   - **伏笔**：描述与「已揭示」勾选
3. 修改后点 **保存记忆** 写入 `memory/plot-memory.json`。

### 8.1 生成后自动更新

章节生成 **success** 且 Dify 返回 `memory_patch` 时，客户端会自动：

- 追加 `globalSummaryDelta` 到全局摘要  
- 写入 / 更新本章 `chapterSummaries`  
- 合并 `foreshadowingUpdates`  

控制台会显示：`剧情记忆已更新（memory_patch 已合并）`。

---

## 9. 章节生成

### 9.1 快速生成（熟练用户）

1. 在资源树或大纲树选中目标章（如 `ch-001`）。
2. **Shift + Ctrl + Enter**，或菜单 **生成 → 快速生成**。
3. 对话框中：
   - 勾选/取消 **使用大纲节拍**
   - 可选填 **Brief**（→ `generation_prompt_text`）
4. **开始生成** → 底部 **Generation Console** 展开显示日志。

### 9.2 三要素向导（推荐新用户）

1. **Ctrl + Enter**，或菜单 **生成 → 三要素向导**。
2. 路由：`/workspace/generate/:chapterId`。
3. 四步：
   - **环境**：时代、场景、氛围、补充说明  
   - **人物**：从知识库添加，配置性格 / 三观 / 本章目标  
   - **情节**：目标、冲突、节拍（可来自大纲）、基调  
   - **预览**：可读 Brief + 结构化 JSON，确认后 **生成本章**
4. 可选：生成后自动打开正文与视频稿标签。

### 9.3 生成过程说明

| 阶段 | 说明 |
|------|------|
| 请求 | `POST {BaseURL}/workflows/run`，blocking 模式 |
| 客户端 retry | 若返回 `status=retry`，自动带 `retry_count` / `retry_issues_formatted` 重试（方案 B，不回连 N1） |
| 成功 | 写入 `chapters/.../novel.txt`、`video-script.txt`、`meta.json`，合并 memory_patch |
| 熔断 | 弹出 **CircuitBreakModal**，引导改大纲或设定 |

单次生成可能耗时 **数分钟**（视模型与章节长度而定）。

---

## 10. 编辑正文与视频稿

1. **资源树双击章节**，或生成成功后自动打开标签。
2. 标签类型：
   - `ch-001 正文` → `novel.txt`（**Monaco** 编辑器，支持行号、自动换行）
   - `ch-001 视频脚本` → `video-script.txt`
3. 修改后 **Ctrl+S** 保存，或关闭标签时选择保存；标签 **●** 表示未保存。

**侧栏长文本**（知识库「补充设定」、记忆库「全局摘要」）同样使用 Monaco 紧凑编辑器（自动换行、可滚动），保存方式不变（侧栏底部 **保存** 按钮）。

大纲节拍、人物短字段等仍在普通表单控件中编辑。

---

## 11. 导出

**菜单** → **文件** → **导出…**

| 模式 | 操作 | 说明 |
|------|------|------|
| **单章** | 另存为… | 系统保存对话框，导出 txt/md |
| **单章** | 复制到项目 exports/ | `{项目}/exports/{chapterId}/` |
| **全本** | 合并导出 | 按大纲顺序合并所有章的正文或视频脚本 |

---

## 12. 熔断与重试

### 12.1 校验重试（自动）

大纲或设定校验失败且未达 `max_retry` 时，Dify 返回 `status=retry`，**客户端自动重试**，无需手动点按钮。

### 12.2 熔断（需人工）

达到最大重试或触发熔断时，弹出 **熔断对话框**，展示 `retry_issues_formatted` 或校验报告。

| 类型 | 常见操作 |
|------|----------|
| **章节** | 修改大纲 / 修改设定 / 查看控制台 |
| **大纲** | 修改设定 / 剧情记忆 / 查看大纲 |
| **知识库** | 修改设定 / 重新打开 AI 生成知识库 |

修改后重新生成即可。

---

## 13. 项目目录说明

```
我的小说/
├── project.json              # 项目元数据（UUID、设置）
├── knowledge/
│   ├── world.json
│   ├── characters.json
│   ├── factions.json
│   └── items.json
├── outline/
│   └── outline.json          # 卷 → 章 → 节拍
├── memory/
│   └── plot-memory.json      # 全局摘要、章摘要、伏笔
├── chapters/
│   └── vol-01/
│       └── ch-001/
│           ├── novel.txt
│           ├── video-script.txt
│           └── meta.json       # 生成时间、Dify run id
├── exports/                  # 导出副本
└── backups/                  # ZIP 自动/手动备份（保留最近 7 份）
```

**请勿删除** 正在使用的 `project.json`，否则无法打开项目。

**备份操作**：**文件 → 备份项目** 立即打包；**文件 → 备份管理…** 查看列表并恢复，或选择外部 ZIP。自动备份保留最近 7 份。

---

## 14. 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Enter` | 打开三要素生成向导（当前选中章） |
| `Shift + Ctrl + Enter` | 快速生成对话框 |
| （编辑器内）`Ctrl + S` | 保存当前标签（浏览器默认，视焦点而定） |

---

## 15. 常见问题

### Q1：生成报 400，`retry_issues` / `estimated_duration_sec is required`？

Dify **开始** 节点变量名必须与客户端一致。常见两套命名：

| 客户端会传 | 用途 |
|------------|------|
| `retry_issues` | JSON 数组字符串，首轮 `[]` |
| `retry_issues_formatted` | Markdown 驳回说明，供 N1 注入 |
| `estimated_duration_sec` | 数字，默认 180 |

若画布只有 `retry_issues` 没有 `retry_issues_formatted`，请在 Dify 中 **补加** `retry_issues_formatted`（文本，可空），或保持与仓库 `dify/chapter/fixtures/run-request-success.json` 一致。

修改代码后请 **重启 `npm run dev`**。

### Q2：`window.novelsCreator` / 测试连接报 config undefined？

重启 `npm run dev`（主进程 preload 路径已修复为 `index.mjs`）。

### Q3：N2b lore_valid 一直 false？

检查 `knowledge_snapshot` 是否包含人物；新建项目默认人物为空，请在 **设定** 中至少添加一名角色。

### Q4：生成很慢 / 超时？

工作流 blocking 超时客户端设为 10 分钟。若仍失败，可在 Dify 缩短链路或换更快模型。

### Q5：memory_patch 未更新？

确认 Dify END/PARSE 是否输出 `memory_patch`；查看控制台是否有「剧情记忆已更新」。

### Q6：如何用 curl 单独测 Dify？

```bash
curl -X POST "http://127.0.0.1/v1/workflows/run" \
  -H "Authorization: Bearer app-你的Key" \
  -H "Content-Type: application/json" \
  -d @dify/chapter/fixtures/run-request-success.json
```

---

## 16. 相关文档索引

| 文档 | 读者 |
|------|------|
| [USER-GUIDE.md](./USER-GUIDE.md) | **用户 / 操作者（本文）** |
| [UI-NAVIGATION.md](./UI-NAVIGATION.md) | 界面与路由设计 |
| [GENERATION-WIZARD.md](../chapter/GENERATION-WIZARD.md) | 三要素向导与 Prompt 格式 |
| [DIFY-WORKFLOW-IMPLEMENTATION.md](../chapter/DIFY-WORKFLOW-IMPLEMENTATION.md) | Dify 章节画布搭建 |
| [DIFY-OUTLINE-WORKFLOW-IMPLEMENTATION.md](../outline/DIFY-OUTLINE-WORKFLOW-IMPLEMENTATION.md) | Dify 大纲画布搭建 |
| [DIFY-KNOWLEDGE-WORKFLOW-IMPLEMENTATION.md](../knowledge/DIFY-KNOWLEDGE-WORKFLOW-IMPLEMENTATION.md) | Dify 知识库画布搭建 |
| [KNOWLEDGE-BRIEF-GUIDE.md](../knowledge/KNOWLEDGE-BRIEF-GUIDE.md) | AI 生成知识库 brief 指南 |
| [DIFY-WORKFLOWS-INDEX.md](../DIFY-WORKFLOWS-INDEX.md) | 全部 Dify 工作流索引 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 架构与开发 |
| [MODULES.md](./MODULES.md) | 功能模块与流程 |

---

*文档版本：与客户端当前功能对齐（四路 Dify + WorldEngine + 备份/全本导出）。若界面与文档不一致，以仓库代码为准。*
