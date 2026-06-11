/**
 * 本地章节 Code 节点 TS 移植测试（无需 LLM / Dify）
 */
import { runP0Node } from '../electron/main/workflows/local/nodes/chapter/p0.node'
import { runChapterAggNode } from '../electron/main/workflows/local/nodes/chapter/agg.node'
import { runN4bMuxNode } from '../electron/main/workflows/local/nodes/chapter/n4b-mux.node'
import { runN5ParseNode } from '../electron/main/workflows/local/nodes/chapter/n5-parse.node'
import {
  runChapterCircuitBreakNode,
  runChapterEndOkNode,
  runChapterParseEndOutputs,
  runChapterRetryEndNode
} from '../electron/main/workflows/local/nodes/chapter/end-nodes'
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

const p0 = runP0Node({
  generation_prompt: '',
  knowledge_snapshot: JSON.stringify({
    world: { title: '测试世界', rules: '灵气复苏' },
    characters: [{ id: 'char-001', name: '张三', traits: ['冷静'] }]
  }),
  outline_beats: JSON.stringify([
    { order: 1, text: '主角抵达破庙' },
    { order: 2, text: '遭遇剑客' }
  ])
})
assert(p0.has_wizard === 'false', 'P0 no wizard')
const beats = JSON.parse(p0.effective_beats)
assert(beats.length === 2, 'P0 effective_beats')

const draft = '破庙雨夜，张三避雨时遭遇神秘剑客。'.repeat(20)

const validAgg = runChapterAggNode({
  outline_result: JSON.stringify({ outline_valid: true, outline_issues: [] }),
  lore_result: JSON.stringify({ lore_valid: true, lore_issues: [] }),
  retry_count: 0,
  max_retry: 3,
  draft_text: draft
})
assert(validAgg.route === 'continue', 'AGG continue')

const retryAgg = runChapterAggNode({
  outline_result: JSON.stringify({ outline_valid: false, outline_issues: ['节拍2未覆盖'] }),
  lore_result: JSON.stringify({ lore_valid: true, lore_issues: [] }),
  retry_count: 0,
  max_retry: 3,
  draft_text: draft
})
assert(retryAgg.route === 'retry', 'AGG retry')
assert(retryAgg.retry_count === 1, 'AGG retry_count')

const cbAgg = runChapterAggNode({
  outline_result: JSON.stringify({ outline_valid: false, outline_issues: ['缺节拍'] }),
  lore_result: JSON.stringify({ lore_valid: false, lore_issues: ['人设冲突'] }),
  retry_count: 3,
  max_retry: 3,
  draft_text: draft
})
assert(cbAgg.route === 'circuit_break', 'AGG circuit_break')

const mux = runN4bMuxNode({
  generic_text: '镜头1：破庙外景',
  platform_text: '',
  configurable_text: ''
})
assert(mux.video_script.includes('破庙'), 'N4B-MUX')

const n5 = runN5ParseNode({
  text: JSON.stringify({
    chapterSummary: { chapterId: 'ch-001', summary: '张三遇剑客' },
    globalSummaryDelta: '边关谍战升级',
    foreshadowingUpdates: []
  })
})
assert(n5.memory_patch_json.includes('ch-001'), 'N5 parse')

const endOk = runChapterEndOkNode({
  novel_body: draft,
  video_script: mux.video_script,
  memory_patch: n5.memory_patch,
  retry_count: 0,
  outline_valid: true,
  lore_valid: true
})
const flatOk = runChapterParseEndOutputs({ ok_end_outputs: endOk.end_outputs })
assert(flatOk.status === 'success', 'PARSE success')
assert(String(flatOk.novel_body).length > 100, 'PARSE novel_body')
const patch = JSON.parse(String(flatOk.memory_patch)) as { chapterSummary?: unknown }
assert(patch.chapterSummary != null, 'PARSE memory_patch')

const retryEnd = runChapterRetryEndNode({
  draft_text: draft,
  retry_count: 1,
  outline_valid: false,
  lore_valid: true,
  retry_issues: '["节拍2未覆盖"]',
  retry_issues_formatted: '- 节拍2未覆盖'
})
const flatRetry = runChapterParseEndOutputs({ re_end_outputs: retryEnd.end_outputs })
assert(flatRetry.status === 'retry', 'PARSE retry')

const cbEnd = runChapterCircuitBreakNode({
  draft_text: draft,
  retry_count: 3,
  outline_valid: false,
  lore_valid: false,
  retry_issues: '["缺节拍","人设冲突"]'
})
const flatCb = runChapterParseEndOutputs({ cb_end_outputs: cbEnd.end_outputs })
assert(flatCb.status === 'circuit_break', 'PARSE circuit_break')

console.log('test-chapter-local-nodes: all passed')
