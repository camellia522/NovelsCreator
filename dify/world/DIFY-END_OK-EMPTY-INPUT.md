# END_OK 输入全是空数组 — 排查（与你截图一致）

## 现象

END_OK **输入**为：

```json
{
  "society_json": "{\"world_rules\": \"\", \"nations\": [], \"locations\": []}",
  "world_rules": "",
  "nations_json": "[]",
  "locations_json": "[]"
}
```

**数据处理**输出 `{}`，并提示 *Not all output parameters are validated*。

说明：**END_OK 本身没错，上游 W2SX（或 W2S）没有产出内容**。  
PARSE → 输出（String 后缀）绑定再正确，也只能传出空 `[]`。

---

## 正确链路（必须 6 段都有数据）

```text
START → W2S(LLM) → W2SX(代码) → END_OK(代码) → PARSE(代码) → END(输出)
         ↑ 先查这里
```

| 步骤 | 节点 | 你要看到的 |
|------|------|------------|
| 1 | **W2S** | 有 `text` 或 `structured_output`，内含 `locations` 数组（本批 8 条） |
| 2 | **W2SX** | 输出 `locations_json` **长度很大**（不是 `[]`） |
| 3 | **END_OK** | 输入 `locations_json` 与 W2SX 一致，非空 |
| 4 | **PARSE** | 输入 `end_outputs` ← END_OK.`end_outputs` |
| 5 | **END** | `locations_jsonString` 等有内容 |

---

## 修复清单（按顺序做）

### ① W2S 节点

- [ ] 开启 **结构化输出 / JSON Schema**（`dify/world/mcp/schemas/w2s-structured-output.schema.json`）
- [ ] 开启 **Jinja2**，User 用 `dify/world/prompts/w2s-user.jinja.md`
- [ ] System 用 `dify/world/prompts/w2-territory-society.md` 正文
- [ ] **Max tokens ≥ 8192**
- [ ] 试运行后点开 **W2S**，确认 `locations` 非空

### ② W2SX 节点（最常见断点）

- [ ] 代码文件：`dify/world/code/world_s2_extract.py`（用仓库最新版，支持 `structured_output`）
- [ ] **输入绑定（二选一，不要留空）**：

| W2SX 入参 | 绑定到 |
|-----------|--------|
| `w2s_json` | **W2S.`text`**（整段 JSON 字符串） |
| 或 `structured_output` | **W2S.`structured_output`**（若 Dify 显示为对象） |
| 或 `text` | **W2S.`text`**（与 w2s_json 等价） |

- [ ] **不要**绑到未赋值的常量、不要绑 END 回路线
- [ ] 运行 W2SX 单独预览：`locations_json` 应有 8 条 id

### ③ END_OK 节点

- [ ] 代码：`dify/world/code/world_society_end_success.py`
- [ ] 四个入参 **全部来自 W2SX**：

| END_OK 入参 | 来源 |
|-------------|------|
| society_json | W2SX.society_json |
| world_rules | W2SX.world_rules |
| nations_json | W2SX.nations_json |
| locations_json | W2SX.locations_json |
| workflow_version | 常量 `world-society-v1` |

- [ ] **禁止**手写 `[]` 或默认空字符串占位

### ④ PARSE → END

见 [DIFY-END-NODE-CHECKLIST.md](./DIFY-END-NODE-CHECKLIST.md)。

---

## 与客户端测试的对应关系

| 情况 | 本地测试 |
|------|----------|
| END 有 8 城 String 后缀 | `npm run test:society-fixtures` → parse-string-suffix **通过** |
| END 只有 `[]`（你截图） | `w2s-end-empty-string-suffix.json` **应失败**（与线上一致） |

客户端 **无法**修复 W2S 空输出；须在 Dify 把 **W2S → W2SX** 接好后再试运行。

---

## 试运行 inputs

Markdown：`dify/world/fixtures/society-run-batch8.sample.md`  
单行 JSON：见该文件 **附录**。
