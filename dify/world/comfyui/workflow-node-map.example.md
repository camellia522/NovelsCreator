# Dify ↔ ComfyUI 节点字段对照（示例）

在 Dify ComfyUI **Workflow** 工具节点里，把下列变量映射到导出 JSON 中对应节点的 `inputs`（节点 ID 以你本机导出的 API JSON 为准）。

| Dify 变量来源 | 建议映射到 ComfyUI | 说明 |
|---------------|-------------------|------|
| `W1X / map_image_prompt` | `CLIPTextEncode` → `text`（正向） | 英文地图 prompt |
| 固定负面 prompt | `CLIPTextEncode` → `text`（负向） | 见 SETUP 文档 §4.3 |
| `开始 / seed` | `KSampler` → `seed` | 整数；字符串需在 Code 中转 int |
| — | `EmptyLatentImage` → `width` | **1536**（2:1 宽） |
| — | `EmptyLatentImage` → `height` | **768** |

导出 JSON 后，在 Dify 插件 UI 中逐项勾选/填写映射；**不要**手改 JSON 里的节点 ID，除非你知道对应关系。
