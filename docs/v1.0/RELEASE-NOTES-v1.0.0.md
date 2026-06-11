# Release Notes — v1.0.0

**发布日期**：2026-06  
**主题**：内置 LangGraph 工作流 + Deep Agents 小说助手，默认无需 Dify。

---

## 亮点

- **内置 LangGraph 引擎（默认）**：大纲、知识库、章节、世界观社会层均在本地执行，仅需 OpenAI 兼容 API Key（如 DeepSeek）。
- **小说助手**：Activity Bar「助手」面板，流式对话；`generate_*` / `write_*` 工具需用户确认（HITL）；**对话按项目持久化**至 `%APPDATA%/novels-creator/assistant-sessions/`。
- **首次启动向导**：3 步完成 API Key 与模型配置。
- **Dify Legacy**：设置 → AI → 高级折叠区，切换引擎后可沿用 v0.x 四 Key 工作流。
- **WorldEngine**：地图生成逻辑不变，安装包仍内置 Python。
- **品牌**：书本 + 齿轮应用图标；欢迎页与安装包统一。

---

## Breaking changes（相对 v0.2.x）

| 变更 | 说明 |
|------|------|
| 默认 AI 配置 | 新安装默认 `ai.engine = local`，不再要求先部署 Dify |
| 设置入口 | 「Dify」独立标签合并为 **设置 → AI**（内置 LLM + 高级 Dify） |
| 助手 Key | 助手与 Local 工作流共用 `llm-secrets.bin`，与 Dify Key 独立 |
| API Key 保存 | 已保存 Key 留空并保存 → **删除** Key（不再「留空则不修改」） |

**从 v0.2 升级**：覆盖安装即可；已配置 Dify 四 Key 的用户可在设置中保持 **Dify Legacy** 引擎。详见 [07-MIGRATION-USER-GUIDE.md](./07-MIGRATION-USER-GUIDE.md)。

---

## 测试与质量

- **全流程手册**：[FULL-FLOW-TEST.md](./FULL-FLOW-TEST.md)
- `npm run test:local-nodes` — 四工作流 Code 节点
- `npm run test:chapter-client` — 章节输出与 memory_patch
- `npm run test:outline-local-e2e` — 可选真实 LLM 大纲 E2E

---

## 已知限制

- 助手 `generate_society` 仍引导至世界观向导（需地图领土数据）。
- 章节 Local 生成耗时取决于模型与章节长度。
- macOS 安装包暂未单独提供 `.icns`（Windows `.ico` / Linux `.png` 已配置）。

---

## 文档

- 用户手册：[docs/app/USER-GUIDE.md](../app/USER-GUIDE.md)
- 迁移指南：[07-MIGRATION-USER-GUIDE.md](./07-MIGRATION-USER-GUIDE.md)
- 第三方许可：[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)

---

## GitHub Release

维护者推送 tag 后 CI 自动打包：

```bash
git tag v1.0.0
git push origin v1.0.0
```

Release 正文取自本文件（见 `.github/workflows/release.yml`）。
