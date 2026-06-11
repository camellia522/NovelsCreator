import type { ChapterGenerateInputs } from '../../../../src/types/api'
import { createWorkflowChatModel, invokeLlmJson } from '../llm/llm-provider'
import {
  buildN1Messages,
  buildN2aMessages,
  buildN2bMessages,
  buildN3Messages,
  buildN4aMessages,
  buildN4bMessages,
  buildN5Messages
} from '../prompts/chapter-prompt-loader'
import { runP0Node } from '../nodes/chapter/p0.node'
import { runChapterAggNode } from '../nodes/chapter/agg.node'
import { runN4bMuxNode } from '../nodes/chapter/n4b-mux.node'
import { runN5ParseNode } from '../nodes/chapter/n5-parse.node'
import {
  runChapterCircuitBreakNode,
  runChapterEndOkNode,
  runChapterParseEndOutputs,
  runChapterRetryEndNode
} from '../nodes/chapter/end-nodes'

/**
 * 本地章节图：P0 → N1 → N2a∥N2b → AGG → (RE|CB|N3→N4a∥N4b→MUX→N5→END_OK) → PARSE
 * 客户端 retry 在 chapter-local.service 中处理。
 */
export async function invokeChapterGraph(
  inputs: ChapterGenerateInputs
): Promise<Record<string, unknown>> {
  const creativeModel = await createWorkflowChatModel('creative')
  const reasoningModel = await createWorkflowChatModel('reasoning')

  const p0 = runP0Node({
    generation_prompt: inputs.generation_prompt ?? '',
    knowledge_snapshot: inputs.knowledge_snapshot,
    outline_beats: inputs.outline_beats,
    generation_prompt_text: inputs.generation_prompt_text ?? ''
  })

  const n1Messages = await buildN1Messages(inputs, p0)
  const n1Res = await invokeLlmJson(creativeModel, n1Messages.system, n1Messages.user)
  const draftText = n1Res.text.trim()

  const [n2aMessages, n2bMessages] = await Promise.all([
    buildN2aMessages(inputs, p0, draftText),
    buildN2bMessages(inputs, p0, draftText)
  ])
  const [n2aRes, n2bRes] = await Promise.all([
    invokeLlmJson(reasoningModel, n2aMessages.system, n2aMessages.user),
    invokeLlmJson(reasoningModel, n2bMessages.system, n2bMessages.user)
  ])

  const agg = runChapterAggNode({
    outline_result: n2aRes.text,
    lore_result: n2bRes.text,
    retry_count: inputs.retry_count ?? 0,
    max_retry: inputs.max_retry ?? 3,
    draft_text: draftText
  })

  let endPack: { end_outputs: string }
  if (agg.route === 'retry') {
    endPack = runChapterRetryEndNode({
      draft_text: draftText,
      retry_count: agg.retry_count,
      outline_valid: agg.outline_valid,
      lore_valid: agg.lore_valid,
      retry_issues: agg.retry_issues,
      retry_issues_formatted: agg.retry_issues_formatted
    })
    return runChapterParseEndOutputs({ re_end_outputs: endPack.end_outputs })
  }

  if (agg.route === 'circuit_break') {
    endPack = runChapterCircuitBreakNode({
      draft_text: draftText,
      retry_count: agg.retry_count,
      outline_valid: agg.outline_valid,
      lore_valid: agg.lore_valid,
      retry_issues: agg.retry_issues
    })
    return runChapterParseEndOutputs({ cb_end_outputs: endPack.end_outputs })
  }

  const n3Messages = await buildN3Messages(inputs, p0, draftText, agg.merged_issues_for_polish)
  const n3Res = await invokeLlmJson(creativeModel, n3Messages.system, n3Messages.user)
  const polishedText = n3Res.text.trim()

  const [n4aMessages, n4bMessages] = await Promise.all([
    buildN4aMessages(inputs, p0, polishedText),
    buildN4bMessages(inputs, p0, polishedText)
  ])
  const [n4aRes, n4bRes] = await Promise.all([
    invokeLlmJson(creativeModel, n4aMessages.system, n4aMessages.user),
    invokeLlmJson(creativeModel, n4bMessages.system, n4bMessages.user)
  ])

  const tpl = inputs.video_platform_template ?? 'generic-v1'
  const mux = runN4bMuxNode({
    generic_text: tpl === 'generic-v1' ? n4bRes.text : '',
    platform_text: tpl === 'platform-x-v1' ? n4bRes.text : '',
    configurable_text: tpl === 'configurable-v1' ? n4bRes.text : ''
  })

  const n5Messages = await buildN5Messages(inputs, p0, n4aRes.text.trim())
  const n5Res = await invokeLlmJson(reasoningModel, n5Messages.system, n5Messages.user)
  const n5Parsed = runN5ParseNode({ text: n5Res.text })

  endPack = runChapterEndOkNode({
    novel_body: n4aRes.text.trim(),
    video_script: mux.video_script,
    memory_patch: n5Parsed.memory_patch,
    retry_count: agg.retry_count,
    outline_valid: agg.outline_valid,
    lore_valid: agg.lore_valid
  })

  return runChapterParseEndOutputs({ ok_end_outputs: endPack.end_outputs })
}
