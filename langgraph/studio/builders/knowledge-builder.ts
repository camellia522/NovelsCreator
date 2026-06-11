import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { KnowledgeGenerateInputs } from '../../../src/types/api'
import { buildK1Messages, buildK2Messages } from '../../../electron/main/workflows/local/prompts/knowledge-prompt-loader'
import { runK1XNode } from '../../../electron/main/workflows/local/nodes/knowledge/k1x.node'
import { runKnowledgeAggNode } from '../../../electron/main/workflows/local/nodes/knowledge/agg.node'
import {
  runKnowledgeCircuitBreakNode,
  runKnowledgeEndOkNode,
  runKnowledgeParseEndOutputs,
  runKnowledgeRetryEndNode
} from '../../../electron/main/workflows/local/nodes/knowledge/end-nodes'
import { parseLlmJson } from '../../../electron/main/workflows/local/utils/outline-llm-json'
import { createStudioChatModel, invokeLlmText } from '../llm'

const KnowledgeState = Annotation.Root({
  inputs: Annotation<KnowledgeGenerateInputs>,
  k1_text: Annotation<string>,
  knowledge_json: Annotation<string>,
  knowledge_summary: Annotation<string>,
  k2_text: Annotation<string>,
  agg_route: Annotation<'continue' | 'retry' | 'circuit_break'>,
  agg_payload: Annotation<Record<string, unknown>>,
  result: Annotation<Record<string, unknown>>
})

type KnowledgeStateType = typeof KnowledgeState.State

function routeAfterAgg(state: KnowledgeStateType): 'end_ok' | 'end_retry' | 'end_cb' {
  if (state.agg_route === 'retry') return 'end_retry'
  if (state.agg_route === 'circuit_break') return 'end_cb'
  return 'end_ok'
}

export function buildKnowledgeGraph() {
  const graph = new StateGraph(KnowledgeState)
    .addNode('k1', async (state) => {
      const model = createStudioChatModel('creative')
      const messages = await buildK1Messages(state.inputs)
      const text = await invokeLlmText(model, messages.system, messages.user)
      return { k1_text: text }
    })
    .addNode('k1x', (state) => {
      const parsed = parseLlmJson(state.k1_text)
      const k1x = runK1XNode({
        k1_result: state.k1_text,
        structured_output: Object.keys(parsed).length ? parsed : undefined
      })
      return {
        knowledge_json: k1x.knowledge_json,
        knowledge_summary: k1x.knowledge_summary
      }
    })
    .addNode('k2', async (state) => {
      const model = createStudioChatModel('reasoning')
      const messages = await buildK2Messages(state.inputs, {
        knowledge_json: state.knowledge_json,
        knowledge_summary: state.knowledge_summary
      })
      const text = await invokeLlmText(model, messages.system, messages.user)
      return { k2_text: text }
    })
    .addNode('agg', (state) => {
      const agg = runKnowledgeAggNode({
        validate_result: state.k2_text,
        retry_count: state.inputs.retry_count ?? 0,
        max_retry: state.inputs.max_retry ?? 3,
        knowledge_json: state.knowledge_json
      })
      return {
        agg_route: agg.route,
        agg_payload: agg as unknown as Record<string, unknown>,
        knowledge_json: agg.knowledge_json
      }
    })
    .addNode('end_ok', (state) => {
      const agg = state.agg_payload
      const endPack = runKnowledgeEndOkNode({
        knowledge_summary: state.knowledge_summary,
        knowledge_json: state.knowledge_json,
        validation_report: String(agg.validation_report ?? ''),
        retry_count: Number(agg.retry_count ?? 0)
      })
      return { agg_payload: { ...state.agg_payload, end_outputs: endPack.end_outputs } }
    })
    .addNode('end_retry', (state) => {
      const agg = state.agg_payload
      const endPack = runKnowledgeRetryEndNode({
        knowledge_summary: state.knowledge_summary,
        knowledge_json: state.knowledge_json,
        retry_count: Number(agg.retry_count ?? 0),
        retry_issues_formatted: String(agg.retry_issues_formatted ?? ''),
        validation_report: String(agg.validation_report ?? '')
      })
      return { agg_payload: { ...state.agg_payload, end_outputs: endPack.end_outputs } }
    })
    .addNode('end_cb', (state) => {
      const agg = state.agg_payload
      const endPack = runKnowledgeCircuitBreakNode({
        knowledge_summary: state.knowledge_summary,
        knowledge_json: state.knowledge_json,
        retry_count: Number(agg.retry_count ?? 0),
        validation_report: String(agg.validation_report ?? '')
      })
      return { agg_payload: { ...state.agg_payload, end_outputs: endPack.end_outputs } }
    })
    .addNode('parse', (state) => {
      const endOutputs = String(state.agg_payload.end_outputs ?? '')
      const result = runKnowledgeParseEndOutputs({
        ok_end_outputs: state.agg_route === 'continue' ? endOutputs : undefined,
        re_end_outputs: state.agg_route === 'retry' ? endOutputs : undefined,
        cb_end_outputs: state.agg_route === 'circuit_break' ? endOutputs : undefined
      })
      return { result }
    })
    .addEdge(START, 'k1')
    .addEdge('k1', 'k1x')
    .addEdge('k1x', 'k2')
    .addEdge('k2', 'agg')
    .addConditionalEdges('agg', routeAfterAgg, ['end_ok', 'end_retry', 'end_cb'])
    .addEdge('end_ok', 'parse')
    .addEdge('end_retry', 'parse')
    .addEdge('end_cb', 'parse')
    .addEdge('parse', END)

  return graph
}
