# 社会层 Dify 测试文件说明

## 你的画布绑定（PARSE → 输出 · String 后缀）

| END 输出变量 | 应绑定 |
|--------------|--------|
| `statusString` | PARSE.`status` |
| `society_jsonString` | PARSE.`society_json` |
| `nations_jsonString` | PARSE.`nations_json` |
| `locations_jsonString` | PARSE.`locations_json` |
| `world_rulesString` | PARSE.`world_rules` |

客户端已兼容上述命名（见 `electron/main/utils/world-dify-parse.ts` 的 `pickWorkflowOutput`）。

---

## 文件一览

| 文件 | 用途 |
|------|------|
| **w2s-end-parse-string-suffix.json** | 成功样例：8 城 + 2 国，**与 String 后缀 END 一致**；含 `workflow_api_response` 模拟 API 返回 |
| **w2s-end-empty-string-suffix.json** | 失败样例：`locations_jsonString=[]`，用于对照「绑定对但内容空」 |
| **w2s-end-user-sample.json** | 6 城完整 END（无 String 后缀键名，客户端同样支持） |
| **society-run-batch8.sample.json** | Dify **试运行 inputs**（`local_location_count=8`，含 8 条 localDraft） |
| **society-run.sample.json** | 简易试运行 inputs（8 城 territory 片段） |
| **w2s-end-outputs-good.example.json** | END 字段说明与 checklist |

---

## 本地测试命令

```bash
# 解析所有核心 fixture（推荐）
npm run test:society-fixtures

# 只测 String 后缀成功样例
npx tsx --tsconfig tsconfig.web.json scripts/test-society-dify-fixtures.ts w2s-end-parse-string-suffix.json

# 只测空数组失败样例
npx tsx --tsconfig tsconfig.web.json scripts/test-society-dify-fixtures.ts w2s-end-empty-string-suffix.json

# 原有解析单测
npm run test:society-parse
```

---

## Dify 控制台操作（Markdown 导入）

Dify 试运行 **不支持直接导入 JSON**，请用 Markdown：

| 文件 | 说明 |
|------|------|
| **`society-run-batch8.sample.md`** | 单批 8 城，按 `## 变量名` + 代码块分节，可「从 Markdown 导入」 |
| `society-run-batch8.sample.json` | 同源数据（给脚本/文档用） |

### 方式 A：Markdown 导入（推荐）

1. 工作流 → **试运行** → 选择 **从 Markdown 导入**（或等价入口）。
2. 打开 `society-run-batch8.sample.md`，**全选复制** 粘贴导入。
3. 若导入后 `territory_json` / `nations_outline_json` 变成带换行的多行：在对应输入框内 **删除换行/空格**，保证是**单行合法 JSON**（与 `.json` 里字符串一致）；或只复制该节代码块内的 minified 一行版（见下方方式 B）。

### 方式 B：按变量手动粘贴

试运行面板里每个输入变量一个框，从 `.md` 各节的 **代码块内部** 复制（不要带 \`\`\`）：

- 短文本 → `## world_name` 等 `text` 块
- JSON 变量 → `nations_outline_json`、`territory_json` 的 `json` 块（导入 Dify API 时须**压缩成一行**，客户端会自动发单行）

### 从 JSON 重新生成 .md

```bash
npm run gen:dify-inputs-md
# 或
npx tsx scripts/json-inputs-to-dify-markdown.ts society-run.sample.json
```

### 试运行通过后

1. 打开 **输出** 节点，复制 5 个 `*String` 到 `w2s-end-parse-string-suffix.json`。
2. `npm run test:society-fixtures` 校验与客户端解析一致。

通过标准：`locations_jsonString` 解析后 **length === 8**，且每条含 `"id":"loc-00"`。
