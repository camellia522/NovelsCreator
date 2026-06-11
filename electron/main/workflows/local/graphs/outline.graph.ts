import type { OutlineGenerateInputs } from '../../../../src/types/api'
import { createWorkflowChatModel, invokeLlmJson } from '../llm/llm-provider'
import { buildO1Messages, buildO2Messages } from '../prompts/outline-prompt-loader'
import { runO1XNode } from '../nodes/outline/o1x.node'
import { runAggNode } from '../nodes/outline/agg.node'
import {
  runCircuitBreakNode,
  runEndOkNode,
  runParseEndOutputs,
  runRetryEndNode
} from '../nodes/outline/end-nodes'
import { parseLlmJson } from '../utils/outline-llm-json'

/**
 * 本地大纲图：O1 → O1X → O2 → AGG → (END_OK|RE|CB) → PARSE
 * 与 Dify 部署拓扑一致；客户端 retry 在 outline-local.service 中处理。
 */
export async function invokeOutlineGraph(
  inputs: OutlineGenerateInputs
): Promise<Record<string, unknown>> {
  const o1Model = await createWorkflowChatModel('creative')
  const o2Model = await createWorkflowChatModel('reasoning')

  const o1Messages = await buildO1Messages(inputs)
  const o1Res = await invokeLlmJson(o1Model, o1Messages.system, o1Messages.user)
  const o1Parsed = parseLlmJson(o1Res.text)

  const o1x = runO1XNode({
    o1_result: o1Res.text,
    structured_output: Object.keys(o1Parsed).length ? o1Parsed : undefined
  })

  const o2Messages = await buildO2Messages(inputs, o1x.outline_json)
  const o2Res = await invokeLlmJson(o2Model, o2Messages.system, o2Messages.user)

  const agg = runAggNode({
    validate_result: o2Res.text,
    retry_count: inputs.retry_count ?? 0,
    max_retry: inputs.max_retry ?? 3,
    outline_json: o1x.outline_json
  })

  let endPack: { end_outputs: string }
  if (agg.route === 'continue') {
    endPack = runEndOkNode({
      outline_summary: o1x.outline_summary,
      outline_json: agg.outline_json,
      validation_report: agg.validation_report,
      retry_count: agg.retry_count
    })
  } else if (agg.route === 'retry') {
    endPack = runRetryEndNode({
      outline_summary: o1x.outline_summary,
      outline_json: agg.outline_json,
      retry_count: agg.retry_count,
      retry_issues_formatted: agg.retry_issues_formatted,
      validation_report: agg.validation_report
    })
  } else {
    endPack = runCircuitBreakNode({
      outline_summary: o1x.outline_summary,
      outline_json: agg.outline_json,
      retry_count: agg.retry_count,
      validation_report: agg.validation_report
    })
  }

  return runParseEndOutputs({
    ok_end_outputs: agg.route === 'continue' ? endPack.end_outputs : undefined,
    re_end_outputs: agg.route === 'retry' ? endPack.end_outputs : undefined,
    cb_end_outputs: agg.route === 'circuit_break' ? endPack.end_outputs : undefined
  })
}
