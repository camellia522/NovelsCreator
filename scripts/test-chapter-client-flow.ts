/**
 * 章节客户端链路单元测试（输出校验 + memory_patch 解析）
 * 运行：npm run test:chapter-client
 */
import type { WorkflowOutputs } from '../src/types/api'
import { validateChapterWorkflowOutputs } from '../electron/main/utils/chapter-output-validation'
import {
  coercePatchText,
  parseMemoryPatchFromRaw
} from '../electron/main/utils/memory-patch-parse'
import { stripThinkBlocks } from '../electron/main/utils/novel-text'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

const longBody = '第一章正文内容。'.repeat(80)

const withThink = `<think>内部推理</think>\n${longBody}`
assert(stripThinkBlocks(withThink) === longBody, 'strip think blocks')

const shortOutputs: WorkflowOutputs = {
  status: 'success',
  retry_count: 0,
  novel_body: '太短',
  video_script: '',
  memory_patch: ''
}
const shortCheck = validateChapterWorkflowOutputs(shortOutputs)
assert(!shortCheck.ok, 'reject short body')
assert(shortCheck.errors.some((e) => e.includes('正文过短')), 'short body error')

const goodOutputs: WorkflowOutputs = {
  status: 'success',
  retry_count: 1,
  retry_issues_formatted: '- [hard] lore: 测试',
  novel_body: longBody,
  video_script: '视频脚本'.repeat(20),
  memory_patch: JSON.stringify({
    globalSummaryDelta: '全局推进一句',
    chapterSummary: {
      chapterId: 'ch-001',
      summary: '周衍在边关发现密信',
      keyEvents: ['发现密信'],
      openThreads: ['密信来源']
    },
    foreshadowingUpdates: []
  })
}
const goodCheck = validateChapterWorkflowOutputs(goodOutputs)
assert(goodCheck.ok, 'accept valid outputs')
assert(goodCheck.warnings.length > 0, 'retry warning')

const patch = parseMemoryPatchFromRaw(goodOutputs.memory_patch)
assert(patch?.globalSummaryDelta === '全局推进一句', 'parse patch delta')
assert(
  patch?.chapterSummary &&
    typeof patch.chapterSummary === 'object' &&
    String((patch.chapterSummary as Record<string, unknown>).summary).includes('密信'),
  'parse chapter summary'
)

assert(coercePatchText({ summary: '嵌套摘要' }) === '嵌套摘要', 'coerce nested delta')

console.log('OK chapter client flow tests')
