import type { KnowledgeGenerateInputs } from '../../../../src/types/api'
import { createWorkflowChatModel, invokeLlmJson } from '../llm/llm-provider'
import { buildK1Messages, buildK2Messages } from '../prompts/knowledge-prompt-loader'
import { runK1XNode } from '../nodes/knowledge/k1x.node'
import { runKnowledgeAggNode } from '../nodes/knowledge/agg.node'
import {
  runKnowledgeCircuitBreakNode,
  runKnowledgeEndOkNode,
  runKnowledgeParseEndOutputs,
  runKnowledgeRetryEndNode
} from '../nodes/knowledge/end-nodes'
import { parseLlmJson } from '../utils/outline-llm-json'

/** 本地知识库图：K1 → K1X → K2 → AGG → (END_OK|RE|CB) → PARSE */
export async function invokeKnowledgeGraph(
  inputs: KnowledgeGenerateInputs
): Promise<Record<string, unknown>> {
  const k1Model = await createWorkflowChatModel('creative')
  const k2Model = await createWorkflowChatModel('reasoning')

  const k1Messages = await buildK1Messages(inputs)
  const k1Res = await invokeLlmJson(k1Model, k1Messages.system, k1Messages.user)
  const k1Parsed = parseLlmJson(k1Res.text)

  const k1x = runK1XNode({
    k1_result: k1Res.text,
    structured_output: Object.keys(k1Parsed).length ? k1Parsed : undefined
  })

  const k2Messages = await buildK2Messages(inputs, k1x)
  const k2Res = await invokeLlmJson(k2Model, k2Messages.system, k2Messages.user)

  const agg = runKnowledgeAggNode({
    validate_result: k2Res.text,
    retry_count: inputs.retry_count ?? 0,
    max_retry: inputs.max_retry ?? 3,
    knowledge_json: k1x.knowledge_json
  })

  let endPack: { end_outputs: string }
  if (agg.route === 'continue') {
    endPack = runKnowledgeEndOkNode({
      knowledge_summary: k1x.knowledge_summary,
      knowledge_json: agg.knowledge_json,
      validation_report: agg.validation_report,
      retry_count: agg.retry_count
    })
  } else if (agg.route === 'retry') {
    endPack = runKnowledgeRetryEndNode({
      knowledge_summary: k1x.knowledge_summary,
      knowledge_json: agg.knowledge_json,
      retry_count: agg.retry_count,
      retry_issues_formatted: agg.retry_issues_formatted,
      validation_report: agg.validation_report
    })
  } else {
    endPack = runKnowledgeCircuitBreakNode({
      knowledge_summary: k1x.knowledge_summary,
      knowledge_json: agg.knowledge_json,
      retry_count: agg.retry_count,
      validation_report: agg.validation_report
    })
  }

  return runKnowledgeParseEndOutputs({
    ok_end_outputs: agg.route === 'continue' ? endPack.end_outputs : undefined,
    re_end_outputs: agg.route === 'retry' ? endPack.end_outputs : undefined,
    cb_end_outputs: agg.route === 'circuit_break' ? endPack.end_outputs : undefined
  })
}
