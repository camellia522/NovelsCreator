# 章节工作流资产

**workflow_id**: `novel-chapter-generation-v1.1` · **MCP Tool**: `novels_chapter_generate`

| 子目录 | 说明 |
|--------|------|
| [`code/`](./code/) | P0、AGG、END_OK、PARSE、N4B-MUX 等 Code 节点 |
| [`prompts/`](./prompts/) | N1–N5 LLM Prompt（含 `_global-system.md`） |
| [`mcp/schemas/`](./mcp/schemas/) | 输入/输出 Schema、视频模板 Schema |
| [`mcp/tools/`](./mcp/tools/) | `novel_chapter_generate.json` |
| [`mcp/resources/`](./mcp/resources/) | Workflow Manifest |
| [`fixtures/`](./fixtures/) | 联调样例 |

重试相关 Code 在 [`../shared/code/`](../shared/code/)（`retry_end.py`、`cb_circuit_break.py`）。

文档：[DIFY-WORKFLOW-DESIGN.md](../../docs/chapter/DIFY-WORKFLOW-DESIGN.md)
