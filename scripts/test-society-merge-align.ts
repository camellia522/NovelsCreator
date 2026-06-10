/**
 * 验证大模型 loc-1 与本地 loc-001 能通过坐标对齐合并。
 */
import {
  alignLlmPatchesToLocalChunk,
  countMergedSocietyDescriptions,
  countSocietyLlmMatches,
  mergeSocietyWithLlm,
  normalizeLocationId,
  resolveLocalIdForLlmPatch
} from '../src/utils/world-territory-society'
import type { WorldLocation } from '../src/types/project'

const localLocs: WorldLocation[] = [
  {
    id: 'loc-001',
    name: '甲城',
    type: 'city',
    x: 25.5,
    y: 45.3,
    terrain: 'plain',
    climate: '温带',
    description: '本地简介',
    nationId: 'nation-001'
  },
  {
    id: 'loc-142',
    name: '乙城',
    type: 'town',
    x: 60.2,
    y: 55.1,
    terrain: 'plain',
    climate: '温带',
    description: '本地简介',
    nationId: 'nation-002'
  }
]

const llmPatches: WorldLocation[] = [
  {
    id: 'loc-1',
    name: '甲城润色',
    type: 'city',
    x: 25.5,
    y: 45.3,
    terrain: 'plain',
    climate: '温带',
    description: '大模型长文案甲',
    nationId: 'nation-001'
  },
  {
    id: 'loc-142',
    name: '乙城润色',
    type: 'town',
    x: 60.21,
    y: 55.09,
    terrain: 'plain',
    climate: '温带',
    description: '大模型长文案乙',
    nationId: 'nation-002'
  }
]

if (normalizeLocationId('loc-1') !== 'loc-001') throw new Error('normalizeLocationId')
if (resolveLocalIdForLlmPatch(llmPatches[0], localLocs) !== 'loc-001') {
  throw new Error('resolveLocalIdForLlmPatch loc-1')
}

const { matched, total } = countSocietyLlmMatches(localLocs, { locations: llmPatches })
if (matched !== 2 || total !== 2) throw new Error(`count ${matched}/${total}`)

const merged = mergeSocietyWithLlm(
  { worldRules: '', nations: [], locations: localLocs, source: 'local' },
  { locations: llmPatches },
  { version: 10, name: 't', seed: 1, width: 100, height: 100, regions: [], rivers: [] }
)
if (merged.locations[0].description !== '大模型长文案甲') throw new Error('merge description')

const mergedRules = mergeSocietyWithLlm(
  { worldRules: '本地草案背景', nations: [], locations: [], source: 'local' },
  { worldRules: '大模型润色后的世界背景', locations: [] },
  { version: 10, name: 't', seed: 1, width: 100, height: 100, regions: [], rivers: [] }
)
if (mergedRules.worldRules !== '大模型润色后的世界背景') {
  throw new Error('worldRules should prefer LLM narrative')
}

// 错误 id + 缺坐标：按批内顺序对齐
const batchIds = ['loc-001', 'loc-142']
const badPatches: WorldLocation[] = [
  { id: 'city-A', name: '甲城润色', type: 'city', terrain: 'plain', description: '批内顺序甲' } as WorldLocation,
  { id: 'city-B', name: '乙城润色', type: 'town', terrain: 'plain', description: '批内顺序乙' } as WorldLocation
]
const aligned = alignLlmPatchesToLocalChunk(badPatches, batchIds, localLocs)
if (aligned.get('loc-001')?.description !== '批内顺序甲') throw new Error('index align loc-001')
if (aligned.get('loc-142')?.description !== '批内顺序乙') throw new Error('index align loc-142')

const merged2 = mergeSocietyWithLlm(
  { worldRules: '', nations: [], locations: localLocs, source: 'local' },
  { locations: Array.from(aligned.values()) },
  { version: 10, name: 't', seed: 1, width: 100, height: 100, regions: [], rivers: [] }
)
const { polished } = countMergedSocietyDescriptions(localLocs, merged2.locations)
if (polished !== 2) throw new Error(`polished ${polished}`)

console.log('OK: society merge align', matched, '/', total, 'polished', polished)
