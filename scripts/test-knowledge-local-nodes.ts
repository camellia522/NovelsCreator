/**
 * 本地知识库 Code 节点 TS 移植测试（无需 LLM / Dify）
 */
import { runK1XNode } from '../electron/main/workflows/local/nodes/knowledge/k1x.node'
import { runKnowledgeAggNode } from '../electron/main/workflows/local/nodes/knowledge/agg.node'
import {
  runKnowledgeEndOkNode,
  runKnowledgeParseEndOutputs,
  runKnowledgeRetryEndNode
} from '../electron/main/workflows/local/nodes/knowledge/end-nodes'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

const k1Payload = {
  knowledge_summary: '边关斥候周衍卷入四国权谋，密信指向地下妖市。',
  knowledge: {
    world: {
      title: 'NewWorld',
      rules: '冷兵器低魔大陆，禁止修仙与穿越；权谋与边境战争为主轴，魔法仅表现为稀世异象与古老盟约，不可大规模施法。',
      conflictFocus: '边境谍战与四国盟约'
    },
    characters: [
      { id: 'char-001', name: '周衍', role: '主角', traits: ['冷静'] },
      { id: 'char-002', name: '沈青', role: '盟友', traits: ['机敏'] },
      { id: 'char-003', name: '韩烈', role: '反派', traits: ['狠辣'] }
    ],
    factions: [
      {
        id: 'faction-001',
        name: '天机阁',
        description: '暗中监视边境密信的神秘组织',
        goals: '控制盟约'
      }
    ],
    items: [{ id: 'item-001', name: '匿名密信', description: '指向地下妖市的线索' }]
  }
}

const k1x = runK1XNode({ k1_result: JSON.stringify(k1Payload) })
assert(Boolean(k1x.knowledge_summary), 'K1X summary')
const doc = JSON.parse(k1x.knowledge_json)
assert(doc.world.title === 'NewWorld', 'K1X world title')
assert(doc.characters.length >= 3, 'K1X characters')

const validAgg = runKnowledgeAggNode({
  validate_result: JSON.stringify({
    knowledge_valid: true,
    knowledge_issues: [],
    structure_score: 92,
    lore_consistency_score: 88,
    character_coverage_ok: true
  }),
  retry_count: 0,
  max_retry: 3,
  knowledge_json: k1x.knowledge_json
})
assert(validAgg.route === 'continue', 'AGG continue')

const endOk = runKnowledgeEndOkNode({
  knowledge_summary: k1x.knowledge_summary,
  knowledge_json: validAgg.knowledge_json,
  validation_report: validAgg.validation_report,
  retry_count: 0
})
const flat = runKnowledgeParseEndOutputs({ ok_end_outputs: endOk.end_outputs })
assert(flat.status === 'success', 'PARSE success')
assert(String(flat.knowledge_json).includes('NewWorld'), 'PARSE knowledge_json')

// empty structure → circuit_break at max retry
const emptyK1x = runK1XNode({
  k1_result: JSON.stringify({ knowledge_summary: '只有摘要', knowledge: { world: {}, characters: [] } })
})
const emptyAgg = runKnowledgeAggNode({
  validate_result: '{}',
  retry_count: 3,
  max_retry: 3,
  knowledge_json: emptyK1x.knowledge_json
})
assert(emptyAgg.route === 'circuit_break', 'AGG empty circuit_break')

const retryEnd = runKnowledgeRetryEndNode({
  knowledge_json: k1x.knowledge_json,
  knowledge_summary: k1x.knowledge_summary,
  retry_count: 1,
  retry_issues_formatted: '- [hard] test',
  validation_report: validAgg.validation_report
})
const retryFlat = runKnowledgeParseEndOutputs({ re_end_outputs: retryEnd.end_outputs })
assert(retryFlat.status === 'retry', 'PARSE retry')

console.log('[test:knowledge-local-nodes] all passed')
