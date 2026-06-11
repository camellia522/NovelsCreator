import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { OutlineGenerateInputs } from '../../../src/types/api'
import { buildO1Messages, buildO2Messages } from '../../../electron/main/workflows/local/prompts/outline-prompt-loader'
import { runO1XNode } from '../../../electron/main/workflows/local/nodes/outline/o1x.node'
import { runAggNode } from '../../../electron/main/workflows/local/nodes/outline/agg.node'
import {
  runCircuitBreakNode,
  runEndOkNode,
  runParseEndOutputs,
  runRetryEndNode
} from '../../../electron/main/workflows/local/nodes/outline/end-nodes'
import { parseLlmJson } from '../../../electron/main/workflows/local/utils/outline-llm-json'
import { createStudioChatModel, invokeLlmText } from '../llm'

const OutlineState = Annotation.Root({
  inputs: Annotation<OutlineGenerateInputs>,
  o1_text: Annotation<string>,
  outline_json: Annotation<string>,
  outline_summary: Annotation<string>,
  o2_text: Annotation<string>,
  agg_route: Annotation<'continue' | 'retry' | 'circuit_break'>,
  agg_payload: Annotation<Record<string, unknown>>,
  result: Annotation<Record<string, unknown>>
})

type OutlineStateType = typeof OutlineState.State

function routeAfterAgg(state: OutlineStateType): 'end_ok' | 'end_retry' | 'end_cb' {
  if (state.agg_route === 'retry') return 'end_retry'
  if (state.agg_route === 'circuit_break') return 'end_cb'
  return 'end_ok'
}

export function buildOutlineGraph() {
  const graph = new StateGraph(OutlineState)
    .addNode('o1', async (state) => {
      const model = createStudioChatModel('creative')
      const messages = await buildO1Messages(state.inputs)
      const text = await invokeLlmText(model, messages.system, messages.user)
      return { o1_text: text }
    })
    .addNode('o1x', (state) => {
      const parsed = parseLlmJson(state.o1_text)
      const o1x = runO1XNode({
        o1_result: state.o1_text,
        structured_output: Object.keys(parsed).length ? parsed : undefined
      })
      return {
        outline_json: o1x.outline_json,
        outline_summary: o1x.outline_summary
      }
    })
    .addNode('o2', async (state) => {
      const model = createStudioChatModel('reasoning')
      const messages = await buildO2Messages(state.inputs, state.outline_json)
      const text = await invokeLlmText(model, messages.system, messages.user)
      return { o2_text: text }
    })
    .addNode('agg', (state) => {
      const agg = runAggNode({
        validate_result: state.o2_text,
        retry_count: state.inputs.retry_count ?? 0,
        max_retry: state.inputs.max_retry ?? 3,
        outline_json: state.outline_json
      })
      return {
        agg_route: agg.route,
        agg_payload: agg as unknown as Record<string, unknown>,
        outline_json: agg.outline_json
      }
    })
    .addNode('end_ok', (state) => {
      const agg = state.agg_payload
      const endPack = runEndOkNode({
        outline_summary: state.outline_summary,
        outline_json: state.outline_json,
        validation_report: String(agg.validation_report ?? ''),
        retry_count: Number(agg.retry_count ?? 0)
      })
      return { agg_payload: { ...state.agg_payload, end_outputs: endPack.end_outputs } }
    })
    .addNode('end_retry', (state) => {
      const agg = state.agg_payload
      const endPack = runRetryEndNode({
        outline_summary: state.outline_summary,
        outline_json: state.outline_json,
        retry_count: Number(agg.retry_count ?? 0),
        retry_issues_formatted: String(agg.retry_issues_formatted ?? ''),
        validation_report: String(agg.validation_report ?? '')
      })
      return { agg_payload: { ...state.agg_payload, end_outputs: endPack.end_outputs } }
    })
    .addNode('end_cb', (state) => {
      const agg = state.agg_payload
      const endPack = runCircuitBreakNode({
        outline_summary: state.outline_summary,
        outline_json: state.outline_json,
        retry_count: Number(agg.retry_count ?? 0),
        validation_report: String(agg.validation_report ?? '')
      })
      return { agg_payload: { ...state.agg_payload, end_outputs: endPack.end_outputs } }
    })
    .addNode('parse', (state) => {
      const endOutputs = String(state.agg_payload.end_outputs ?? '')
      const result = runParseEndOutputs({
        ok_end_outputs: state.agg_route === 'continue' ? endOutputs : undefined,
        re_end_outputs: state.agg_route === 'retry' ? endOutputs : undefined,
        cb_end_outputs: state.agg_route === 'circuit_break' ? endOutputs : undefined
      })
      return { result }
    })
    .addEdge(START, 'o1')
    .addEdge('o1', 'o1x')
    .addEdge('o1x', 'o2')
    .addEdge('o2', 'agg')
    .addConditionalEdges('agg', routeAfterAgg, ['end_ok', 'end_retry', 'end_cb'])
    .addEdge('end_ok', 'parse')
    .addEdge('end_retry', 'parse')
    .addEdge('end_cb', 'parse')
    .addEdge('parse', END)

  return graph
}
