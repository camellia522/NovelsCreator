/**
 * 客户端大纲串行链路单元测试（占位章过滤、章 id 解析、outline_json 提取）
 * 运行：npm run test:outline-client
 */
import type { OutlineDocument } from '../src/types/project'
import {
  isPlaceholderChapter,
  nextChapterId,
  resolveOutlineGenerationChapterId
} from '../electron/main/utils/outline-chapter-id'
import {
  countChaptersInOutlineJson,
  extractGeneratedChapter
} from '../electron/main/utils/outline-chapter-merge'
import { isOutlineValidationPassed } from '../electron/main/utils/outline-bool-parse'

const SCAFFOLD: OutlineDocument = {
  volumes: [
    {
      id: 'vol-01',
      title: '第一卷',
      chapters: [
        {
          id: 'ch-001',
          title: '第一章',
          status: 'draft',
          beats: [
            { order: 1, text: '开篇建立场景与主角状态' },
            { order: 2, text: '引入本章核心冲突' }
          ]
        }
      ]
    }
  ]
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

// 占位 ch-001 时应继续生成 ch-001，而非 ch-002
assert(
  resolveOutlineGenerationChapterId(SCAFFOLD, 'vol-01') === 'ch-001',
  'placeholder chapter should resolve to ch-001'
)

const filled: OutlineDocument = {
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
            { order: 1, text: '周衍于赤城城头巡防发现可疑信使' },
            { order: 2, text: '温静带来青木帝国急报' },
            { order: 3, text: '密信指向玄朔边境异动' }
          ]
        }
      ]
    }
  ]
}

assert(isPlaceholderChapter(SCAFFOLD.volumes[0].chapters[0]), 'scaffold is placeholder')
assert(!isPlaceholderChapter(filled.volumes[0].chapters[0]), 'filled is not placeholder')
assert(
  resolveOutlineGenerationChapterId(filled, 'vol-01') === 'ch-002',
  'after ch-001 filled next is ch-002'
)
assert(nextChapterId(filled) === 'ch-002', 'nextChapterId')

const outlineJson = JSON.stringify({
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
            { order: 1, text: '周衍于赤城城头巡防' },
            { order: 2, text: '温静带来青木帝国急报' }
          ]
        }
      ]
    }
  ]
})

assert(countChaptersInOutlineJson(outlineJson) === 1, 'chapter count')
const ch = extractGeneratedChapter(outlineJson, 'ch-001')
assert(ch?.beats?.length === 2, 'extract chapter beats')

const validReport = JSON.stringify({
  outline_valid: true,
  outline_issues: []
})
assert(isOutlineValidationPassed(validReport), 'validation passed')

import { buildKnowledgeAnchorBrief } from '../electron/main/utils/outline-plot-memory'
import type { KnowledgeDocument } from '../src/types/project'

const mockKnowledge: KnowledgeDocument = {
  world: {
    title: '四帝国大陆',
    rules: '四大帝国割据的史诗大陆，无魔法',
    scene: '都市',
    scenePlace: '平京'
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
        name: '青木帝国',
        color: '#0f0',
        government: '',
        culture: '',
        description: ''
      }
    ]
  },
  locations: [{ id: 'loc-001', name: '文京', type: 'capital', x: 0, y: 0, terrain: 'plain', climate: '', description: '' }],
  characters: [{ id: 'char-001', name: '周衍', role: '主角' }],
  factions: [],
  items: []
}

const anchor = buildKnowledgeAnchorBrief(mockKnowledge)
assert(anchor.includes('周衍'), 'anchor includes protagonist')
assert(anchor.includes('青木帝国'), 'anchor includes nation from map')
assert(anchor.includes('文京'), 'anchor includes location')
assert(anchor.includes('都市') && anchor.includes('冲突'), 'anchor warns scene mismatch')

console.log('OK outline client flow tests')
