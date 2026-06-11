import { buildChapterGraph } from '../builders/chapter-builder'

/** LangGraph Studio · 章节工作流（P0→N1→N2a∥N2b→AGG→…→PARSE） */
export const graph = buildChapterGraph().compile()
