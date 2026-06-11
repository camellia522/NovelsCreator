# LangGraph Studio 工作流

本目录为 **LangSmith Studio** 专用，与 Electron 主进程内的 `invoke*Graph()` 并行维护。

- 配置：`../langgraph.json`
- 使用说明：[docs/v1.0/LANGGRAPH-STUDIO.md](../docs/v1.0/LANGGRAPH-STUDIO.md)

```bash
copy .env.studio.example .env   # 填写 LANGSMITH_API_KEY + LOCAL_LLM_API_KEY
npm run studio:dev
```
