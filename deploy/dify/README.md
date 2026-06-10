# Dify 工作流部署（DSL 导入）

本目录包含 NovelsCreator **v0.2.0** 对应的四个 Workflow DSL，可从 Dify 控制台 **导入** 使用，无需按文档手动搭节点。

源码级资产（Prompt、Code 节点、Fixture）仍在仓库根目录 [`dify/`](../../dify/)。

---

## 1. 文件一览

| 文件 | 客户端设置项 | Dify 导入后应用名（参考） |
|------|--------------|---------------------------|
| [`workflows/novel-chapter-generation-v1.1.yml`](./workflows/novel-chapter-generation-v1.1.yml) | **章节生成** | NovelCreator |
| [`workflows/novel-outline-generation-v1.yml`](./workflows/novel-outline-generation-v1.yml) | **大纲生成** | novel-outline-generation-v1 |
| [`workflows/novel-knowledge-generation-v1.yml`](./workflows/novel-knowledge-generation-v1.yml) | **知识库生成** | Novel Knowledge Generation v1 |
| [`workflows/novel-world-society-v1.yml`](./workflows/novel-world-society-v1.yml) | **世界观社会层** | Novel World Society v1 |

> **地图**由客户端内置 **WorldEngine** 生成，**不需要** Dify 工作流。

---

## 2. 前置条件

- 已部署 [Dify](https://docs.dify.ai/)（自建 Docker 或 Dify Cloud）
- Dify 版本建议 ≥ 0.15，支持 Workflow DSL 导入
- 已在 Dify **设置 → 模型供应商** 中配置 LLM（DSL 中示例依赖 DeepSeek 插件，可导入后改绑其他模型）

---

## 3. 导入步骤（每个 yml 重复一次）

1. 登录 Dify 控制台  
2. **创建应用** → **导入 DSL**（或 **工作室 → 导入**）  
3. 选择 `deploy/dify/workflows/` 下对应 `.yml` 文件  
4. 导入完成后进入画布，检查 LLM 节点是否已绑定可用模型  
5. 点击 **发布**  
6. 进入 **访问 API**，复制 **API Key**（`app-xxxxxxxx`）  
7. 在 NovelsCreator **设置 → Dify** 填入对应槽位  

**Base URL**（自建常见）：

```text
http://127.0.0.1/v1
```

云端示例：

```text
https://api.dify.ai/v1
```

---

## 4. 客户端 Key 对照

| NovelsCreator 设置 | 填入的 Key 来源 |
|--------------------|-----------------|
| 章节生成 | 导入 `novel-chapter-generation-v1.1.yml` 后的应用 API Key |
| 大纲生成 | 导入 `novel-outline-generation-v1.yml` 后的应用 API Key |
| 知识库生成 | 导入 `novel-knowledge-generation-v1.yml` 后的应用 API Key |
| 世界观社会层 | 导入 `novel-world-society-v1.yml` 后的应用 API Key |

四个应用 **Key 不同**，须分别复制，勿混用。

---

## 5. 验证

1. NovelsCreator 设置中每个槽位点 **测试连接**  
2. 打开测试项目，试 **AI 生成大纲** 或 **生成一章**  

更详细的客户端操作见 [`docs/app/USER-GUIDE.md`](../../docs/app/USER-GUIDE.md) §3。

---

## 6. 升级与排错

- 升级 NovelsCreator 时，若 Release Notes 提到工作流变更，请重新导入对应 yml 并 **发布**  
- **400 错误**：对照 [`dify/chapter/fixtures/`](../../dify/chapter/fixtures/) 等检查 START 变量是否与客户端一致  
- 手动搭建参考：[`docs/DIFY-WORKFLOWS-INDEX.md`](../../docs/DIFY-WORKFLOWS-INDEX.md)

**勿将 `app-` API Key 提交到 Git。**
