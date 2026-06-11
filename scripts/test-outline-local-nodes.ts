/**
 * 本地大纲 Code 节点 TS 移植测试（无需 LLM / Dify）
 */
import { runO1XNode } from '../electron/main/workflows/local/nodes/outline/o1x.node'
import { runAggNode } from '../electron/main/workflows/local/nodes/outline/agg.node'
import {
  runEndOkNode,
  runParseEndOutputs,
  runRetryEndNode
} from '../electron/main/workflows/local/nodes/outline/end-nodes'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

// O1X structured output
const o1Payload = {
  outline_summary: '周衍在赤城边关发现敌国密使。',
  outline: {
    volumes: [
      {
        id: 'vol-01',
        title: '第一卷',
        chapters: [
          {
            id: 'ch-001',
            title: '边关密使',
            status: 'draft',
            beats: [
              { order: 1, text: '周衍于赤城城头巡防，发现可疑信使' },
              { order: 2, text: '温静带来青木帝国急报' },
              { order: 3, text: '密信指向玄朔帝国边境异动' }
            ]
          }
        ]
      }
    ]
  }
}
const o1x = runO1XNode({ o1_result: '', structured_output: o1Payload })
const doc = JSON.parse(o1x.outline_json)
assert(doc.volumes[0].chapters.length === 1, 'O1X chapters')
assert(doc.volumes[0].chapters[0].beats.length === 3, 'O1X beats')

// summary-only → AGG circuit_break
const summaryOnly = JSON.stringify({
  outline_summary: '只有摘要无结构',
  outline: { volumes: [] }
})
const emptyO1x = runO1XNode({ o1_result: summaryOnly })
const routed = runAggNode({
  validate_result: JSON.stringify({ outline_valid: false, outline_issues: [{ severity: 'hard' }] }),
  retry_count: 3,
  max_retry: 3,
  outline_json: emptyO1x.outline_json
})
assert(routed.route === 'circuit_break', 'AGG circuit_break')
assert(routed.retry_issues_formatted.includes('无有效章节'), 'AGG hard issue')

// happy path
const validAgg = runAggNode({
  validate_result: JSON.stringify({
    outline_valid: true,
    outline_issues: [],
    structure_score: 90,
    beat_quality_score: 85,
    lore_consistency_score: 88,
    chapter_count_ok: true,
    volume_balance_ok: true
  }),
  retry_count: 0,
  max_retry: 3,
  outline_json: o1x.outline_json
})
assert(validAgg.route === 'continue', 'AGG continue')

const endOk = runEndOkNode({
  outline_summary: o1x.outline_summary,
  outline_json: validAgg.outline_json,
  validation_report: validAgg.validation_report,
  retry_count: 0
})
const flat = runParseEndOutputs({ ok_end_outputs: endOk.end_outputs })
assert(flat.status === 'success', 'PARSE success')

const retryEnd = runRetryEndNode({
  outline_json: o1x.outline_json,
  outline_summary: o1x.outline_summary,
  retry_count: 1,
  retry_issues_formatted: '- [hard] test',
  validation_report: validAgg.validation_report
})
const retryFlat = runParseEndOutputs({ re_end_outputs: retryEnd.end_outputs })
assert(retryFlat.status === 'retry', 'PARSE retry')

console.log('[test:outline-local-nodes] all passed')
