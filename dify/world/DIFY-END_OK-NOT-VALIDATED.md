# END_OK：Not all output parameters are validated + 数据处理 `{}`

## 你当前截图含义

- **输入**里只有 **`society_json` 一个键**（里面有 `world_rules` 长文案，说明 W2S 已部分成功）
- **数据处理**显示 **`{}`**
- 顶部红条：**Not all output parameters are validated**

这是两件不同的事：

| 现象 | 原因 |
|------|------|
| 红条 validated | END_OK 代码节点的 **「输出变量」登记** 与脚本 `return` 不一致 |
| 下游仍可能没城 | 只接了 `society_json`，且其中 **`locations` 为空**；或未接 W2SX 的 `locations_json` |

---

## 输入显示 `null`（你最新截图）

表示 **单独运行 END_OK** 或 **上游未执行**，四路 W2SX 变量没有传进来。

- 请从 **开始节点** 整链运行，不要只点 END_OK 的「运行」  
- 或确认 W2SX → END_OK 四条线仍在（society_json / world_rules / nations_json / locations_json）

新版 `world_society_end_success.py` 在输入为 null 时仍会返回 `end_outputs` 字符串（`status: error` + 中文说明），避免 Dify 报空 `{}`。

---

## 一、先修 END_OK 输出变量（消除红条 `{}`）

脚本 `world_society_end_success.py` **只返回 2 个键**：

```python
return {
  "end_outputs": "<JSON 字符串>",
  "end_outputs_": "<同上>"
}
```

在 Dify **END_OK 代码节点 → 输出变量** 中：

1. **删除** 误加的 `society_json`、`nations_json`、`locations_json`、`status` 等（这些是 **输入** 或 PARSE/END 的字段，不是 END_OK 的输出）
2. **只保留**（类型均为 **String / 文本**）：

| 输出变量名 | 类型 |
|------------|------|
| `end_outputs` | String |
| `end_outputs_` | String |

3. 保存后重新试运行，**数据处理**应出现 `end_outputs` 长字符串，而不是 `{}`。

---

## 二、再修 END_OK 输入（要有 8 座城）

不能只绑一根线。END_OK **输入** 建议 **5 项全绑 W2SX**：

| END_OK 入参 | 绑定 |
|-------------|------|
| `society_json` | W2SX.society_json |
| `world_rules` | W2SX.world_rules |
| `nations_json` | W2SX.nations_json |
| `locations_json` | W2SX.locations_json |
| `workflow_version` | 常量 `world-society-v1` |

试运行前点开 **W2SX**：

- `locations_json` 长度应 **远大于 2**（8 城时通常上千字符）

若 W2SX 的 `locations_json` 已是 8 城，但 END_OK 只绑了 `society_json`，且该字符串里 **没有 locations 数组** → 必须在 END_OK 上 **补上 `locations_json` ← W2SX.locations_json`**。

脚本已更新：当 `society_json` 里 `locations` 为空时，会 **优先采用** 入参 `locations_json` 的内容。

---

## 三、PARSE → END（不变）

| PARSE 入参 | END_OK.end_outputs |
| END 输出 | PARSE 的 5 个 String 字段（含 `locations_jsonString`） |

---

## 四、自检顺序

```text
W2S  structured_output.locations.length === 8
  ↓
W2SX locations_json 非 []
  ↓
END_OK 输入 4 项 + society_json，输出 end_outputs 有字
  ↓
PARSE → END  locations_jsonString 非 []
```

---

## 五、若只有 world_rules、没有 locations

说明 **W2S** 仍把内容写进 `world_rules`，而 `locations` 数组为空或条数不足 → 回到 [DIFY-W2S-EMPTY-INPUTS.md](./DIFY-W2S-EMPTY-INPUTS.md) 检查 `territory_json` 是否含 loc-001…008，以及 `city_count` 与 `local_location_count` 是否都为 8。
