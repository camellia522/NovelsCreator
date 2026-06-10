# 社会层工作流 · END 报错排查

## 报错：`Output end_outputs_ is missing`

表示 **END 节点** 声明了输出变量 `end_outputs_`，但上游没有任何节点提供该变量。

### 正确接法（推荐）

```
W2S → W2SX → END_OK → PARSE → END
```

| 节点 | 输出变量名 | 说明 |
|------|------------|------|
| **END_OK** | `end_outputs`（String） | 脚本 `world_society_end_success.py` 已同时返回 `end_outputs_` 兼容旧画布 |
| **PARSE** | 输入：`end_outputs` ← END_OK.`end_outputs` | 不要用空的 `ok_end_outputs` |
| **PARSE** | 输出：`status`、`society_json`、`nations_json`、`locations_json`、`world_rules` | 均为 String |
| **END** | 只映射 PARSE 的 5 个字段 | **不要**在 END 再声明 `end_outputs` / `end_outputs_` |

### END 节点应配置的输出（二选一命名均可）

**方案 A（与 PARSE 一致，推荐）**

| END 输出名 | 来源 |
|------------|------|
| `status` | PARSE.status |
| `society_json` | PARSE.society_json |
| `nations_json` | PARSE.nations_json |
| `locations_json` | PARSE.locations_json |
| `world_rules` | PARSE.world_rules |

**方案 B（你当前 Dify 带 String 后缀）**

| END 输出名 | 来源 |
|------------|------|
| `statusString` | PARSE.status |
| `society_jsonString` | PARSE.society_json |
| … | … |

客户端已兼容 `society_json` 与 `society_jsonString`。

### 若 END 仍保留 `end_outputs_`

1. 删除 END 上的 `end_outputs_` 输出项（推荐），或  
2. 把 `end_outputs_` 映射到 **END_OK.end_outputs_**（更新后的脚本会提供），**不要**映射到 PARSE。

### END_OK 节点检查

- **输入**必须接 **W2SX 的 4 个输出**（不能手写 `[]`；若 END_OK 输入已是 `nations:[] locations:[]`，见 [DIFY-END_OK-EMPTY-INPUT.md](./DIFY-END_OK-EMPTY-INPUT.md) 先修 W2S/W2SX）
- `workflow_version` 填常量 `world-society-v1`

### W2SX 节点检查（END_OK 为空时先看这里）

- 代码：`dify/world/code/world_s2_extract.py`
- `w2s_json` 或 `text` ← **W2S.text**；或 `structured_output` ← **W2S.structured_output**
- 预览 W2SX：`locations_json` 长度应 ≫ 2
- **输出变量**在 Dify 里**只**登记：`end_outputs`、`end_outputs_`（类型 String）。**不要**把 `society_json` 登记为 END_OK 的输出（会报 *Not all output parameters are validated*，见 [DIFY-END_OK-NOT-VALIDATED.md](./DIFY-END_OK-NOT-VALIDATED.md)）
- 代码文件：`dify/world/code/world_society_end_success.py`

### 试运行 inputs

完整样例见 `dify/world/fixtures/society-run.sample.json`（须含 `territory_json`、`nations_outline_json`、`creative_brief`）。
