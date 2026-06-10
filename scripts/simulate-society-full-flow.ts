/**
 * 全流程模拟：本地选址 → territory brief 分批 → Dify 只回 6 条 → 解析/对齐/合并
 * 用于复现「模型返回 6 条、有文案 17/85」类问题。
 *
 * 运行：npm run test:society-flow
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { WorldLocation, WorldMapDocument, WorldNation } from '../src/types/project'
import type { WorldGenConfig } from '../src/types/world-gen'
import { extractSocietyOutputsFromDifyRaw, parseJsonLoose } from '../electron/main/utils/world-dify-parse'
import {
  SOCIETY_LLM_BATCH_SIZE,
  alignLlmPatchesToLocalChunk,
  buildLlmPatchMapForLocals,
  buildTerritoryBriefForLocationIds,
  buildTerritoryBriefJson,
  collectLocalDraftIdsFromBrief,
  countMergedSocietyDescriptions,
  mergeSocietyWithLlm,
  parseSocietyLlmPayload,
  summarizeTerritories
} from '../src/utils/world-territory-society'
import type { WorldGenResult } from '../src/types/world-gen'
import { HEX_GRID_LAYOUT_VERSION, ensureMapHexGrid } from '../src/utils/world-hex-grid'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function mockMap(nationCount: number, citiesPerNation: number): WorldMapDocument {
  ensureMapHexGrid({
    version: 10,
    name: 'sim',
    seed: 42,
    width: 100,
    height: 100,
    regions: [],
    rivers: [],
    hexGrid: { cols: 40, rows: 24, cells: [] }
  } as WorldMapDocument)
  const map = {
    version: 10,
    name: 'sim',
    seed: 42,
    width: 100,
    height: 100,
    regions: [] as WorldMapDocument['regions'],
    rivers: [],
    hexGrid: {
      cols: 40,
      rows: 24,
      cells: [],
      layoutVersion: HEX_GRID_LAYOUT_VERSION
    }
  } as WorldMapDocument
  const nations: WorldNation[] = []
  for (let n = 0; n < nationCount; n++) {
    const id = `nation-${String(n + 1).padStart(3, '0')}`
    nations.push({
      id,
      name: `国${n + 1}`,
      color: '#888',
      government: '联邦',
      culture: '农耕',
      description: ''
    })
    for (let c = 0; c < citiesPerNation; c++) {
      const i = n * citiesPerNation + c
      map.hexGrid!.cells.push({
        q: i % 40,
        r: Math.floor(i / 40) % 24,
        x: 10 + (i % 17) * 4.2,
        y: 15 + Math.floor(i / 17) * 3.8,
        terrain: 'plain',
        nationId: id,
        development: 40,
        heat: 0.5,
        wet: 0.5
      })
    }
  }
  map.nations = nations
  ensureMapHexGrid(map)
  return map
}

function mockPreview(cityCount: number): WorldGenResult {
  const nationCount = 5
  const per = Math.ceil(cityCount / nationCount)
  const map = mockMap(nationCount, per)
  const locations: WorldLocation[] = []
  let idx = 0
  for (const n of map.nations ?? []) {
    for (let c = 0; c < per && idx < cityCount; c++, idx++) {
      locations.push({
        id: `loc-${String(idx + 1).padStart(3, '0')}`,
        name: `城${idx + 1}`,
        type: idx % 5 === 0 ? 'capital' : 'city',
        x: 10 + (idx % 17) * 4.2,
        y: 15 + Math.floor(idx / 17) * 3.8,
        terrain: 'plain',
        climate: '温带',
        description: `本地算法简介-${idx + 1}`,
        nationId: n.id
      })
    }
  }
  return {
    worldRules: '',
    map,
    locations,
    nations: map.nations ?? [],
    source: 'procedural'
  }
}

/** 旧版错误合并：同一条 patch 可被多座城市通过坐标吸附 */
function mergeWithBuggyCoordReuse(
  local: ReturnType<typeof generateLocalSociety>,
  patches: WorldLocation[]
): number {
  let polished = 0
  const before = new Map(local.locations.map((l) => [l.id, (l.description ?? '').trim()]))
  for (const loc of local.locations) {
    let patch: WorldLocation | undefined
    for (const p of patches) {
      const dx = Math.abs(loc.x - (Number(p.x) || 0))
      const dy = Math.abs(loc.y - (Number(p.y) || 0))
      if (dx + dy < 8 && p.description?.trim()) {
        patch = p
        break
      }
    }
    if (!patch) continue
    const next = patch.description!.trim()
    const prev = before.get(loc.id) ?? ''
    if (next && next !== prev) polished++
  }
  return polished
}

function loadDifyEndFixture(): Record<string, unknown> {
  const p = join(root, 'dify/world/fixtures/w2s-end-user-sample.json')
  const j = JSON.parse(readFileSync(p, 'utf8')) as { society_json?: string; status?: string }
  return {
    status: j.status ?? 'success',
    society_json: j.society_json,
    nations_json: '',
    locations_json: '',
    world_rules: ''
  }
}

function simulateDifyBatch(
  briefJson: string,
  chunkIds: string[],
  localLocs: WorldLocation[],
  endOutputs: Record<string, unknown>
): { returned: number; aligned: number; patches: WorldLocation[] } {
  const meta = JSON.parse(briefJson) as { projectConfig?: { localLocationCount?: number } }
  const expected = meta.projectConfig?.localLocationCount ?? chunkIds.length

  const extracted = extractSocietyOutputsFromDifyRaw(endOutputs)
  if (!extracted) return { returned: 0, aligned: 0, patches: [] }

  const parsed = parseSocietyLlmPayload({
    society_json: extracted.society_json,
    nations_json: extracted.nations_json,
    locations_json: extracted.locations_json,
    world_rules: extracted.world_rules
  })
  const returned = parsed?.locations?.length ?? 0

  const aligned = alignLlmPatchesToLocalChunk(parsed?.locations ?? [], chunkIds, localLocs)
  console.log(
    `  批内 local_location_count=${expected} | Dify locations=${returned} | 对齐=${aligned.size} | 缺 ${Math.max(0, expected - returned)} 条`
  )
  return { returned, aligned: aligned.size, patches: Array.from(aligned.values()) }
}

async function main(): Promise<void> {
  const TOTAL = 85
  const config: WorldGenConfig = {
    worldName: '模拟世界',
    era: '架空',
    atmosphere: ['史诗'],
    scale: 'continent',
    climate: 'mixed',
    cityCount: 8,
    includeLandmarks: true,
    seed: 42
  }

  console.log('=== 1. 本地选址（模拟 85 城，跳过 hex 行省算法）===')
  const preview = mockPreview(TOTAL)
  const local = {
    worldRules: '本地规则',
    nations: preview.nations,
    locations: preview.locations,
    source: 'local' as const
  }
  console.log(`  本地城市数: ${local.locations.length}`)
  console.log(`  领土摘要国数: ${summarizeTerritories(preview.map, preview.map.nations ?? [], config).length}`)

  let territoryBriefJson = buildTerritoryBriefJson(preview.map, preview.map.nations ?? [], config, {
    localDraft: local
  })
  let allIds = collectLocalDraftIdsFromBrief(territoryBriefJson)
  if (!allIds.length) {
    territoryBriefJson = JSON.stringify({
      schemaVersion: 3,
      projectConfig: {
        worldName: config.worldName,
        era: config.era,
        atmosphere: config.atmosphere,
        localLocationCount: TOTAL,
        cityCount: TOTAL
      },
      nations: [
        {
          nationId: 'nation-001',
          name: '模拟国',
          spatial: {
            localDraftLocations: local.locations.map((loc) => ({
              id: loc.id,
              type: loc.type,
              x: loc.x,
              y: loc.y,
              terrain: loc.terrain,
              name: loc.name,
              nationId: loc.nationId
            }))
          }
        }
      ]
    })
    allIds = collectLocalDraftIdsFromBrief(territoryBriefJson)
  }
  console.log(`  territory brief localDraft ids: ${allIds.length}`)

  console.log('\n=== 2. 客户端分批（每批', SOCIETY_LLM_BATCH_SIZE, '座）===')
  const batchCount = Math.ceil(allIds.length / SOCIETY_LLM_BATCH_SIZE)
  console.log(`  批次数: ${batchCount}`)

  const endFixture = loadDifyEndFixture()
  const rootParsed = parseJsonLoose<{ locations?: WorldLocation[] }>(
    String(endFixture.society_json),
    {}
  )
  const templateLocs = (rootParsed.locations ?? []).slice(0, 6)
  console.log(`  Dify 样例 END 仅含 ${templateLocs.length} 条 locations（模拟模型只回 6 城）`)

  console.log('\n=== 3. 逐批：brief → Dify END → parse → align ===')
  const locById = new Map<string, WorldLocation>()
  for (let b = 0; b < batchCount; b++) {
    const chunk = allIds.slice(b * SOCIETY_LLM_BATCH_SIZE, (b + 1) * SOCIETY_LLM_BATCH_SIZE)
    const brief = buildTerritoryBriefForLocationIds(territoryBriefJson, chunk, {
      batchIndex: b,
      batchCount,
      totalCount: allIds.length
    })
    const briefMeta = JSON.parse(brief) as { projectConfig?: { localLocationCount?: number; societyBatch?: unknown } }
    console.log(`\n  第 ${b + 1}/${batchCount} 批 chunk=${chunk.length} brief.localLocationCount=${briefMeta.projectConfig?.localLocationCount}`)

    const batchPatches: WorldLocation[] = chunk.map((id, i) => {
      const localLoc = local.locations.find((l) => l.id === id)!
      const tpl = templateLocs[i % templateLocs.length]
      return {
        ...tpl,
        id: tpl.id,
        name: `${tpl.name}-批${b + 1}-${i + 1}`,
        x: localLoc.x,
        y: localLoc.y,
        nationId: localLoc.nationId,
        description: `Dify润色-批${b + 1}-城${id}`
      }
    })
    const fakeEnd = {
      status: 'success',
      society_json: JSON.stringify({
        world_rules: '模拟',
        nations: [],
        locations: batchPatches.slice(0, 6)
      })
    }

    const { aligned, patches } = simulateDifyBatch(brief, chunk, local.locations, fakeEnd)
    for (const p of patches) locById.set(p.id, p)
    void aligned
  }

  const allPatches = Array.from(locById.values())
  console.log('\n=== 4. 合并与统计 ===')
  console.log(`  累计对齐条数 locById: ${allPatches.length}`)

  const buggyPolished = mergeWithBuggyCoordReuse(local, allPatches)
  const merged = mergeSocietyWithLlm(local, { locations: allPatches, source: 'llm' }, preview.map)
  const { polished } = countMergedSocietyDescriptions(local.locations, merged.locations)
  const patchMap = buildLlmPatchMapForLocals(allPatches, local.locations)

  console.log(`  旧逻辑（坐标复用 patch）虚高「有文案」: ${buggyPolished}/${TOTAL}`)
  console.log(`  新逻辑（一对一 patchMap）真实润色: ${polished}/${TOTAL} | patchMap.size=${patchMap.size}`)

  if (buggyPolished > allPatches.length + 2) {
    console.log('  => 根因 A：合并时同一条 Dify 结果被多城复用，统计虚高')
  }
  if (allPatches.length < TOTAL * 0.5) {
    console.log('  => 根因 B：Dify/W2S 每批只回 ~6 条，未满足 local_location_count（见 prompt 与 max_tokens）')
  }

  console.log('\n=== 5. creative_brief 片段（第 1 批）===')
  const brief0 = buildTerritoryBriefForLocationIds(territoryBriefJson, allIds.slice(0, SOCIETY_LLM_BATCH_SIZE), {
    batchIndex: 0,
    batchCount,
    totalCount: allIds.length
  })
  const meta0 = JSON.parse(brief0).projectConfig as Record<string, unknown>
  console.log('  projectConfig.societyBatch:', meta0.societyBatch)
  console.log('  projectConfig.localLocationCount:', meta0.localLocationCount)

  console.log('\n模拟完成。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
