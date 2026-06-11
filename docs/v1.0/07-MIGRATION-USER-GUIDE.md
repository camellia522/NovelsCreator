# v0.x → v1.0 迁移指南

## 1. 面向用户

### 1.1 你需要做什么

| v0.x | v1.0 |
|------|------|
| 安装 Dify + 导入 4 个 DSL | **不需要**（默认） |
| 配置 Base URL + 4 个 app Key | **设置 → AI → 填 1 个 API Key + 选模型** |
| 地图用 WorldEngine | **不变**，安装包仍内置 |

### 1.2 仍想用 Dify？

1. 设置 → **高级** → AI 引擎选 **Dify**  
2. 按 [deploy/dify/README.md](../../deploy/dify/README.md) 导入 DSL  
3. 填写四个 Key（与 v0.x 相同）

### 1.3 项目文件

- 硬盘上的小说项目 **无需迁移**  
- `project.json` 自动兼容；旧 `settings.dify` 仍可读  

### 1.4 助手

- v1.0 首次打开项目可选 **打开助手引导**  
- 助手对话存于 `%APPDATA%/novels-creator/assistant-sessions/{项目ID}/`（transcript + checkpoint），不进项目文件夹；点 **清空** 可删除

---

## 2. 面向维护者 / 开发者

### 2.1 仓库与发布

- **`main`** 已为 **v1.0.0** 稳定线；默认文档与 README 指向 Local 引擎  
- 发布：`git tag v1.0.0 && git push origin v1.0.0` → CI 构建 Release（见 [RELEASE-NOTES-v1.0.0.md](./RELEASE-NOTES-v1.0.0.md)）

### 2.2 依赖

```bash
npm install @langchain/core @langchain/langgraph @langchain/openai zod
```

### 2.3 配置迁移（已实现）

| 场景 | 行为 |
|------|------|
| **新安装** | `ai.engine = local`；首次启动弹出 AI 向导 |
| **v0.2 覆盖升级且已配 Dify 四 Key** | 保留 `config.json` 中的 `ai.engine` 与 `dify-secrets.bin`；默认仍为 `dify` 直至用户在设置中切换 |
| **仅填内置 LLM Key** | `llm-secrets.bin` 写入后，Local 工作流与助手可用 |
| **向导「稍后配置」** | 写入 `ai.onboardingCompleted`，不再自动弹出 |

### 2.4 工作流资产

- **不要删** `deploy/dify/workflows/`  
- 修改 prompt 时：同步更新 `dify/*/prompts` 与 LangGraph 模板加载源  

### 2.5 Release

- Tag：`v1.0.0`  
- Release Notes 必须包含 **Breaking：默认 AI 配置方式变更**  
- 附件：Win/Mac/Linux 安装包（流程同 v0.2）  

---

## 3. 回滚

- 设置中切回 **Dify 高级模式** 即可恢复 v0.x 行为  
- v1.0 安装包 **不卸载** 用户 Dify 实例  

---

## 4. FAQ

**Q：v0.2 安装的 exe 能直接升 v1.0 吗？**  
A：覆盖安装即可；配置按 §2.3 迁移。

**Q：DSL 还会更新吗？**  
A：会，但仅 Legacy 路径；主开发转向 `electron/main/workflows/`。

**Q：助手会增加多少 Token 消耗？**  
A：对话按消息计费；生成仍按章节/大纲单次计费，与 v0.x 同量级。
