import type { TerritorySocietyRequest } from '../../../services/world-society.service'
import { buildSocietyWorkflowInputs } from '../../../services/society-workflow-inputs'
import { createWorkflowChatModel, invokeLlmJson } from '../llm/llm-provider'
import { buildW2SMessages } from '../prompts/society-prompt-loader'
import { runW2SXNode } from '../nodes/society/w2sx.node'
import { runSocietyEndOkNode, runSocietyParseEndOutputs } from '../nodes/society/end-nodes'
import { parseJsonLoose } from '../../../utils/world-dify-parse'

/** 本地社会层图：W2S → W2SX → END_OK → PARSE */
export async function invokeSocietyGraph(
  req: TerritorySocietyRequest,
  projectId: string
): Promise<Record<string, unknown>> {
  const inputs = buildSocietyWorkflowInputs(req, projectId)
  const w2sModel = await createWorkflowChatModel('creative')
  const messages = await buildW2SMessages(inputs)
  const w2sRes = await invokeLlmJson(w2sModel, messages.system, messages.user)
  const w2sParsed = parseJsonLoose<Record<string, unknown>>(w2sRes.text, {})

  const w2sx = runW2SXNode({
    w2s_json: w2sRes.text,
    structured_output: Object.keys(w2sParsed).length ? w2sParsed : undefined
  })

  const endOk = runSocietyEndOkNode({
    society_json: w2sx.society_json,
    world_rules: w2sx.world_rules,
    nations_json: w2sx.nations_json,
    locations_json: w2sx.locations_json,
    workflow_version: 'world-society-v1'
  })

  return runSocietyParseEndOutputs({
    ok_end_outputs: endOk.end_outputs,
    end_outputs: endOk.end_outputs
  })
}
