import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { buildW2SMessages } from '../../../electron/main/workflows/local/prompts/society-prompt-loader'
import { runW2SXNode } from '../../../electron/main/workflows/local/nodes/society/w2sx.node'
import { runSocietyEndOkNode, runSocietyParseEndOutputs } from '../../../electron/main/workflows/local/nodes/society/end-nodes'
import { parseJsonLoose } from '../../../electron/main/utils/world-dify-parse'
import { createStudioChatModel, invokeLlmText } from '../llm'

const SocietyState = Annotation.Root({
  inputs: Annotation<Record<string, string>>,
  w2s_text: Annotation<string>,
  society_json: Annotation<string>,
  world_rules: Annotation<string>,
  nations_json: Annotation<string>,
  locations_json: Annotation<string>,
  end_outputs: Annotation<string>,
  result: Annotation<Record<string, unknown>>
})

export function buildSocietyGraph() {
  const graph = new StateGraph(SocietyState)
    .addNode('w2s', async (state) => {
      const model = createStudioChatModel('creative')
      const messages = await buildW2SMessages(state.inputs)
      const text = await invokeLlmText(model, messages.system, messages.user)
      return { w2s_text: text }
    })
    .addNode('w2sx', (state) => {
      const parsed = parseJsonLoose<Record<string, unknown>>(state.w2s_text, {})
      const w2sx = runW2SXNode({
        w2s_json: state.w2s_text,
        structured_output: Object.keys(parsed).length ? parsed : undefined
      })
      return {
        society_json: w2sx.society_json,
        world_rules: w2sx.world_rules,
        nations_json: w2sx.nations_json,
        locations_json: w2sx.locations_json
      }
    })
    .addNode('end_ok', (state) => {
      const endOk = runSocietyEndOkNode({
        society_json: state.society_json,
        world_rules: state.world_rules,
        nations_json: state.nations_json,
        locations_json: state.locations_json,
        workflow_version: 'world-society-v1'
      })
      return { end_outputs: endOk.end_outputs }
    })
    .addNode('parse', (state) => {
      const result = runSocietyParseEndOutputs({
        ok_end_outputs: state.end_outputs,
        end_outputs: state.end_outputs
      })
      return { result }
    })
    .addEdge(START, 'w2s')
    .addEdge('w2s', 'w2sx')
    .addEdge('w2sx', 'end_ok')
    .addEdge('end_ok', 'parse')
    .addEdge('parse', END)

  return graph
}
