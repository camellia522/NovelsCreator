# 大纲工作流试运行 · novel-outline-generation-v1

> 用于 Dify 画布 **运行 → 从 Markdown 导入**，或按章节复制到 START 各输入框。  
> 对应 JSON：[`outline-run.sample.json`](./outline-run.sample.json)  
> 工作流：`Novel Outline Generation v1`（START → O1 → O1X → O2 → AGG → … → PARSE → END）

**通过标准（success 路径）**

| 检查项 | 期望 |
|--------|------|
| END `status` | `success` |
| END `outline_json` | 可解析 JSON，**单章模式**含 1 章（id=`next_chapter_id`） |
| END `outline_summary` | 非空，单章模式约 50–150 字 |
| 每章 beats | 3–8 条，id 为 `ch-001` 格式 |
| END `workflow_version` | `novel-outline-generation-v1` |

**若 status=retry**：属 O2 校验未通过，检查 END 的 `retry_issues_formatted`；客户端应带上 `retry_count` 与驳回清单再 POST（见文末 **重试用例**）。

---

## project_id

```text
550e8400-e29b-41d4-a716-446655440001
```

## knowledge_snapshot

```json
{
  "world": {
    "title": "平京异闻",
    "rules": "灵气复苏后妖物隐匿都市；主角不可飞行；皇室与宗门有旧盟约",
    "era": "现代都市",
    "atmosphere": "悬疑紧张",
    "scene": "都市",
    "scenePlace": "平京"
  },
  "nations": [
    {
      "id": "nation-001",
      "name": "大周",
      "government": "君主立宪",
      "culture": "礼法并重",
      "description": "都城平京"
    }
  ],
  "locations": [
    {
      "id": "loc-001",
      "name": "平京",
      "type": "capital",
      "x": 50,
      "y": 48,
      "terrain": "plain",
      "climate": "temperate",
      "description": "故事主舞台"
    }
  ],
  "regions": [],
  "characters": [
    {
      "id": "char-001",
      "name": "林渊",
      "traits": ["冷静", "观察力强"],
      "relationships": [],
      "bio": "档案员，偶然接触密信"
    }
  ],
  "factions": [
    {
      "id": "fac-001",
      "name": "天机阁",
      "description": "掌握古卷的组织"
    }
  ],
  "items": []
}
```

## plot_memory

```json
{
  "version": 1,
  "globalSummary": "",
  "chapterSummaries": [],
  "foreshadowing": []
}
```

## outline_brief

```text
第一卷聚焦林渊调查密信，逐步揭开皇室与宗门旧盟；每章留一个小悬念。
```

## target_volumes

```text
1
```

## target_chapters

```text
1
```

## genre

```text
都市悬疑
```

## tone

```text
紧张
```

## volume_id

```text
vol-01
```

## next_chapter_id

```text
ch-001
```

## generation_mode

```text
single_chapter
```

## existing_volume_outline

```json
{"id":"vol-01","title":"第一卷","chapters":[]}
```

## max_retry

```text
3
```

## retry_count

```text
0
```

## retry_issues_formatted

```text

```

---

## 附录 A · 单行 JSON（部分 Dify 版本仅支持单行粘贴）

**knowledge_snapshot（压缩一行，复制到开始节点）：**

```text
{"world":{"title":"平京异闻","rules":"灵气复苏后妖物隐匿都市；主角不可飞行；皇室与宗门有旧盟约","era":"现代都市","atmosphere":"悬疑紧张","scene":"都市","scenePlace":"平京"},"nations":[{"id":"nation-001","name":"大周","government":"君主立宪","culture":"礼法并重","description":"都城平京"}],"locations":[{"id":"loc-001","name":"平京","type":"capital","x":50,"y":48,"terrain":"plain","climate":"temperate","description":"故事主舞台"}],"regions":[],"characters":[{"id":"char-001","name":"林渊","traits":["冷静","观察力强"],"relationships":[],"bio":"档案员，偶然接触密信"}],"factions":[{"id":"fac-001","name":"天机阁","description":"掌握古卷的组织"}],"items":[]}
```

**plot_memory（压缩一行）：**

```text
{"version":1,"globalSummary":"","chapterSummaries":[],"foreshadowing":[]}
```

---

## 附录 B · 重试路径测试（status=retry）

首次 run 若 O2 驳回，用上一轮 END 输出更新 START 后 **再运行一次**：

| 变量 | 值 |
|------|-----|
| retry_count | 上轮 END 的 `retry_count`（通常为 `1`） |
| retry_issues_formatted | 上轮 END 的 `retry_issues_formatted` 原文 |

示例 `retry_issues_formatted`：

```text
- [hard] ch-002: 节拍 2 与 ch-001 重复，无新事件
- [warn] global: 第 3 章 beats 少于 3 条
```

其余字段与上文 **首次试运行** 相同（`knowledge_snapshot`、`target_chapters` 等不变）。

**期望**：第二轮 END `status` 为 `success` 或再次 `retry`（未超 max_retry）；**不应**出现画布内 IF → O1 回连。

---

## 附录 C · PowerShell API 联调

```powershell
$env:DIFY_BASE_URL = "http://127.0.0.1/v1"
$env:DIFY_API_KEY = "app-xxxxxxxx"
.\scripts\test-dify-outline.ps1
```

---

## 附录 D · 常见失败对照

| 现象 | 排查 |
|------|------|
| `unexpected keyword argument 'outline_brief'` | 画布上用了章节 **P0**（`p0_context_merge.py`）。**删除 P0** 改 START→O1；或换 `outline_p0_context_merge.py` |
| O2 输入全空 / validate_result 只有 `` | **O2 User 变量未绑定**（见下方 §O2 绑定清单） |
| AGG `Not all output parameters are validated` | 输出只保留 6 项；`outline_valid` 类型选 **Boolean**；删除章节版多余输出变量 |
| AGG `retry_count is not a number` | Dify 中 `retry_count` 输出类型选 **Number** |
| PARSE `circuit_break must be a string, got bool` | 粘贴最新 `outline_parse_end_outputs.py`；`circuit_break` 输出类型选 **String** |
| PARSE 仍是 `def main(arg1, arg2)` | 未替换代码，须整文件粘贴 `outline_parse_end_outputs.py` |
| END `status` 为空 | RE/CB/END_OK 须经 **PARSE**，勿直连 END |
| `outline_json` 为空 | O1X 是否连接；O1 Structured Output Schema 是否配置 |
| O1X「占位声明、无章节结构」 | O1X 增加 **structured_output ← O1.structured_output**；O1 模型设置**关闭 Reasoning/思考** |
| O1 输出 `<think>` 无 JSON | O1 节点关闭思考链；开启 Structured Output；粘贴最新 O1X |
| 400 Bad Request | START 变量名是否与文档一致（全文本类型） |
| 长时间无响应 | 模型慢或 target_chapters 过大；检查 Dify 日志 |
| 402 | 模型供应商余额不足 |
| O2 单章模式仍判 plot_memory 吃书 | O2 System/User 未更新；User 未绑定 `generation_mode` / `existing_volume_outline`；O2 仍用旧「记忆承接」全书规则 |
| O1 自造艾伦/魔法等与 knowledge 不符 | 更新 O1 System；确认 `outline_brief` 含设定锚点；检查 knowledge_snapshot 非空 |

文档：[DIFY-OUTLINE-WORKFLOW-NODES-AND-FLOW.md](../../../docs/outline/DIFY-OUTLINE-WORKFLOW-NODES-AND-FLOW.md)

---

## 附录 E · O1 / O2 / AGG 绑定清单

### O1 LLM（User 须开 Jinja）

| User 变量 | 绑定来源 |
|-----------|----------|
| knowledge_snapshot | **开始 → knowledge_snapshot**（有 P0 可改 **P0 → knowledge_snapshot**） |
| plot_memory | **开始 → plot_memory** 或 P0 → plot_memory |
| outline_brief | **开始 → outline_brief** 或 P0 → outline_brief |
| target_volumes | **开始 → target_volumes** |
| target_chapters | **开始 → target_chapters** |
| genre | **开始 → genre** |
| tone | **开始 → tone** |
| retry_issues_formatted | **开始 → retry_issues_formatted** |
| generation_mode | **开始 → generation_mode** |
| volume_id | **开始 → volume_id** |
| next_chapter_id | **开始 → next_chapter_id** |
| existing_volume_outline | **开始 → existing_volume_outline** |

O1.text 连 **O1X → o1_result**；若 O1 开 Structured Output，**务必**再连 **O1.structured_output → O1X.structured_output**（否则 text 可能只有占位说明、无 volumes）。

预览 O1 User：单章模式应出现 `generation_mode=single_chapter` 与 `existing_volume_outline` 块。

### O1X Code

| 输入 | 来源 |
|------|------|
| o1_result | **O1 → text** |
| structured_output | **O1 → structured_output**（Structured Output 开启时必填） |

| 输出 | Dify 类型 |
|------|-----------|
| outline_summary | String |
| outline_json | String |

**勿**声明 `parse_ok`、`chapter_count`（脚本只返回上表 2 项；多声明会报 `Not all output parameters are validated`）。详见 [`DIFY-CODE-NODE-OUTPUTS.md`](../DIFY-CODE-NODE-OUTPUTS.md)。

代码：`outline_o1_extract.py`

### O2 LLM（User 须开 Jinja）

| User 变量 | 绑定来源 |
|-----------|----------|
| outline_json | **O1X → outline_json** |
| knowledge_snapshot | **开始 → knowledge_snapshot** |
| plot_memory | **开始 → plot_memory** |
| target_volumes | **开始 → target_volumes** |
| target_chapters | **开始 → target_chapters** |
| generation_mode | **开始 → generation_mode** |
| volume_id | **开始 → volume_id** |
| next_chapter_id | **开始 → next_chapter_id** |
| existing_volume_outline | **开始 → existing_volume_outline** |

O2 **System**：`o2-outline-validate.md` · Structured Output · temperature **0.2**

**Structured Output 必须粘贴** [`o2-outline-validate.dify-schema.json`](../mcp/schemas/o2-outline-validate.dify-schema.json)（勿用 Dify 默认 `John Doe / age: 30` 示例）。成功后 `structured_output` 应含 `outline_valid`、`outline_issues`，而不是 name/age。

若模型仍输出 `redacted_thinking`：在模型设置中关闭「思考/Reasoning」；AGG 绑定 **O2 → text**（不是 structured_output）。

### AGG Code

| 输入 | 来源 |
|------|------|
| validate_result | **O2 → text** |
| retry_count | **开始 → retry_count** |
| max_retry | **开始 → max_retry** |
| outline_json | **O1X → outline_json** |

| 输出 | Dify 类型 |
|------|-----------|
| route | String |
| retry_count | **Number** |
| retry_issues_formatted | String |
| outline_valid | **Boolean**（勿选 String） |
| validation_report | String |
| outline_json | String |

**删除**章节 AGG 遗留的输出变量（如 `lore_valid`、`retry_issues`、`merged_issues_for_polish`），只保留上表 6 项。

代码：`outline_agg_validation.py`（`outline_valid` 返回 bool，`retry_count` 返回 int）
