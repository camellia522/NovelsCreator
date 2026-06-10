# 知识库工作流试运行 · novel-knowledge-generation-v1

> 用于 Dify 画布 **运行 → 从 Markdown 导入**，或按章节复制到 START 各输入框。  
> 对应 JSON：[`knowledge-run.sample.json`](./knowledge-run.sample.json)  
> 工作流：`Novel Knowledge Generation v1`（START → K1 → K1X → K2 → AGG → … → PARSE → END）

**通过标准（success 路径）**

| 检查项 | 期望 |
|--------|------|
| END `status` | `success` |
| END `knowledge_json` | 可解析 JSON，含 `world` / `characters` / `factions` / `items` |
| END `knowledge_summary` | 非空，约 150–400 字 |
| `world.rules` | ≥80 字硬性设定 |
| `characters` | ≥3 名具名角色（含 brief 主角「周衍」） |
| END `workflow_version` | `novel-knowledge-generation-v1` |

**若 status=retry**：K2 校验未通过，查看 END 的 `retry_issues_formatted`；客户端应递增 `retry_count` 并带上驳回清单再 POST（见文末 **重试用例**）。

**注意**：本工作流 **不输出** map / locations / nations。

---

## project_id

```text
00000000-0000-4000-8000-000000000001
```

## knowledge_brief

```text
架空史诗大陆，主角周衍为边关斥候。需要：4 个主要国家背景（不必写地图坐标）、6 名核心角色（含 1 反派）、2 个秘密势力、3 件关键道具。冷兵器、低魔、权谋+战争。
```

## existing_knowledge_snapshot

```json
{
  "world": {
    "title": "NewWorld",
    "rules": ""
  },
  "nations": [],
  "locations": [],
  "regions": [],
  "characters": [],
  "factions": [],
  "items": []
}
```

## genre

```text
史诗（架空）
```

## tone

```text
史诗
```

## era

```text
架空
```

## scene

```text
大陆
```

## generation_mode

```text
bootstrap
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

## 重试用例（status=retry 后第二轮）

将 `retry_count` 改为 `1`，并填入上一轮 END 的 `retry_issues_formatted` 示例：

## retry_count

```text
1
```

## retry_issues_formatted

```text
- [hard] char-001: brief 要求主角「周衍」，输出中未出现
- [hard] world: rules 少于 80 字，缺少力量体系与叙事禁忌
```

其余字段与上文 **bootstrap 首轮** 相同。

---

## 节点速查（调试卡壳时）

### K1 LLM

| 配置 | 值 |
|------|-----|
| System | `prompts/k1-knowledge-generate.md` → System 正文 |
| User | `prompts/k1-knowledge-user.jinja.md`（**开 Jinja**） |
| Structured Output | `mcp/schemas/k1-knowledge.output.json` |
| temperature | **0.75** |

User 绑定：`retry_issues_formatted`, `knowledge_brief`, `existing_knowledge_snapshot`, `generation_mode`, `genre`, `tone`, `era`, `scene` ← **START**

### K1X Code

| 输入 | 来源 |
|------|------|
| k1_result | **K1 → text** |
| structured_output | **K1 → structured_output** |

| 输出 | 说明 |
|------|------|
| knowledge_summary | String |
| knowledge_json | String（仅 world/characters/factions/items） |

### K2 LLM

| 配置 | 值 |
|------|-----|
| System | `prompts/k2-knowledge-validate.md` → System 正文 |
| User | `prompts/k2-knowledge-user.jinja.md` |
| Structured Output | `mcp/schemas/k2-knowledge-validate.output.json` |
| temperature | **0.2** |

User 绑定：`knowledge_json`, `knowledge_summary` ← **K1X**；其余 ← **START**

### AGG Code

| 输入 | 来源 |
|------|------|
| validate_result | **K2 → text** |
| retry_count | **开始 → retry_count** |
| max_retry | **开始 → max_retry** |
| knowledge_json | **K1X → knowledge_json** |

代码：`knowledge_agg_validation.py`

完整步骤：[`docs/knowledge/DIFY-KNOWLEDGE-WORKFLOW-IMPLEMENTATION.md`](../../../docs/knowledge/DIFY-KNOWLEDGE-WORKFLOW-IMPLEMENTATION.md)
