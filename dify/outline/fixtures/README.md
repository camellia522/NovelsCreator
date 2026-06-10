# 大纲工作流 Fixtures

| 文件 | 用途 |
|------|------|
| `outline-run.sample.json` | API / `test-dify-outline.ps1` |
| `outline-run.epic-fantasy.json` | 四帝国史诗单章 · `npm run test:outline-dify` |
| **`outline-run.sample.md`** | **Dify 画布「从 Markdown 导入」试运行（推荐）** |

## 本地测试（无需 LLM）

```bash
npm run test:outline-all    # Code 节点 + 客户端章 id / 占位章逻辑
```

## Dify 联调（需已发布工作流 + 本机 Key）

```bash
npm run test:outline-dify   # 自动读本机 NovelsCreator 已保存的大纲 Key
```

## Dify 试运行

1. 打开工作流 → **运行**
2. **从 Markdown 导入** → 选择或粘贴 `outline-run.sample.md` 全文  
   （或按 `## 变量名` 章节逐字段复制到 START）
3. 确认 END 输出：`status=success`，`outline_json` 含 `volumes`

## PowerShell 联调

```powershell
$env:DIFY_BASE_URL = "http://127.0.0.1/v1"
$env:DIFY_API_KEY = "app-xxxxxxxx"   # 大纲应用 Key
.\scripts\test-dify-outline.ps1
```

生成 Markdown（从 JSON 同步）：

```bash
npx tsx scripts/json-inputs-to-dify-markdown.ts outline-run.sample.json --outline
```
