# W2S · USER Prompt（粘贴到 Dify LLM 节点）

> **分批流程**（客户端串行）：本地已按世界规则+坐标选好城 → 每批只送本批 `localDraftLocations` → 你输出本批全部 `locations` → END/PARSE 回主进程 → 下一批直到全图完成。详见 [BATCH-FLOW.md](../../docs/world/w2-society/BATCH-FLOW.md)。

> **完整配置**：[docs/world/w2-society/PROMPT-DESIGN.md](../../docs/world/w2-society/PROMPT-DESIGN.md)  

> System Prompt 使用 [`w2-territory-society.md`](./w2-territory-society.md) 全文。  

> 开启 **Jinja2**、**结构化输出 / JSON**、温度 **0.7**。



```jinja2

{% if not territory_json or (territory_json | trim) == '' %}
【严重】territory_json 为空：不得输出空 locations。请在工作流「开始」节点填写 territory_json、nations_outline_json、creative_brief，并确认 W2S 的 User 提示词中每个 {{ 变量 }} 已绑定「开始」同名输入（Markdown 导入失败时需用手动粘贴附录单行 JSON）。
{% endif %}

{{ creative_brief }}



---

generation_mode={{ generation_mode }}

world_name={{ world_name }}

era={{ era }}

atmosphere={{ atmosphere }}

scale={{ scale }}

climate={{ climate }}

city_count={{ city_count }}

include_landmarks={{ include_landmarks }}

seed={{ seed }}

geological_years_ma={{ geological_years_ma }}

cells_per_province_target={{ cells_per_province_target }}

place_naming_style={{ place_naming_style }}

naming_style_hint={{ naming_style_hint }}

local_location_count={{ local_location_count }}

（city_count 与 local_location_count 相同，均为客户端行省区划算法结果，勿自行增减城市条数）



【国家轮廓 nations_outline_json】

{{ nations_outline_json }}



【领土、行省区划与环境 territory_json — schemaVersion=3】

{{ territory_json }}



【再次强调】

- 输出 locations 数组长度必须 **等于** local_location_count（{{ local_location_count }}），与 territory_json.localDraftLocations 一一对应

- **禁止**只输出 6 条示例城就结束；分批时本批条数 = local_location_count（见 projectConfig.societyBatch）

- localDraftLocations / adminProvinces.seats 中每条 id/x/y/type/terrain/nationId 必须原样出现在输出 locations 中

- 润色 nations[].name、locations[].name/description，以及 nations 政体/文化/简介与 **world_rules（世界背景，非技术参数）**

- **world_rules**：根据 era / atmosphere / scale / climate 与 authorCreativeBrief 写 300–600 字世界背景；勿写分辨率、板块、海平面、算法流程；placementSummary 勿照抄

- **分批**：第 1 批必须输出 world_rules；第 2 批及以后 world_rules 为 ""

- **国名**：必须润色 `nations[].name`；遵循 `place_naming_style` / `naming_style_hint` 与各国 `nationNamingStyle`；`polishNationName=true` 勿留占位国名

- **地名风格**：与 `place_naming_style` 一致；混合模式同国城市语种一致

- **方位**：多数城名不必含东/西/南/北；若使用方位字，须与 `compassHint`、`x/y` 一致（西境不得用「东」）

```

---

## END 节点接线（避免客户端「有键无内容」）

推荐链路：**W2S（LLM 结构化 JSON）→ W2SX/END_OK → PARSE（`world_society_parse_end_outputs.py`）→ END**

END 的 outputs 请绑定 **PARSE 节点输出**，不要手写示例里的 `……` / `[…]` 占位符：

| END 变量 | 绑定来源 |
|----------|----------|
| `status` | PARSE.`status` |
| `society_json` | PARSE.`society_json` |
| `world_rules` | PARSE.`world_rules` |
| `nations_json` | PARSE.`nations_json` |
| `locations_json` | PARSE.`locations_json` |

若 END 只有变量名、值为空，客户端会提示「outputs 键存在但 society_json/locations_json=空」。

**START 可选变量**（与客户端一致）：`place_naming_style`、`naming_style_hint`（String）；未建变量时以 `territory_json.projectConfig` 为准。


