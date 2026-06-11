import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { ChapterGenerateInputs } from '../../../src/types/api'
import {
  buildN1Messages,
  buildN2aMessages,
  buildN2bMessages,
  buildN3Messages,
  buildN4aMessages,
  buildN4bMessages,
  buildN5Messages
} from '../../../electron/main/workflows/local/prompts/chapter-prompt-loader'
import { runP0Node, type P0Output } from '../../../electron/main/workflows/local/nodes/chapter/p0.node'
import { runChapterAggNode } from '../../../electron/main/workflows/local/nodes/chapter/agg.node'
import { runN4bMuxNode } from '../../../electron/main/workflows/local/nodes/chapter/n4b-mux.node'
import { runN5ParseNode } from '../../../electron/main/workflows/local/nodes/chapter/n5-parse.node'
import {
  runChapterCircuitBreakNode,
  runChapterEndOkNode,
  runChapterParseEndOutputs,
  runChapterRetryEndNode
} from '../../../electron/main/workflows/local/nodes/chapter/end-nodes'
import { createStudioChatModel, invokeLlmText } from '../llm'

const ChapterState = Annotation.Root({
  inputs: Annotation<ChapterGenerateInputs>,
  p0: Annotation<Record<string, unknown>>,
  draft_text: Annotation<string>,
  n2a_text: Annotation<string>,
  n2b_text: Annotation<string>,
  agg_route: Annotation<'continue' | 'retry' | 'circuit_break'>,
  agg_payload: Annotation<Record<string, unknown>>,
  polished_text: Annotation<string>,
  n4a_text: Annotation<string>,
  video_script: Annotation<string>,
  memory_patch: Annotation<string>,
  end_outputs: Annotation<string>,
  result: Annotation<Record<string, unknown>>
})

type ChapterStateType = typeof ChapterState.State

function routeAfterAgg(state: ChapterStateType): 'end_retry' | 'end_cb' | 'n3' {
  if (state.agg_route === 'retry') return 'end_retry'
  if (state.agg_route === 'circuit_break') return 'end_cb'
  return 'n3'
}

export function buildChapterGraph() {
  const graph = new StateGraph(ChapterState)
    .addNode('merge_p0', (state) => {
      const inputs = state.inputs
      const p0 = runP0Node({
        generation_prompt: inputs.generation_prompt ?? '',
        knowledge_snapshot: inputs.knowledge_snapshot,
        outline_beats: inputs.outline_beats,
        generation_prompt_text: inputs.generation_prompt_text ?? ''
      })
      return { p0: p0 as unknown as Record<string, unknown> }
    })
    .addNode('n1', async (state) => {
      const model = createStudioChatModel('creative')
      const p0 = state.p0 as unknown as P0Output
      const messages = await buildN1Messages(state.inputs, p0)
      const text = await invokeLlmText(model, messages.system, messages.user)
      return { draft_text: text.trim() }
    })
    .addNode('n2a', async (state) => {
      const model = createStudioChatModel('reasoning')
      const p0 = state.p0 as unknown as P0Output
      const messages = await buildN2aMessages(state.inputs, p0, state.draft_text)
      const text = await invokeLlmText(model, messages.system, messages.user)
      return { n2a_text: text }
    })
    .addNode('n2b', async (state) => {
      const model = createStudioChatModel('reasoning')
      const p0 = state.p0 as unknown as P0Output
      const messages = await buildN2bMessages(state.inputs, p0, state.draft_text)
      const text = await invokeLlmText(model, messages.system, messages.user)
      return { n2b_text: text }
    })
    .addNode('agg', (state) => {
      const agg = runChapterAggNode({
        outline_result: state.n2a_text,
        lore_result: state.n2b_text,
        retry_count: state.inputs.retry_count ?? 0,
        max_retry: state.inputs.max_retry ?? 3,
        draft_text: state.draft_text
      })
      return {
        agg_route: agg.route,
        agg_payload: agg as unknown as Record<string, unknown>
      }
    })
    .addNode('end_retry', (state) => {
      const agg = state.agg_payload
      const endPack = runChapterRetryEndNode({
        draft_text: state.draft_text,
        retry_count: Number(agg.retry_count ?? 0),
        outline_valid: Boolean(agg.outline_valid),
        lore_valid: Boolean(agg.lore_valid),
        retry_issues: agg.retry_issues,
        retry_issues_formatted: String(agg.retry_issues_formatted ?? '')
      })
      return { end_outputs: endPack.end_outputs }
    })
    .addNode('end_cb', (state) => {
      const agg = state.agg_payload
      const endPack = runChapterCircuitBreakNode({
        draft_text: state.draft_text,
        retry_count: Number(agg.retry_count ?? 0),
        outline_valid: Boolean(agg.outline_valid),
        lore_valid: Boolean(agg.lore_valid),
        retry_issues: agg.retry_issues
      })
      return { end_outputs: endPack.end_outputs }
    })
    .addNode('parse_early', (state) => {
      const result = runChapterParseEndOutputs({
        re_end_outputs: state.agg_route === 'retry' ? state.end_outputs : undefined,
        cb_end_outputs: state.agg_route === 'circuit_break' ? state.end_outputs : undefined
      })
      return { result }
    })
    .addNode('n3', async (state) => {
      const model = createStudioChatModel('creative')
      const merged = String(state.agg_payload.merged_issues_for_polish ?? '')
      const p0 = state.p0 as unknown as P0Output
      const messages = await buildN3Messages(state.inputs, p0, state.draft_text, merged)
      const text = await invokeLlmText(model, messages.system, messages.user)
      return { polished_text: text.trim() }
    })
    .addNode('n4a', async (state) => {
      const model = createStudioChatModel('creative')
      const p0 = state.p0 as unknown as P0Output
      const messages = await buildN4aMessages(state.inputs, p0, state.polished_text)
      const text = await invokeLlmText(model, messages.system, messages.user)
      return { n4a_text: text.trim() }
    })
    .addNode('n4b', async (state) => {
      const model = createStudioChatModel('creative')
      const p0 = state.p0 as unknown as P0Output
      const messages = await buildN4bMessages(state.inputs, p0, state.polished_text)
      const text = await invokeLlmText(model, messages.system, messages.user)
      return { n4b_text: text }
    })
    .addNode('mux', (state) => {
      const tpl = state.inputs.video_platform_template ?? 'generic-v1'
      const mux = runN4bMuxNode({
        generic_text: tpl === 'generic-v1' ? state.n4b_text : '',
        platform_text: tpl === 'platform-x-v1' ? state.n4b_text : '',
        configurable_text: tpl === 'configurable-v1' ? state.n4b_text : ''
      })
      return { video_script: mux.video_script }
    })
    .addNode('n5', async (state) => {
      const model = createStudioChatModel('reasoning')
      const p0 = state.p0 as unknown as P0Output
      const messages = await buildN5Messages(state.inputs, p0, state.n4a_text)
      const text = await invokeLlmText(model, messages.system, messages.user)
      const n5Parsed = runN5ParseNode({ text })
      return { memory_patch: n5Parsed.memory_patch }
    })
    .addNode('end_ok', (state) => {
      const agg = state.agg_payload
      const endPack = runChapterEndOkNode({
        novel_body: state.n4a_text,
        video_script: state.video_script,
        memory_patch: state.memory_patch,
        retry_count: Number(agg.retry_count ?? 0),
        outline_valid: Boolean(agg.outline_valid),
        lore_valid: Boolean(agg.lore_valid)
      })
      return { end_outputs: endPack.end_outputs }
    })
    .addNode('parse_ok', (state) => {
      const result = runChapterParseEndOutputs({ ok_end_outputs: state.end_outputs })
      return { result }
    })
    .addEdge(START, 'merge_p0')
    .addEdge('merge_p0', 'n1')
    .addEdge('n1', 'n2a')
    .addEdge('n1', 'n2b')
    .addEdge('n2a', 'agg')
    .addEdge('n2b', 'agg')
    .addConditionalEdges('agg', routeAfterAgg, ['end_retry', 'end_cb', 'n3'])
    .addEdge('end_retry', 'parse_early')
    .addEdge('end_cb', 'parse_early')
    .addEdge('parse_early', END)
    .addEdge('n3', 'n4a')
    .addEdge('n3', 'n4b')
    .addEdge('n4a', 'mux')
    .addEdge('n4b', 'mux')
    .addEdge('mux', 'n5')
    .addEdge('n5', 'end_ok')
    .addEdge('end_ok', 'parse_ok')
    .addEdge('parse_ok', END)

  return graph
}
