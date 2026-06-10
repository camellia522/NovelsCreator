# 知识库生成工作流资产

**workflow_id**: `novel-knowledge-generation-v1`

## 搭建文档

逐步在 Dify 画布搭建：**[docs/knowledge/DIFY-KNOWLEDGE-WORKFLOW-IMPLEMENTATION.md](../../docs/knowledge/DIFY-KNOWLEDGE-WORKFLOW-IMPLEMENTATION.md)**

画布清单：[`mcp/resources/knowledge-generation-v1-manifest.json`](./mcp/resources/knowledge-generation-v1-manifest.json)  
MCP Tool：[`mcp/tools/novels_knowledge_generate.json`](./mcp/tools/novels_knowledge_generate.json)

本地 Code 自检：`python scripts/test-knowledge-code-nodes.py`

## 客户端对接

- IPC：`dify:generateKnowledge`
- UI：设定侧栏 **AI 生成知识库** · 菜单 **生成 → AI 生成知识库**
- 设置：Dify → **知识库生成** 独立 API Key
- **创作 brief 写作指南**：[`docs/knowledge/KNOWLEDGE-BRIEF-GUIDE.md`](../../docs/knowledge/KNOWLEDGE-BRIEF-GUIDE.md)

## START 变量（建议全部 String）

| 变量 | 必填 | 说明 |
|------|------|------|
| project_id | ✓ | 项目 UUID |
| knowledge_brief | ✓ | 用户创作 brief |
| existing_knowledge_snapshot | ✓ | 客户端轻量 JSON 快照 |
| genre / tone / era / scene | | 来自 world 设定 |
| generation_mode | ✓ | `expand` \| `bootstrap` |
| max_retry | ✓ | 默认 3 |
| retry_count | | 客户端重试轮次 |
| retry_issues_formatted | | K2 驳回清单 |

## END 输出（PARSE 扁平化）

| 字段 | 说明 |
|------|------|
| status | success \| retry \| circuit_break \| error |
| knowledge_summary | 摘要 |
| knowledge_json | `{ world, characters[], factions[], items[] }` |
| validation_report | JSON 串 |
| retry_issues_formatted | 供下轮修订 |

## 画布建议（简版）

```text
START → K1 LLM → K1X Code → K2 校验 LLM → AGG → IF
  ├─ retry → RE → PARSE → END
  ├─ circuit_break → CB → PARSE → END
  └─ continue → END_OK → PARSE → END
```

客户端在 `status=retry` 时递增 `retry_count` 并再次 POST（与大纲/章节一致）。

## 试运行

- Markdown 导入（推荐）：[`fixtures/knowledge-run.sample.md`](./fixtures/knowledge-run.sample.md)
- JSON：[`fixtures/knowledge-run.sample.json`](./fixtures/knowledge-run.sample.json)

重新生成 Markdown：`npm run gen:dify-inputs-md -- knowledge-run.sample.json --knowledge`

## 注意

- **不生成** map / locations / nations（地图与社会层走 WorldEngine + `novel-world-society-v1`）
- 合并策略见 `src/utils/knowledge-dify-merge.ts`
