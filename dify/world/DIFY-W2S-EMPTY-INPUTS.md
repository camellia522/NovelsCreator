# W2S 输出空 JSON 的根因（与你提供的 LLM 日志一致）

## 现象

W2S 的 `structured_output` 为：

```json
{ "world_rules": "", "nations": [], "locations": [] }
```

`text` 里模型 **思考过程** 写明：

- `generation_mode=`、`world_name=`、`era=` 等 **全是空**
- `nations_outline_json` **空**
- `territory_json` **空**
- `local_location_count` **空**

因此模型「合法地」返回空数组，END_OK / PARSE / END 只能传递 `[]`。

**这不是 END 绑定错误，而是 W2S 没有收到领土数据。**

---

## 必做：W2S 节点绑定「开始」变量

在 Dify 打开 **W2S → User 提示词（Jinja）**，确认每个 `{{ 变量 }}` 在节点输入里映射到 **开始** 同名项：

| Jinja 变量 | 开始节点字段 | 不能为空 |
|------------|--------------|----------|
| `creative_brief` | creative_brief | ✓ |
| `territory_json` | territory_json | ✓（含 localDraftLocations） |
| `nations_outline_json` | nations_outline_json | ✓ |
| `world_name` | world_name | ✓ |
| `era` | era | ✓ |
| `atmosphere` | atmosphere | ✓ |
| `local_location_count` | local_location_count | ✓（本批城数，如 8） |
| `city_count` | city_count | ✓ |
| `generation_mode` | generation_mode | territory_society |
| 其余 | 同名 | 建议填 |

试运行前在 W2S **预览/日志** 里应能看到：

- `【领土、行省区划与环境 territory_json】` 后面有一大段 JSON（含 `loc-001`）
- `local_location_count=8`（或你的本批数量）

若预览里仍是空的 → 开始节点没填好，或 **W2S 未绑定开始变量**。

---

## 条数必须一致（你当前 Prompt 的典型问题）

| 字段 | 你日志里的值 | 问题 |
|------|--------------|------|
| `city_count` | **6** | 与下面不一致 |
| `local_location_count` | **8** | 要求输出 8 条 |
| `territory_json` 里实际城市 | **约 2 条**（loc-001、loc-002，且几乎只有 nation-001） | 没有 loc-003…008 |

模型被要求输出 **8 座城**，但领土 JSON 里只给了 **2 座** 的坐标 → 容易只出 6 条示例、乱编 id，或 earlier 空数组。

**修复**：试运行统一用 `society-run-batch8.sample.md` 附录，`city_count` 与 `local_location_count` 都填 **8**，`territory_json` 含 **loc-001…loc-008**（两国各若干座）。

`\\\"` 转义是 Dify 展示方式，一般可解析；关键是 **条数与 localDraft 一致**。

---

## 试运行怎么填（Markdown 导入易失败）

1. 用 `dify/world/fixtures/society-run-batch8.sample.md`
2. 若 Markdown 导入后仍空 → 用文末 **附录单行**，分别粘贴进：
   - `territory_json`
   - `nations_outline_json`
   - `creative_brief`
   - `local_location_count` → `8`
3. 再跑 W2S，检查 `structured_output.locations.length === 8`

---

## 从 NovelsCreator 客户端调用时

主进程会自动组装 `territory_json` + `creative_brief`（见 `world-society.service.ts`），**不依赖** Dify Markdown 导入。

若仅 Dify 试运行为空、客户端也失败，再查 API Key 与工作流 ID；若 **仅试运行为空**，按上文修开始节点与 W2S 绑定即可。

---

## 其它建议

| 项 | 建议 |
|----|------|
| 深度思考 / 思考链 | **关闭**（避免 `redacted_thinking` 占满 token，且空输入时更易输出空 JSON） |
| Max tokens | ≥ 8192 |
| 结构化输出 | 开启，Schema 用 `w2s-structured-output.schema.json` |

---

## 对照文档

- 空 END_OK 输入：`DIFY-END_OK-EMPTY-INPUT.md`
- END 绑定：`DIFY-END-NODE-CHECKLIST.md`
- 分批流程：`docs/world/w2-society/BATCH-FLOW.md`
