import { buildKnowledgeGraph } from '../builders/knowledge-builder'

/** LangGraph Studio · 知识库工作流（K1→K1X→K2→AGG→END→PARSE） */
export const graph = buildKnowledgeGraph().compile()
