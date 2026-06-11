import { buildSocietyGraph } from '../builders/society-builder'

/** LangGraph Studio · 社会层工作流（W2S→W2SX→END_OK→PARSE） */
export const graph = buildSocietyGraph().compile()
