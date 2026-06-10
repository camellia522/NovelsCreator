# 大纲工作流资产



**workflow_id**: `novel-outline-generation-v1` · **MCP Tool**: `novels_outline_generate`



## 快速搭建（Dify 画布）



1. 新建 Workflow 应用 → 按 [`outline-generation-v1-manifest.json`](./mcp/resources/outline-generation-v1-manifest.json) 连线  

2. 逐步复制 `prompts/`、`code/` 到对应节点  

3. 试运行 [`fixtures/outline-run.sample.json`](./fixtures/outline-run.sample.json)  

4. 发布 → 将 API Key 填入 NovelsCreator **设置 → Dify → 大纲生成**



详细步骤：[DIFY-OUTLINE-WORKFLOW-IMPLEMENTATION.md](../../docs/outline/DIFY-OUTLINE-WORKFLOW-IMPLEMENTATION.md)



## 目录



| 子目录 | 说明 |

|--------|------|

| [`code/`](./code/) | O1X、AGG、RE、CB、END_OK、PARSE |

| [`prompts/`](./prompts/) | O1/O2 System（`o1-outline-generate.md` 等）+ User Jinja |

| [`fixtures/`](./fixtures/) | Dify 试运行 JSON |

| [`mcp/schemas/`](./mcp/schemas/) | 输入/输出 + O1/O2 结构化 Schema |

| [`mcp/resources/`](./mcp/resources/) | Workflow Manifest |



## 本地自检



```bash

python scripts/test-outline-code-nodes.py

```



## 联调



```powershell

$env:DIFY_API_KEY = "app-xxxxxxxx"

.\scripts\test-dify-outline.ps1

```



**勿**使用章节版 `retry_end.py` / `parse_end_outputs.py`（字段契约不同）。


