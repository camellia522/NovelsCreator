# 大纲工作流 · 代码节点输出变量（消除 validated 红条）

Dify 报错 **`Not all output parameters are validated`** 表示：该代码节点在画布上登记的 **「输出变量」名称/数量/类型** 与 Python 脚本 `return { ... }` **不一致**。

请逐节点对照下表，**删除多余输出变量**，**只保留表中列出的项**。

---

## O1X（outline_o1_extract.py）

| 输入 | 来源 |
|------|------|
| `o1_result` | O1 → text |
| `structured_output` | O1 → structured_output（Structured Output 开启时**必绑**） |

| 输出变量 | 类型 |
|----------|------|
| `outline_summary` | String |
| `outline_json` | String |

**勿声明** `parse_ok`、`chapter_count`、`status` 等（脚本不返回这些键）。

---

## AGG（outline_agg_validation.py）

| 输出变量 | 类型 |
|----------|------|
| `route` | String |
| `retry_count` | **Number** |
| `retry_issues_formatted` | String |
| `outline_valid` | **Boolean**（勿选 String） |
| `validation_report` | String |
| `outline_json` | String |

**删除**旧版遗留：`lore_valid`、`retry_issues`、`merged_issues_for_polish` 等。

---

## RE / CB / END_OK

三者脚本 **只返回 1 个键**：

| 输出变量 | 类型 |
|----------|------|
| `end_outputs` | String |

**勿**在 RE/CB/END_OK 上声明 `outline_json`、`status` 等为输出（那些是 `end_outputs` JSON 内部字段，或 PARSE/END 的字段）。

---

## PARSE（outline_parse_end_outputs.py）

| 输出变量 | 类型 |
|----------|------|
| `status` | String |
| `circuit_break` | String（`"true"` / `"false"`） |
| `human_action_required` | String |
| `retry_count` | **Number** |
| `outline_summary` | String |
| `outline_json` | String |
| `validation_report` | String |
| `retry_issues_formatted` | String |
| `workflow_version` | String |

---

## 操作步骤

1. 打开报红条的代码节点 → **输出变量**
2. 与上表逐项核对，删多补少，改对类型
3. 粘贴仓库最新 `.py` 全文到代码区
4. **从开始节点整链运行**（不要只单点某个 Code 节点「运行」）
5. 保存并重新发布工作流

若 **两条** validated 日志同时出现，通常是 **O1X + AGG** 两个节点都需要按上表修正。
