# v1.0 验收标准

> **可执行测试步骤**：见 [FULL-FLOW-TEST.md](./FULL-FLOW-TEST.md)（自动化门禁 §2 + GUI 主路径 §3～§6）。

## 1. 发布门槛（必须全部满足）

### 1.1 安装与配置

- [ ] Release 安装包（Win x64 至少）可安装启动  
- [ ] 内置 WorldEngine 地图生成可用  
- [ ] **默认 Local 引擎**：仅填 API Key + 模型名即可完成「测试连接」  
- [x] 首次启动向导（或设置）在 5 步内完成 AI 配置  
- [x] Dify 高级模式可切换且四条 Key 仍可用  

### 1.2 四条生成管线（Local）

对同一项目，Local 引擎可完成：

- [ ] AI 生成知识库 → 合并设定  
- [ ] AI 生成大纲（单章 / 多章模式之一）  
- [ ] 三要素向导 / 快速生成章节 → 正文 + 视频稿落盘  
- [ ] 世界观社会层（领土已绘）  
- [ ] 熔断 / retry 行为与 v0.x UX 一致（弹窗、可重试）  

### 1.3 契约与测试

- [ ] `npm run test:chapter-client` 等 client flow 通过（mock local runner）  
- [ ] 至少一条 `test:*-local-e2e` 对真实 API 可选通过  
- [ ] 四条 workflow 各有 fixture 对比：**输出 JSON 字段齐全**（与 `dify/mcp/schemas` 一致）  

### 1.4 小说助手 MVP（Deep Agents Harness）

- [x] `createDeepAgent` 实例化成功，无默认磁盘 FS 越权  
- [x] Activity Bar 可打开助手面板；支持流式或完整回复  
- [ ] 只读问答：设定 / 大纲 / 记忆至少各 1 用例通过  
- [x] `generate_chapter` 走 HITL，确认后与菜单生成一致  
- [x] thread checkpointer 可恢复对话；可清空；**transcript 落盘按项目持久化**  
- [x] 未配置 Key 时有明确中文提示  

### 1.5 文档与合规

- [x] `docs/app/USER-GUIDE.md` 含 v1.0 默认配置路径  
- [x] 关于页：版权 + WorldEngine 致谢  
- [x] `07-MIGRATION-USER-GUIDE.md` 链接入 Release Notes  
- [x] THIRD_PARTY_NOTICES（LangChain、WorldEngine 等）随仓库或安装包  

### 1.6 非回归

- [ ] 新建 / 打开 / 删除项目  
- [ ] 备份 / 恢复  
- [ ] 全本导出  
- [ ] 主题 / 设置持久化  

---

## 2. 建议指标（不阻塞首发）

| 指标 | 目标 |
|------|------|
| Local 章节生成 P95 耗时 | ≤ Dify 同环境 *1.2* |
| 安装包体积增幅 | ≤ +80MB（相对 v0.2） |
| 助手单轮回复 | ≤ 30s（视模型） |

---

## 3. 版本标记

- [x] `package.json`：`1.0.0`  
- [x] `APP_VERSION` / 关于页一致  
- [ ] Git tag：`v1.0.0`（推送后触发 Release CI）  
- [ ] GitHub Release：`v1.0.0` 正式版（非 beta）  

---

## 4. 签 off 角色

| 角色 | 检查项 |
|------|--------|
| 产品 | 愿景 §01、助手 MVP 范围 |
| 开发 | §05 替换完成、CI 绿 |
| 测试 | §1.2～1.4 手工清单 |
| 文档 | USER-GUIDE + deploy/dify legacy 说明 |
