# 世界观 Dify 资产

**当前客户端**

| 阶段 | 实现 |
|------|------|
| 地图 + 卫星图 | **WorldEngine**（`scripts/worldengine_generate.py`）— 见 [docs/world/WORLDENGINE.md](../../docs/world/WORLDENGINE.md) |
| 国家/城市（领土已绘） | **Dify** `novel-world-society-v1` — 见 [docs/world/w2-society/](../../docs/world/w2-society/) |

---

## 活跃资产（社会层）

| 路径 | 说明 |
|------|------|
| [`prompts/w2-territory-society.md`](./prompts/w2-territory-society.md) | W2S LLM Prompt |
| [`code/world_s2_extract.py`](./code/world_s2_extract.py) | W2SX 解析 |
| [`code/world_society_end_success.py`](./code/world_society_end_success.py) | END_OK |
| [`code/world_society_parse_end_outputs.py`](./code/world_society_parse_end_outputs.py) | PARSE |
| [`mcp/schemas/world-society-generate.*.json`](./mcp/schemas/) | 社会层 IO Schema |
| [`mcp/tools/novels_world_society_generate.json`](./mcp/tools/novels_world_society_generate.json) | MCP Tool |
| [`fixtures/society-run.sample.json`](./fixtures/society-run.sample.json) | Dify 试运行样例 |
| [`prompts/w2s-user.jinja.md`](./prompts/w2s-user.jinja.md) | W2S User Jinja |

---

## 历史资产（地图 Dify 工作流，已废弃）

以下文件仍留在仓库，**客户端不再调用** `world:generate` / MCP `novels_world_generate`：

- `prompts/w1-world-generate.md`
- `code/world_w1_extract.py`、`world_w2_comfyui_bridge.py`、`world_end_success.py`、`world_parse_end_outputs.py`
- `mcp/schemas/world-generate.*.json`、`mcp/tools/novels_world_generate.json`
- `comfyui/`

相关文档已从 `docs/world/` 删除。

**搭建社会层工作流** → [docs/world/w2-society/DIFY-WORKFLOW-IMPLEMENTATION.md](../../docs/world/w2-society/DIFY-WORKFLOW-IMPLEMENTATION.md)
