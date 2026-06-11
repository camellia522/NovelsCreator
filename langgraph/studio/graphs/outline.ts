import { buildOutlineGraph } from '../builders/outline-builder'

/** LangGraph Studio · 大纲工作流（O1→O1X→O2→AGG→END→PARSE） */
export const graph = buildOutlineGraph().compile()
