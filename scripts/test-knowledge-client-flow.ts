/**
 * 知识库客户端链路单元测试（brief 表单合成 + Dify 合并）
 * 运行：npm run test:knowledge-client
 */
import type { KnowledgeDocument } from '../src/types/project'
import {
  buildKnowledgeBriefForm,
  collectKnowledgeExistingStats,
  composeKnowledgeBrief,
  validateKnowledgeBriefForm
} from '../src/utils/knowledge-brief-form'
import {
  mergeKnowledgeDocument,
  parseKnowledgeJson,
  validateMergedKnowledge
} from '../src/utils/knowledge-dify-merge'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

const mockDoc: KnowledgeDocument = {
  world: {
    title: '苍离大陆',
    rules: '低魔冷兵器',
    genre: '史诗',
    era: '架空',
    conflictFocus: '四国战争',
    magicConstraint: '低魔'
  },
  map: {
    version: 1,
    name: 'm',
    seed: 1,
    width: 100,
    height: 100,
    regions: [],
    rivers: [],
    nations: [
      {
        id: 'nation-001',
        name: '大晏',
        regionIds: [],
        government: '',
        culture: '',
        description: ''
      }
    ]
  },
  locations: [],
  characters: [{ id: 'char-001', name: '周衍', role: '主角斥候' }],
  factions: [],
  items: []
}

const stats = collectKnowledgeExistingStats(mockDoc)
assert(stats.nationCount === 1, 'nation count')
assert(stats.characterCount === 1, 'character count')

const form = buildKnowledgeBriefForm(mockDoc, 'expand')
assert(form.worldTitle === '苍离大陆', 'prefill world title')
assert(form.protagonist.includes('周衍'), 'prefill protagonist')
assert(form.whitelistNations.includes('大晏'), 'prefill nations')

const brief = composeKnowledgeBrief(form, 'expand', stats)
assert(brief.includes('周衍'), 'brief mentions protagonist')
assert(brief.includes('扩充'), 'expand mode hint')

assert(validateKnowledgeBriefForm(form) === null, 'form valid')

const difyJson = JSON.stringify({
  knowledge: {
    world: { title: '苍离大陆', rules: 'x'.repeat(90) },
    characters: [
      { id: 'char-001', name: '周衍', role: '主角' },
      { id: 'char-002', name: '苏晚晴', role: '军医' },
      { id: 'char-003', name: '魏武', role: '将军' }
    ],
    factions: [{ id: 'faction-001', name: '影阁', description: '秘密组织' }],
    items: [{ id: 'item-001', name: '魂玉', description: '灵炁媒介' }]
  }
})

const parsed = parseKnowledgeJson(difyJson)
assert(parsed?.characters.length === 3, 'parse characters')

const merged = mergeKnowledgeDocument(mockDoc, parsed!, 'expand')
const validation = validateMergedKnowledge(merged)
assert(validation.ok, 'merged knowledge valid')
assert(merged.characters.some((c) => c.name === '苏晚晴'), 'merged new character')

console.log('OK knowledge client flow tests')
