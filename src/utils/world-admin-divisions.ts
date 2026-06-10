/**
 * 行省 → 府州 → 县 分层区划与聚落选址（地形阻隔、省会均匀、省域不宜过小）
 */

import type {
  MapHexCell,
  MapRegion,
  TerrainType,
  WorldLocation,
  WorldMapDocument,
  WorldNation
} from '@/types/project'
import type { WorldGenConfig } from '@/types/world-gen'
import { ensureMapHexGrid, hexGridDistance, hexNeighborCoords, createHexLayout, hexId, percentToHex } from '@/utils/world-hex-grid'
import {
  ADMIN_ROLE,
  isProvincialAdminRole,
  parseAdminRegionName,
  parseAdminRole,
  setLocationAdminRole
} from '@/utils/world-location-marker'
import { nationColor, pointInPolygon } from '@/utils/world-map-territory'
import {
  formatCapitalName,
  formatCountyAdminName,
  formatCountySeatName,
  formatPrefectureAdminName,
  formatPrefectureSeatName,
  formatProvinceAdminName,
  formatProvincialSeatName,
  formatTownName,
  extractSeatStem,
  namingProfileForNation,
  type PlaceNamingProfile,
  westernDirectionPrefix
} from '@/utils/world-place-naming'
import { truncateChinesePlaceName } from '@/utils/world-place-name-zh'
import { seededRandom } from '@/utils/world-noise'
import type { TerritoryNationSummary } from '@/utils/world-territory-society'

/** 行省目标规模：领土越大，单省可容纳略多格，但总数仍随格数增长 */
const MIN_PROVINCE_CELLS = 18
const MIN_PREFECTURE_CELLS = 10
const MIN_COUNTY_CELLS = 6
/** 山地/强阻隔边代价阈值：超过则视为不同地形单元 */
const TERRAIN_BARRIER_COST = 5

/** 辖区明显偏一方时，仅部分区划名前缀方位字 */
const DIRECTIONAL_NAME_CHANCE = 0.28

const LEADING_DIRECTIONS = ['东北', '西北', '东南', '西南', '东', '西', '南', '北'] as const
const COUNTY_PREFIX = ['安', '平', '宁', '远', '新', '昌', '文', '武', '清', '河', '云', '岚']

const TERRAIN_CN: Record<TerrainType, string> = {
  ocean: '海洋',
  coast: '海岸',
  plain: '平原',
  hill: '丘陵',
  mountain: '山地',
  forest: '森林',
  desert: '沙漠',
  wetland: '湿地'
}

export type ScoreCellFn = (cell: MapHexCell, summary?: TerritoryNationSummary) => number

/** 聚落选址用陆格：优先温带/暖区，避免都城落在极地雪带（除非全国都在高纬） */
export function cellsForSettlementPlacement(cells: MapHexCell[]): MapHexCell[] {
  const land = cells.filter((c) => c.terrain !== 'ocean')
  if (!land.length) return []
  const warm = land.filter((c) => (c.heat ?? 0.5) >= 0.28)
  if (warm.length >= Math.max(8, Math.floor(land.length * 0.12))) return warm
  const mild = land.filter((c) => (c.heat ?? 0.5) >= 0.18)
  return mild.length ? mild : land
}

export const CELLS_PER_PROVINCE_MIN = 18
export const CELLS_PER_PROVINCE_MAX = 60
export const CELLS_PER_PROVINCE_DEFAULT = 30

export interface ProvincePreviewItem {
  id: string
  nationId: string
  name: string
  cells: MapHexCell[]
  landHexCount: number
}

type AdminLevel = 'province' | 'prefecture' | 'county'

interface AdminNode {
  id: string
  name: string
  level: AdminLevel
  cells: MapHexCell[]
  children: AdminNode[]
}

function cellKey(c: MapHexCell): string {
  return `${c.q},${c.r}`
}

function hexMoveCost(from: MapHexCell, to: MapHexCell): number {
  if (to.terrain === 'ocean') return Infinity
  let cost = 1
  const hard = (t: TerrainType) => t === 'mountain' || t === 'ocean'
  if (hard(from.terrain) || hard(to.terrain)) cost += 8
  else if (from.terrain === 'hill' || to.terrain === 'hill') cost += 2.5
  else if (from.terrain === 'forest' || to.terrain === 'forest') cost += 0.6
  if (from.terrain === 'wetland' || to.terrain === 'wetland') cost += 0.8
  return cost
}

function buildCellIndex(cells: MapHexCell[]): Map<string, MapHexCell> {
  return new Map(cells.map((c) => [cellKey(c), c]))
}

/** 多源 BFS：按六边形步数将格划归最近种子（O(格数)，避免每步 sort 卡死 UI） */
function partitionBySeeds(
  cells: MapHexCell[],
  seeds: MapHexCell[],
  index: Map<string, MapHexCell>,
  cols: number,
  rows: number
): MapHexCell[][] {
  const allowed = new Set(cells.map(cellKey))
  const owner = new Map<string, number>()
  const dist = new Map<string, number>()
  const queue: { key: string; d: number; seed: number }[] = []

  for (let i = 0; i < seeds.length; i++) {
    const k = cellKey(seeds[i])
    if (!allowed.has(k)) continue
    dist.set(k, 0)
    owner.set(k, i)
    queue.push({ key: k, d: 0, seed: i })
  }

  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]!
    if (cur.d > (dist.get(cur.key) ?? Infinity)) continue
    const cell = index.get(cur.key)
    if (!cell) continue
    for (const nb of hexNeighborCoords(cell.q, cell.r, cols, rows)) {
      const nk = `${nb.q},${nb.r}`
      if (!allowed.has(nk)) continue
      const nd = cur.d + 1
      if (nd >= (dist.get(nk) ?? Infinity)) continue
      dist.set(nk, nd)
      owner.set(nk, cur.seed)
      queue.push({ key: nk, d: nd, seed: cur.seed })
    }
  }

  const groups: MapHexCell[][] = seeds.map(() => [])
  for (const c of cells) {
    const o = owner.get(cellKey(c))
    if (o != null && groups[o]) groups[o].push(c)
  }
  return groups.filter((g) => g.length > 0)
}

function pickSpreadSeeds(
  cells: MapHexCell[],
  count: number,
  scoreFn: ScoreCellFn,
  summary: TerritoryNationSummary,
  index: Map<string, MapHexCell>,
  cols: number,
  rows: number
): MapHexCell[] {
  if (count <= 1) {
    return [
      [...cells].sort((a, b) => scoreFn(b, summary) - scoreFn(a, summary))[0]
    ]
  }
  const allowed = new Set(cells.map(cellKey))
  const seeds: MapHexCell[] = []
  const sorted = [...cells].sort((a, b) => scoreFn(b, summary) - scoreFn(a, summary))
  seeds.push(sorted[0])

  while (seeds.length < count && seeds.length < cells.length) {
    let best: MapHexCell | null = null
    let bestMin = -1
    for (const c of cells) {
      let minD = Infinity
      for (const s of seeds) {
        minD = Math.min(
          minD,
          hexGridDistance({ q: c.q, r: c.r }, { q: s.q, r: s.r }, cols, rows)
        )
      }
      if (minD > bestMin) {
        bestMin = minD
        best = c
      }
    }
    if (!best || seeds.some((s) => s.q === best!.q && s.r === best!.r)) break
    seeds.push(best)
  }
  return seeds
}

function resolveProvinceCellTarget(landHexCount: number, override?: number): number {
  if (
    override != null &&
    override >= CELLS_PER_PROVINCE_MIN &&
    override <= CELLS_PER_PROVINCE_MAX
  ) {
    return override
  }
  return targetCellsPerProvince(landHexCount, 'province')
}

function targetCellsPerProvince(landHexCount: number, level: AdminLevel = 'province'): number {
  if (level === 'county') return MIN_COUNTY_CELLS + 2
  if (level === 'prefecture') {
    if (landHexCount < 30) return MIN_PREFECTURE_CELLS + 4
    if (landHexCount < 80) return MIN_PREFECTURE_CELLS + 6
    return MIN_PREFECTURE_CELLS + 10
  }
  // 行省：先总格数 ÷ 目标规模 → 省数；大国单省略大以免省名爆炸
  if (landHexCount < 36) return 18
  if (landHexCount < 90) return 24
  if (landHexCount < 200) return 30
  if (landHexCount < 450) return 36
  if (landHexCount < 900) return 42
  return 48
}

/** 总陆格 ÷ 目标规模 → 基础行省数（下限 1，无硬顶） */
function computeBaseProvinceCount(landHexCount: number, cellsPerProvinceTarget?: number): number {
  const target = resolveProvinceCellTarget(landHexCount, cellsPerProvinceTarget)
  return Math.max(1, Math.floor(landHexCount / target))
}

export function estimateProvinceCount(landHexCount: number, cellsPerProvinceTarget?: number): number {
  if (landHexCount <= 0) return 0
  const stub = { length: landHexCount } as MapHexCell[]
  return planProvinceCount(stub, [stub], cellsPerProvinceTarget)
}

/** 按地形阻隔切分为可通行单元（山地/强边界分开） */
function findTerrainCompartments(
  cells: MapHexCell[],
  index: Map<string, MapHexCell>,
  cols: number,
  rows: number
): MapHexCell[][] {
  const allowed = new Set(cells.map(cellKey))
  const visited = new Set<string>()
  const out: MapHexCell[][] = []

  for (const start of cells) {
    const sk = cellKey(start)
    if (visited.has(sk)) continue
    const compartment: MapHexCell[] = []
    const queue: MapHexCell[] = [start]
    visited.add(sk)

    while (queue.length) {
      const cur = queue.shift()!
      compartment.push(cur)
      for (const nb of hexNeighborCoords(cur.q, cur.r, cols, rows)) {
        const nk = `${nb.q},${nb.r}`
        if (!allowed.has(nk) || visited.has(nk)) continue
        const next = index.get(nk)
        if (!next) continue
        if (hexMoveCost(cur, next) >= TERRAIN_BARRIER_COST) continue
        visited.add(nk)
        queue.push(next)
      }
    }
    out.push(compartment)
  }
  return out.sort((a, b) => b.length - a.length)
}

/** 地形单元内再估行省数，与「总格÷规模」取较大值 */
function planProvinceCount(
  cells: MapHexCell[],
  compartments: MapHexCell[][],
  cellsPerProvinceTarget?: number
): number {
  const landHexCount = cells.length
  const baseCount = computeBaseProvinceCount(landHexCount, cellsPerProvinceTarget)

  let terrainCount = 0
  for (const comp of compartments) {
    if (comp.length < MIN_PROVINCE_CELLS) continue
    const localTarget = resolveProvinceCellTarget(comp.length, cellsPerProvinceTarget)
    terrainCount += Math.max(1, Math.floor(comp.length / localTarget))
  }
  for (const comp of compartments) {
    if (comp.length >= MIN_PROVINCE_CELLS) continue
    terrainCount += 1
  }

  let planned = Math.max(baseCount, terrainCount, 1)
  // 若平均省域过小则减省；过大则按地形单元再加
  while (planned > 1 && landHexCount / planned < MIN_PROVINCE_CELLS) planned--
  return planned
}

/** 按各地形单元面积比例分配省种子数 */
function allocateSeedsToCompartments(
  compartments: MapHexCell[][],
  totalSeeds: number
): number[] {
  const n = compartments.length
  if (!n) return [totalSeeds]
  const weights = compartments.map((c) => c.length)
  const sumW = weights.reduce((a, b) => a + b, 0)
  if (!sumW) return [totalSeeds]

  const raw = weights.map((w) => Math.floor((w / sumW) * totalSeeds))
  for (let i = 0; i < n; i++) {
    if (compartments[i].length >= MIN_PROVINCE_CELLS && raw[i] === 0) raw[i] = 1
  }
  let sum = raw.reduce((a, b) => a + b, 0)
  while (sum < totalSeeds) {
    let best = 0
    for (let i = 1; i < n; i++) {
      if (weights[i] / (raw[i] + 1) > weights[best] / (raw[best] + 1)) best = i
    }
    raw[best]++
    sum++
  }
  while (sum > totalSeeds) {
    const i = raw.findIndex((v) => v > 1)
    if (i < 0) break
    raw[i]--
    sum--
  }
  return raw
}

function pickProvinceSeedsByTerrain(
  cells: MapHexCell[],
  numProv: number,
  compartments: MapHexCell[][],
  scoreFn: ScoreCellFn,
  summary: TerritoryNationSummary,
  index: Map<string, MapHexCell>,
  cols: number,
  rows: number
): MapHexCell[] {
  const eligible = compartments.filter((c) => c.length >= Math.floor(MIN_PROVINCE_CELLS * 0.6))
  const pool = eligible.length ? eligible : compartments
  const alloc = allocateSeedsToCompartments(pool, numProv)
  const seeds: MapHexCell[] = []

  for (let i = 0; i < pool.length; i++) {
    const k = alloc[i] ?? 0
    if (k <= 0) continue
    seeds.push(...pickSpreadSeeds(pool[i], k, scoreFn, summary, index, cols, rows))
  }

  if (seeds.length >= numProv) return seeds.slice(0, numProv)
  if (seeds.length === 0) {
    return pickSpreadSeeds(cells, numProv, scoreFn, summary, index, cols, rows)
  }
  while (seeds.length < numProv) {
    const extra = pickSpreadSeeds(cells, numProv, scoreFn, summary, index, cols, rows)
    for (const s of extra) {
      if (seeds.length >= numProv) break
      if (!seeds.some((x) => x.q === s.q && x.r === s.r)) seeds.push(s)
    }
    break
  }
  return seeds
}

/** 合并过小行省到邻省（优先共享低代价边界的邻省） */
function mergeSmallProvinces(
  groups: MapHexCell[][],
  minCells: number,
  index: Map<string, MapHexCell>,
  cols: number,
  rows: number
): MapHexCell[][] {
  let result = groups.map((g) => [...g])
  let guard = 0
  while (guard++ < 48) {
    const smallIdx = result.findIndex((g) => g.length > 0 && g.length < minCells)
    if (smallIdx < 0) break

    let bestNeighbor = -1
    let bestBorder = -1

    for (let j = 0; j < result.length; j++) {
      if (j === smallIdx || !result[j].length) continue
      let border = 0
      for (const c of result[smallIdx]) {
        for (const nb of hexNeighborCoords(c.q, c.r, cols, rows)) {
          const other = index.get(`${nb.q},${nb.r}`)
          if (!other) continue
          if (result[j].some((x) => x.q === nb.q && x.r === nb.r)) {
            border += 1 / Math.max(1, hexMoveCost(c, other))
          }
        }
      }
      if (border > bestBorder) {
        bestBorder = border
        bestNeighbor = j
      }
    }

    if (bestNeighbor < 0) break
    result[bestNeighbor].push(...result[smallIdx])
    result[smallIdx] = []
  }
  return result.filter((g) => g.length > 0)
}

export interface NationGeoRef {
  cx: number
  cy: number
  spanX: number
  spanY: number
}

export function nationGeoRefFromCells(cells: MapHexCell[]): NationGeoRef {
  const xs = cells.map((c) => c.x)
  const ys = cells.map((c) => c.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    spanX: Math.max(4, maxX - minX),
    spanY: Math.max(4, maxY - minY)
  }
}

function centroidOfCells(cells: MapHexCell[]): { x: number; y: number } {
  if (!cells.length) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  for (const c of cells) {
    sx += c.x
    sy += c.y
  }
  return { x: sx / cells.length, y: sy / cells.length }
}

/** 相对本国/上级辖区中心的大致方位（x 东增、y 南增，与地图极值一致） */
export function compassLabelForPoint(
  x: number,
  y: number,
  ref: NationGeoRef
): string {
  const dx = x - ref.cx
  const dy = y - ref.cy
  const threshX = Math.max(2, ref.spanX * 0.08)
  const threshY = Math.max(2, ref.spanY * 0.08)
  if (Math.abs(dx) < threshX && Math.abs(dy) < threshY) return '中'

  let ew = ''
  let ns = ''
  if (dx > threshX) ew = '东'
  else if (dx < -threshX) ew = '西'
  if (dy > threshY) ns = '南'
  else if (dy < -threshY) ns = '北'

  if (ew && ns) {
    if (ns === '北' && ew === '东') return '东北'
    if (ns === '北' && ew === '西') return '西北'
    if (ns === '南' && ew === '东') return '东南'
    if (ns === '南' && ew === '西') return '西南'
  }
  return ew || ns || '中'
}

export function compassLabelForCells(cells: MapHexCell[], ref: NationGeoRef): string {
  const c = centroidOfCells(cells)
  return compassLabelForPoint(c.x, c.y, ref)
}

/** 供社会层润色：相对本国中心的方位说明 */
export function compassHintLabel(x: number, y: number, ref: NationGeoRef): string {
  const label = compassLabelForPoint(x, y, ref)
  if (label === '中') return '腹地（相对本国中心）'
  return `${label}境（相对本国中心）`
}

export function nameHasLeadingDirection(name: string): boolean {
  return LEADING_DIRECTIONS.some((d) => name.startsWith(d))
}

function leadingDirectionInName(name: string): (typeof LEADING_DIRECTIONS)[number] | null {
  for (const d of LEADING_DIRECTIONS) {
    if (name.startsWith(d)) return d
  }
  return null
}

/** 仅当名称以方位字开头时，按坐标校正；无方位字则不改名 */
export function alignDirectionInPlaceName(
  name: string,
  x: number,
  y: number,
  ref: NationGeoRef
): string {
  const found = leadingDirectionInName(name)
  if (!found) return name
  const correct = compassLabelForPoint(x, y, ref)
  if (correct === '中') return name.slice(found.length) || name
  if (found === correct) return name
  return correct + name.slice(found.length)
}

function maybeDirectionalPrefix(
  geo: string,
  rand: () => number,
  profile: PlaceNamingProfile
): string {
  if (geo === '中') return ''
  if (rand() >= DIRECTIONAL_NAME_CHANCE) return ''
  if (profile.style === 'western' || profile.style === 'fantasy') {
    const w = westernDirectionPrefix(geo)
    return w ? `${w} ` : ''
  }
  return geo
}

/** 按各国陆格范围构建方位参考（社会层合并/校验用） */
export function nationGeoRefByNationId(map: WorldMapDocument): Map<string, NationGeoRef> {
  ensureMapHexGrid(map)
  const byNation = new Map<string, MapHexCell[]>()
  for (const c of map.hexGrid!.cells) {
    if (!c.nationId || c.terrain === 'ocean') continue
    const list = byNation.get(c.nationId) ?? []
    list.push(c)
    byNation.set(c.nationId, list)
  }
  const out = new Map<string, NationGeoRef>()
  for (const [nationId, cells] of byNation) {
    if (cells.length) out.set(nationId, nationGeoRefFromCells(cells))
  }
  return out
}

export function guardLocationDirectionNames(
  locations: WorldLocation[],
  geoRefByNation: Map<string, NationGeoRef>
): WorldLocation[] {
  return locations.map((loc) => {
    const ref = loc.nationId ? geoRefByNation.get(loc.nationId) : undefined
    if (!ref) return loc
    const aligned = alignDirectionInPlaceName(loc.name, loc.x, loc.y, ref)
    const name = truncateChinesePlaceName(aligned)
    return name === loc.name ? loc : { ...loc, name }
  })
}

function uniqueAdminName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let n = 2
  while (used.has(`${base}${n}`)) n++
  const out = `${base}${n}`
  used.add(out)
  return out
}

function provinceDisplayName(
  group: MapHexCell[],
  nationRef: NationGeoRef,
  short: string,
  fallbackIndex: number,
  used: Set<string>,
  rand: () => number,
  profile: PlaceNamingProfile
): string {
  const stem = profile.provinceStems[fallbackIndex % profile.provinceStems.length]
  const geo = group.length ? compassLabelForCells(group, nationRef) : '中'
  const dir = maybeDirectionalPrefix(geo, rand, profile)
  let name = uniqueAdminName(formatProvinceAdminName(profile, stem, short, dir), used)
  if (group.length) {
    const c = centroidOfCells(group)
    name = alignDirectionInPlaceName(name, c.x, c.y, nationRef)
  }
  return name
}

function computeSubCount(cellCount: number, minCells: number, maxParts: number): number {
  if (cellCount < minCells * 2) return 0
  const bySize = Math.floor(cellCount / minCells)
  return Math.max(2, Math.min(maxParts, bySize))
}

function bboxPolygon(cells: MapHexCell[]): [number, number][] {
  const xs = cells.map((c) => c.x)
  const ys = cells.map((c) => c.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY]
  ]
}

function subdivideNode(
  cells: MapHexCell[],
  level: AdminLevel,
  idPrefix: string,
  nationRef: NationGeoRef,
  partIndex: number,
  summary: TerritoryNationSummary,
  scoreFn: ScoreCellFn,
  index: Map<string, MapHexCell>,
  cols: number,
  rows: number,
  rand: () => number,
  usedNames: Set<string>,
  profile: PlaceNamingProfile
): AdminNode[] {
  const minCells = level === 'prefecture' ? MIN_PREFECTURE_CELLS : MIN_COUNTY_CELLS
  const maxParts = level === 'prefecture' ? Math.min(6, Math.max(3, Math.floor(cells.length / 40))) : 4
  const k = computeSubCount(cells.length, minCells, maxParts)
  if (k < 2) return []

  const seeds = pickSpreadSeeds(cells, k, scoreFn, summary, index, cols, rows)
  const groups = partitionBySeeds(cells, seeds, index, cols, rows)

  return groups.map((group, i) => {
    const id = `${idPrefix}-${level.slice(0, 4)}-${i + 1}`
    let name =
      level === 'prefecture'
        ? (() => {
            const stem =
              profile.prefectureStems[
                (partIndex * 7 + i + Math.floor(rand() * 3)) % profile.prefectureStems.length
              ]
            const qual =
              profile.prefectureQualifiers[i % profile.prefectureQualifiers.length]
            const geo = compassLabelForCells(group, nationRef)
            const dir = maybeDirectionalPrefix(geo, rand, profile)
            let n = uniqueAdminName(
              formatPrefectureAdminName(profile, stem, qual, dir),
              usedNames
            )
            const c = centroidOfCells(group)
            n = alignDirectionInPlaceName(n, c.x, c.y, nationRef)
            return n
          })()
        : formatCountyAdminName(
            profile,
            profile.countyPrefixes[
              (partIndex * 3 + i + Math.floor(rand() * 3)) % profile.countyPrefixes.length
            ]
          )
    const node: AdminNode = { id, name, level, cells: group, children: [] }
    if (level === 'prefecture' && group.length >= targetCellsPerProvince(group.length, 'county') * 2) {
      node.children = subdivideNode(
        group,
        'county',
        id,
        nationRef,
        i,
        summary,
        scoreFn,
        index,
        cols,
        rows,
        rand,
        usedNames,
        profile
      )
    }
    return node
  })
}

function buildNationAdminTree(
  nationId: string,
  nationName: string,
  cells: MapHexCell[],
  summary: TerritoryNationSummary,
  scoreFn: ScoreCellFn,
  cols: number,
  rows: number,
  rand: () => number,
  profile: PlaceNamingProfile,
  cellsPerProvinceTarget?: number
): AdminNode[] {
  const index = buildCellIndex(cells)
  const compartments = findTerrainCompartments(cells, index, cols, rows)
  const numProv = planProvinceCount(cells, compartments, cellsPerProvinceTarget)

  const provSeeds = pickProvinceSeedsByTerrain(
    cells,
    numProv,
    compartments,
    scoreFn,
    summary,
    index,
    cols,
    rows
  )
  let provGroups = partitionBySeeds(cells, provSeeds, index, cols, rows)
  provGroups = mergeSmallProvinces(provGroups, MIN_PROVINCE_CELLS, index, cols, rows)

  const short = nationName.slice(0, 1) || '国'
  const nationRef = nationGeoRefFromCells(cells)
  const usedNames = new Set<string>()

  return provGroups.map((group, i) => {
    const id = `prov-${nationId}-${i + 1}`
    const name = provinceDisplayName(group, nationRef, short, i, usedNames, rand, profile)
    const node: AdminNode = { id, name, level: 'province', cells: group, children: [] }
    const prefTarget = targetCellsPerProvince(group.length, 'prefecture')
    if (group.length >= prefTarget * 1.8) {
      node.children = subdivideNode(
        group,
        'prefecture',
        id,
        nationRef,
        i,
        summary,
        scoreFn,
        index,
        cols,
        rows,
        rand,
        usedNames,
        profile
      )
    }
    return node
  })
}

interface SeatPlan {
  node: AdminNode
  type: WorldLocation['type']
  role: string
}

function collectSeatPlans(provinces: AdminNode[]): SeatPlan[] {
  const plans: SeatPlan[] = []
  for (const prov of provinces) {
    plans.push({ node: prov, type: 'city', role: ADMIN_ROLE.PROVINCIAL })
    for (const pref of prov.children) {
      plans.push({ node: pref, type: 'city', role: ADMIN_ROLE.CITY })
      for (const county of pref.children) {
        plans.push({ node: county, type: 'town', role: ADMIN_ROLE.COUNTY })
      }
    }
  }
  return plans
}

function pickBestSeat(
  node: AdminNode,
  used: Set<string>,
  scoreFn: ScoreCellFn,
  summary: TerritoryNationSummary
): MapHexCell | null {
  const candidates = [...node.cells]
    .filter((c) => !used.has(cellKey(c)) && c.terrain !== 'ocean')
    .sort((a, b) => scoreFn(b, summary) - scoreFn(a, summary))
  return candidates[0] ?? null
}

function canPlaceAt(
  cell: MapHexCell,
  placed: { q: number; r: number }[],
  cols: number,
  rows: number
): boolean {
  let within2 = 0
  for (const p of placed) {
    const d = hexGridDistance({ q: cell.q, r: cell.r }, p, cols, rows)
    if (d === 0) return false
    if (d <= 2) within2++
  }
  return within2 < 3
}

function adminAuthorSettings(role: string, regionName: string): string {
  return `区划：${role}\n辖区：${regionName}`
}

/** 是否为本地占位简介（未经大模型或人工润色） */
export function isTemplateLocationDescription(desc: string | undefined): boolean {
  if (!desc?.trim()) return true
  return (
    /辖约\d+格/.test(desc) ||
    /地形以\s*[a-z_]+\s*为主/i.test(desc) ||
    /边缘层级区划据点/.test(desc) ||
    /辖内集镇，补足区划/.test(desc)
  )
}

function buildSeatDescription(
  seatName: string,
  role: string,
  regionName: string,
  cell: MapHexCell,
  summary: TerritoryNationSummary,
  cellCount: number
): string {
  const terrain = TERRAIN_CN[cell.terrain] ?? cell.terrain
  return (
    `${seatName}为${regionName}的${role}，辖境约${cellCount}陆格，` +
    `地处${terrain}，${summary.latBand}，${summary.developmentTier}层级区划核心。`
  )
}

function buildCapitalDescription(
  seatName: string,
  nationName: string,
  capProvinceName: string,
  summary: TerritoryNationSummary,
  provinceCount: number,
  landCells: number
): string {
  return (
    `${seatName}为${nationName}都城，控扼${provinceCount}行省、` +
    `国土约${landCells}陆格；位于${capProvinceName}，${summary.latBand}，${summary.developmentTier}层级政治中心。`
  )
}

function buildTownDescription(seatName: string, regionName: string, cell: MapHexCell): string {
  const terrain = TERRAIN_CN[cell.terrain] ?? cell.terrain
  return `${seatName}是${regionName}辖内集镇，补充分布于${terrain}地带，承担基层聚落与补给功能。`
}

/** 侧栏/详情展示：占位简介转为可读中文；已润色内容原样返回 */
export function resolveLocationDescription(
  loc: WorldLocation,
  map: WorldMapDocument,
  nationName?: string
): string {
  const custom = loc.authorSettings?.trim()
  if (custom && !isTemplateLocationDescription(custom) && custom !== loc.description?.trim()) {
    return custom
  }
  const desc = loc.description?.trim() ?? ''
  if (desc && !isTemplateLocationDescription(desc)) return desc

  const roleMatch = /区划[：:]\s*(\S+)/.exec(loc.authorSettings ?? '')
  const role = roleMatch?.[1] ?? (loc.type === 'capital' ? ADMIN_ROLE.CAPITAL : '聚落')
  const regionMatch = /辖区[：:]\s*(.+)/.exec(loc.authorSettings ?? '')
  const regionName =
    regionMatch?.[1]?.trim() ||
    (loc.regionId ? map.regions.find((r) => r.id === loc.regionId)?.name : undefined) ||
    nationName ||
    '本境'

  ensureMapHexGrid(map)
  const cellCount =
    loc.regionId != null
      ? map.hexGrid!.cells.filter((c) => c.regionId === loc.regionId && c.terrain !== 'ocean').length
      : 6

  const terrain = TERRAIN_CN[loc.terrain] ?? loc.terrain
  const climate = loc.climate?.trim() || '温带'
  const tier =
    loc.development != null && loc.development >= 60
      ? '鼎盛'
      : loc.development != null && loc.development >= 35
        ? '成长'
        : '边缘'

  if (loc.type === 'capital') {
    return (
      `${loc.name}为${nationName ?? regionName}都城，位于${regionName}，` +
      `${climate}，${terrain}地带，${tier}层级政治中心。`
    )
  }
  if (role === ADMIN_ROLE.TOWN || role === '镇') {
    return `${loc.name}是${regionName}辖内集镇，分布于${terrain}地带，承担基层聚落与补给功能。`
  }
  return (
    `${loc.name}为${regionName}的${role}，辖境约${cellCount}陆格，` +
    `地处${terrain}，${climate}，${tier}层级区划核心。`
  )
}

function provinceIdForAdminNode(node: AdminNode): string {
  const pref = node.id.indexOf('-pref-')
  if (pref >= 0) return node.id.slice(0, pref)
  const coun = node.id.indexOf('-coun-')
  if (coun >= 0) return node.id.slice(0, coun)
  return node.id
}

/** 由 location.regionId 反推行省 id（含府/县后缀） */
export function extractProvinceRegionId(regionId: string | undefined): string | undefined {
  if (!regionId?.startsWith('prov-')) return regionId
  const pref = regionId.indexOf('-pref-')
  if (pref >= 0) return regionId.slice(0, pref)
  const coun = regionId.indexOf('-coun-')
  if (coun >= 0) return regionId.slice(0, coun)
  return regionId
}

const SEAT_NAME_ATTEMPT_MAX = 56

function seatNameSuffix(
  profile: PlaceNamingProfile,
  role: string,
  type: WorldLocation['type'],
  variant: number
): string {
  const v = variant
  if (type === 'capital' || role === ADMIN_ROLE.CAPITAL || role === '都城') {
    switch (profile.style) {
      case 'western':
        return ['burg', 'City', 'haven'][v % 3]!
      case 'japanese':
        return ['京', '都', '城'][v % 3]!
      case 'fantasy':
        return [' Crown', ' Citadel', ' Court'][v % 3]!
      default:
        return ['京', '都', '城'][v % 3]!
    }
  }
  if (role === ADMIN_ROLE.PROVINCIAL || role === '省会') {
    switch (profile.style) {
      case 'western':
        return ['burg', 'City'][v % 2]!
      case 'japanese':
        return '城'
      case 'fantasy':
        return [' Keep', ' Hold'][v % 2]!
      default:
        return '城'
    }
  }
  if (role === ADMIN_ROLE.CITY || role === '府治') {
    switch (profile.style) {
      case 'western':
        return ['ton', 'ville'][v % 2]!
      case 'japanese':
        return '府'
      case 'fantasy':
        return [' Hold', ' Court'][v % 2]!
      default:
        return '府'
    }
  }
  switch (profile.style) {
    case 'western':
      return ['ton', 'ford', 'haven', 'wick', 'dale', 'mouth'][v % 6]!
    case 'japanese':
      return ['町', '集', '津'][v % 3]!
    case 'fantasy':
      return [' Vale', ' Haven', ' Ford'][v % 3]!
    default:
      return ['镇', '集', '驿', '关', '堡', '津'][v % 6]!
  }
}

function composeSeatName(
  profile: PlaceNamingProfile,
  role: string,
  type: WorldLocation['type'],
  dir: string,
  core: string,
  variant: number
): string {
  const suffix = seatNameSuffix(profile, role, type, variant)
  const c = core.trim()
  if (!c) return composeSeatName(profile, role, type, dir, profile.seatStems[0] ?? '安', variant)

  if (profile.style === 'western') {
    const wdir = dir ? `${westernDirectionPrefix(dir) || dir} ` : ''
    if (suffix === 'City' || suffix === 'haven') return `${wdir}${c} ${suffix}`.trim()
    return `${wdir}${c}${suffix}`.trim()
  }
  if (profile.style === 'fantasy') {
    const fdir = dir ? `${dir} ` : ''
    return `${fdir}${c}${suffix}`.replace(/\s+/g, ' ').trim()
  }
  return `${dir}${c}${suffix}`
}

function terrainSeatPrefix(cell: MapHexCell): string {
  switch (cell.terrain) {
    case 'desert':
      return '沙'
    case 'forest':
      return '林'
    case 'mountain':
      return '岳'
    case 'hill':
      return '丘'
    case 'wetland':
      return '泽'
    case 'coast':
      return '海'
    default:
      return '原'
  }
}

function alternateSeatNameForAttempt(
  attempt: number,
  rand: () => number,
  role: string,
  type: WorldLocation['type'],
  cell: MapHexCell,
  adminName: string,
  nationRef: NationGeoRef,
  profile: PlaceNamingProfile
): string {
  const geoDir = compassLabelForPoint(cell.x, cell.y, nationRef)
  const dirPrefix = geoDir === '中' ? '' : geoDir
  const prefixPool =
    profile.style === 'chinese' || profile.style === 'japanese'
      ? COUNTY_PREFIX
      : profile.countyPrefixes
  const stems = profile.seatStems
  const pi = (attempt + cell.q * 3 + cell.r * 5) % prefixPool.length
  const si = (attempt * 7 + cell.q + cell.r * 11) % stems.length
  const { core: adminCore } = extractSeatStem(adminName, profile)
  const variant = attempt + cell.q + cell.r

  let raw: string
  if (attempt <= 14) {
    raw = composeSeatName(profile, role, type, dirPrefix, prefixPool[pi]!, variant)
  } else if (attempt <= 28) {
    const core = prefixPool[pi]! + stems[si]!.slice(0, 1)
    raw = composeSeatName(profile, role, type, '', core, variant)
  } else if (attempt <= 42) {
    const core = (adminCore + prefixPool[pi]!).slice(0, 3)
    raw = composeSeatName(profile, role, type, dirPrefix, core, variant)
  } else if (attempt <= 50) {
    raw =
      type === 'capital' || role === ADMIN_ROLE.CAPITAL || role === '都城'
        ? formatCapitalName(profile, rand)
        : formatTownName(profile, rand)
  } else {
    const core = terrainSeatPrefix(cell) + prefixPool[pi]!
    raw = composeSeatName(profile, role, type, dirPrefix, core, variant)
  }

  return alignDirectionInPlaceName(raw, cell.x, cell.y, nationRef)
}

function assignSeatName(
  rand: () => number,
  role: string,
  type: WorldLocation['type'],
  cell: MapHexCell,
  adminName: string,
  summary: TerritoryNationSummary,
  nationRef: NationGeoRef,
  profile: PlaceNamingProfile,
  usedInProvince: Set<string>
): string {
  for (let attempt = 0; attempt < SEAT_NAME_ATTEMPT_MAX; attempt++) {
    const raw =
      attempt === 0
        ? nameForSeat(rand, role, type, cell, adminName, summary, nationRef, profile)
        : alternateSeatNameForAttempt(
            attempt,
            rand,
            role,
            type,
            cell,
            adminName,
            nationRef,
            profile
          )
    const name = truncateChinesePlaceName(raw)
    if (!usedInProvince.has(name)) {
      usedInProvince.add(name)
      return name
    }
  }

  for (let extra = 0; extra < COUNTY_PREFIX.length * 2; extra++) {
    const geoDir = compassLabelForPoint(cell.x, cell.y, nationRef)
    const dirPrefix = geoDir === '中' ? '' : geoDir
    const fallback = truncateChinesePlaceName(
      composeSeatName(
        profile,
        role,
        type,
        dirPrefix,
        terrainSeatPrefix(cell) +
          profile.seatStems[(cell.q + extra) % profile.seatStems.length]! +
          COUNTY_PREFIX[(cell.r + extra) % COUNTY_PREFIX.length]!.slice(0, 1),
        cell.q + cell.r * 3 + extra
      )
    )
    if (!usedInProvince.has(fallback)) {
      usedInProvince.add(fallback)
      return fallback
    }
  }

  const last = truncateChinesePlaceName(formatTownName(profile, rand))
  usedInProvince.add(last)
  return last
}

function makeLocationBase(
  id: string,
  name: string,
  type: WorldLocation['type'],
  cell: MapHexCell,
  summary: TerritoryNationSummary,
  nationId: string,
  regionId: string | undefined,
  role: string,
  regionName: string,
  description: string,
  population: string,
  development: number
): WorldLocation {
  return {
    id,
    name,
    type,
    x: cell.x,
    y: cell.y,
    terrain: cell.terrain,
    climate: climateLabel(summary),
    nationId,
    regionId,
    description,
    population,
    development,
    authorSettings: adminAuthorSettings(role, regionName)
  }
}

function climateLabel(summary: TerritoryNationSummary): string {
  if (summary.latBand.includes('寒')) return '寒带'
  if (summary.latBand.includes('热')) return '热带'
  return '温带'
}

function nameForSeat(
  rand: () => number,
  role: string,
  type: WorldLocation['type'],
  cell: MapHexCell,
  adminName: string,
  _summary: TerritoryNationSummary,
  nationRef: NationGeoRef,
  profile: PlaceNamingProfile
): string {
  let name: string
  if (role === ADMIN_ROLE.PROVINCIAL || role === '省会') name = formatProvincialSeatName(profile, adminName)
  else if (role === ADMIN_ROLE.CITY || role === '府治') name = formatPrefectureSeatName(profile, adminName)
  else if (role === ADMIN_ROLE.COUNTY || role === '县治') name = formatCountySeatName(profile, adminName)
  else if (type === 'capital') name = formatCapitalName(profile, rand)
  else name = formatTownName(profile, rand)
  return alignDirectionInPlaceName(name, cell.x, cell.y, nationRef)
}

function popForType(type: WorldLocation['type'], summary: TerritoryNationSummary, role: string): string {
  if (type === 'capital') return summary.developmentTier === '鼎盛' ? '80万+' : '35–60万'
  if (role === ADMIN_ROLE.PROVINCIAL || role === '省会') return '25–45万'
  if (role === ADMIN_ROLE.CITY || role === '府治') return '12–28万'
  if (role === ADMIN_ROLE.COUNTY || role === '县治') return summary.developmentTier === '边缘' ? '1–5万' : '3–12万'
  if (type === 'town') return '1–6万'
  return '2–10万'
}

function devForType(type: WorldLocation['type'], cell: MapHexCell, summary: TerritoryNationSummary): number {
  const base = cell.development ?? summary.avgDevelopment
  if (type === 'capital') return Math.min(100, Math.round(base * 1.18 + 14))
  if (type === 'city') return Math.min(95, Math.round(base * 1.08 + 8))
  if (type === 'landmark') return Math.min(70, Math.round(base * 0.85))
  return Math.min(85, Math.round(base * 0.92 + 2))
}

function upsertRegion(map: WorldMapDocument, node: AdminNode, summary: TerritoryNationSummary): void {
  const existing = map.regions.findIndex((r) => r.id === node.id)
  const region: MapRegion = {
    id: node.id,
    name: node.name,
    terrain: 'plain',
    climate: summary.latBand,
    polygon: bboxPolygon(node.cells)
  }
  if (existing >= 0) map.regions[existing] = region
  else map.regions.push(region)
  for (const c of node.cells) c.regionId = node.id
}

function removeNationRegions(map: WorldMapDocument, nationId: string): void {
  const prefix = `prov-${nationId}-`
  map.regions = map.regions.filter((r) => !r.id.startsWith(prefix))
}

/** 预览各国行省划分（不写 map.regions，供编辑器 overlay） */
export function computeProvincePreviews(
  map: WorldMapDocument,
  nations: WorldNation[],
  summaries: TerritoryNationSummary[],
  scoreFn: ScoreCellFn,
  seed: number,
  cellsPerProvinceTarget?: number,
  config?: Pick<WorldGenConfig, 'placeNamingStyle'>
): ProvincePreviewItem[] {
  ensureMapHexGrid(map)
  const { cols, rows } = map.hexGrid!
  const rand = seededRandom(seed + 7700)
  const byNation = new Map<string, MapHexCell[]>()
  for (const c of map.hexGrid!.cells) {
    if (!c.nationId) continue
    const list = byNation.get(c.nationId) ?? []
    list.push(c)
    byNation.set(c.nationId, list)
  }

  const namingCfg = { placeNamingStyle: config?.placeNamingStyle } as WorldGenConfig
  const out: ProvincePreviewItem[] = []
  for (let ni = 0; ni < summaries.length; ni++) {
    const summary = summaries[ni]
    const nation = nations.find((n) => n.id === summary.nationId)
    const cells = cellsForSettlementPlacement(byNation.get(summary.nationId) ?? [])
    if (!nation || !cells.length) continue
    const profile = namingProfileForNation(namingCfg, ni)
    const provinces = buildNationAdminTree(
      nation.id,
      nation.name,
      cells,
      summary,
      scoreFn,
      cols,
      rows,
      rand,
      profile,
      cellsPerProvinceTarget
    )
    for (const p of provinces) {
      out.push({
        id: p.id,
        nationId: nation.id,
        name: p.name,
        cells: p.cells,
        landHexCount: p.cells.length
      })
    }
  }
  return out
}

/** 仅计算一国行省预览（行省图层选中单国时更快） */
export function computeProvincePreviewsForNation(
  map: WorldMapDocument,
  nationId: string,
  nations: WorldNation[],
  summaries: TerritoryNationSummary[],
  scoreFn: ScoreCellFn,
  seed: number,
  cellsPerProvinceTarget?: number,
  config?: Pick<WorldGenConfig, 'placeNamingStyle'>
): ProvincePreviewItem[] {
  const summary = summaries.find((s) => s.nationId === nationId)
  const nation = nations.find((n) => n.id === nationId)
  if (!summary || !nation) return []
  ensureMapHexGrid(map)
  const { cols, rows } = map.hexGrid!
  const cells = cellsForSettlementPlacement(
    map.hexGrid!.cells.filter((c) => c.nationId === nationId)
  )
  if (!cells.length) return []
  const rand = seededRandom(seed + 7700 + nationId.length)
  const ni = summaries.findIndex((s) => s.nationId === nationId)
  const profile = namingProfileForNation(
    { placeNamingStyle: config?.placeNamingStyle } as WorldGenConfig,
    Math.max(0, ni)
  )
  const provinces = buildNationAdminTree(
    nation.id,
    nation.name,
    cells,
    summary,
    scoreFn,
    cols,
    rows,
    rand,
    profile,
    cellsPerProvinceTarget
  )
  return provinces.map((p) => ({
    id: p.id,
    nationId: nation.id,
    name: p.name,
    cells: p.cells,
    landHexCount: p.cells.length
  }))
}

export function provinceFillColorCss(colorIndex: number, nationIndex: number): string {
  const hue = (nationIndex * 53 + colorIndex * 31) % 360
  return `hsla(${hue} 52% 46% / 0.58)`
}

export interface ProvinceOverlayData {
  cellFill: Map<string, { colorIndex: number; nationIndex: number; fillColor: string }>
  borderIds: Set<string>
  previewCount: number
}

export interface TerritoryOverlayData {
  cellFill: Map<string, string>
}

/** 由行省预览构建填色/省界集合，供地图一次性渲染 */
export function buildProvinceOverlayData(
  previews: ProvincePreviewItem[],
  nations: WorldNation[],
  cols: number,
  rows: number
): ProvinceOverlayData {
  const cellFill = new Map<
    string,
    { colorIndex: number; nationIndex: number; fillColor: string }
  >()
  const borderIds = new Set<string>()
  const byNationColorIndex = new Map<string, number>()

  for (const p of previews) {
    const nationIndex = nations.findIndex((n) => n.id === p.nationId)
    const prevCount = byNationColorIndex.get(p.nationId) ?? 0
    byNationColorIndex.set(p.nationId, prevCount + 1)
    const colorIndex = prevCount
    const nationIdx = Math.max(0, nationIndex)
    const fillColor = provinceFillColorCss(colorIndex, nationIdx)
    const cellKeys = new Set(p.cells.map(cellKey))
    for (const c of p.cells) {
      cellFill.set(c.id, { colorIndex, nationIndex: nationIdx, fillColor })
      for (const nb of hexNeighborCoords(c.q, c.r, cols, rows)) {
        const nk = `${nb.q},${nb.r}`
        if (!cellKeys.has(nk)) borderIds.add(c.id)
      }
    }
  }

  return { cellFill, borderIds, previewCount: previews.length }
}

/** 国家领土图层填色（仅依赖 hex.nationId，避免逐格做点-in-polygon） */
export function buildTerritoryOverlayData(
  cells: MapHexCell[],
  nations: WorldNation[]
): TerritoryOverlayData {
  const nationIndexById = new Map(nations.map((n, i) => [n.id, i]))
  const cellFill = new Map<string, string>()
  for (const c of cells) {
    if (!c.nationId) continue
    const idx = nationIndexById.get(c.nationId) ?? 0
    const nation = nations[idx]
    cellFill.set(c.id, nation?.color ?? nationColor(idx))
  }
  return { cellFill }
}

function findHexCellForLocation(map: WorldMapDocument, loc: WorldLocation): MapHexCell | undefined {
  if (!map.hexGrid?.cells.length) return undefined
  const layout = createHexLayout(map.hexGrid.cols, map.hexGrid.rows)
  const { q, r } = percentToHex(loc.x, loc.y, layout) ?? { q: 0, r: 0 }
  const direct = map.hexGrid.cells.find((c) => c.id === hexId(q, r))
  if (direct && direct.terrain !== 'ocean') return direct
  let best: MapHexCell | undefined
  let bestD = Infinity
  for (const c of map.hexGrid.cells) {
    if (c.terrain === 'ocean') continue
    const d = Math.hypot(c.x - loc.x, c.y - loc.y)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

function locationSeatScore(
  loc: WorldLocation,
  map: WorldMapDocument,
  scoreFn: ScoreCellFn,
  summary: TerritoryNationSummary
): number {
  const cell = findHexCellForLocation(map, loc)
  if (!cell) return 0
  return scoreFn(cell, summary)
}

export function listProvinceRegionIds(map: WorldMapDocument, nationId: string): string[] {
  const nation = map.nations?.find((n) => n.id === nationId)
  const fromNation = (nation?.regionIds ?? []).filter(
    (id) => !id.includes('-pref-') && !id.includes('-coun-')
  )
  if (fromNation.length) return fromNation
  const escaped = nationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (map.regions ?? [])
    .filter((r) => new RegExp(`^prov-${escaped}-\\d+$`).test(r.id))
    .map((r) => r.id)
}

function hexCellsInProvince(
  map: WorldMapDocument,
  nationId: string,
  provId: string
): MapHexCell[] {
  const byRegionId = (map.hexGrid?.cells ?? []).filter(
    (c) =>
      c.nationId === nationId &&
      c.terrain !== 'ocean' &&
      (c.regionId === provId || c.regionId?.startsWith(`${provId}-`) === true)
  )
  if (byRegionId.length) return byRegionId

  const region = map.regions?.find((r) => r.id === provId)
  if (!region?.polygon?.length) return []
  return (map.hexGrid?.cells ?? []).filter(
    (c) =>
      c.nationId === nationId &&
      c.terrain !== 'ocean' &&
      pointInPolygon(c.x, c.y, region.polygon)
  )
}

function locationsInProvince(
  locations: WorldLocation[],
  nationId: string,
  provId: string
): WorldLocation[] {
  return locations.filter((loc) => {
    if (loc.nationId !== nationId || loc.type === 'landmark') return false
    return extractProvinceRegionId(loc.regionId) === provId
  })
}

function nextLocationId(locations: WorldLocation[]): string {
  let max = 0
  for (const loc of locations) {
    const m = /^loc-(\d+)$/.exec(loc.id)
    if (m) max = Math.max(max, Number.parseInt(m[1], 10))
  }
  return `loc-${String(max + 1).padStart(3, '0')}`
}

function defaultProvincialSeatName(provName: string, used: Set<string>): string {
  const stem = provName.replace(/(行省|省|道|府)$/u, '').trim() || provName
  let name = truncateChinesePlaceName(`${stem}城`)
  let n = 2
  while (used.has(name)) {
    name = truncateChinesePlaceName(`${stem}${n}城`)
    n++
  }
  used.add(name)
  return name
}

/**
 * 确保每个行省恰好一个省会：去重、升格、缺位则新建。
 * @returns 是否改动了 locations
 */
export function normalizeProvinceSeatHierarchy(
  locations: WorldLocation[],
  map: WorldMapDocument,
  scoreFn: ScoreCellFn,
  summaries: TerritoryNationSummary[]
): boolean {
  ensureMapHexGrid(map)
  const summaryByNation = new Map(summaries.map((s) => [s.nationId, s]))
  let changed = false
  const usedNames = new Set(locations.map((l) => l.name))

  for (const nation of map.nations ?? []) {
    const summary = summaryByNation.get(nation.id)
    if (!summary) continue

    for (const provId of listProvinceRegionIds(map, nation.id)) {
      const region = map.regions?.find((r) => r.id === provId)
      const provName = region?.name ?? provId
      const locs = locationsInProvince(locations, nation.id, provId)

      let provincial = locs.filter((l) =>
        isProvincialAdminRole(parseAdminRole(l.authorSettings))
      )
      if (provincial.length > 1) {
        provincial.sort(
          (a, b) =>
            locationSeatScore(b, map, scoreFn, summary) - locationSeatScore(a, map, scoreFn, summary)
        )
        for (const loc of provincial.slice(1)) {
          setLocationAdminRole(loc, ADMIN_ROLE.CITY, parseAdminRegionName(loc.authorSettings) ?? provName)
          changed = true
        }
        provincial = provincial.slice(0, 1)
      }

      if (provincial.length === 1) continue

      const candidates = locs.filter((l) => l.type !== 'capital')
      if (candidates.length) {
        candidates.sort(
          (a, b) =>
            locationSeatScore(b, map, scoreFn, summary) - locationSeatScore(a, map, scoreFn, summary)
        )
        const pick = candidates[0]!
        setLocationAdminRole(pick, ADMIN_ROLE.PROVINCIAL, provName)
        if (pick.regionId !== provId) pick.regionId = provId
        changed = true
        continue
      }

      const cells = hexCellsInProvince(map, nation.id, provId)
      if (!cells.length) continue
      const best = [...cells].sort((a, b) => scoreFn(b, summary) - scoreFn(a, summary))[0]!
      const seatName = defaultProvincialSeatName(provName, usedNames)
      locations.push(
        makeLocationBase(
          nextLocationId(locations),
          seatName,
          'city',
          best,
          summary,
          nation.id,
          provId,
          ADMIN_ROLE.PROVINCIAL,
          provName,
          buildSeatDescription(seatName, ADMIN_ROLE.PROVINCIAL, provName, best, summary, cells.length),
          popForType('city', summary, ADMIN_ROLE.PROVINCIAL),
          devForType('city', best, summary)
        )
      )
      changed = true
    }
  }

  return changed
}

export function placeCitiesByAdminDivisions(
  map: WorldMapDocument,
  nations: WorldNation[],
  summaries: TerritoryNationSummary[],
  config: WorldGenConfig,
  seed: number,
  scoreFn: ScoreCellFn
): WorldLocation[] {
  ensureMapHexGrid(map)
  const { cols, rows } = map.hexGrid!
  const rand = seededRandom(seed + 8800)

  const byNationCells = new Map<string, MapHexCell[]>()
  for (const c of map.hexGrid!.cells) {
    if (!c.nationId) continue
    const list = byNationCells.get(c.nationId) ?? []
    list.push(c)
    byNationCells.set(c.nationId, list)
  }

  const locations: WorldLocation[] = []
  const globalPlaced: { q: number; r: number }[] = []
  let locIndex = 0

  for (let ni = 0; ni < summaries.length; ni++) {
    const summary = summaries[ni]
    const nation = nations.find((n) => n.id === summary.nationId)
    if (!nation) continue
    const cells = cellsForSettlementPlacement(byNationCells.get(summary.nationId) ?? [])
    if (!cells.length) continue
    const nationRef = nationGeoRefFromCells(cells)
    const profile = namingProfileForNation(config, ni)

    removeNationRegions(map, nation.id)

    const provinces = buildNationAdminTree(
      nation.id,
      nation.name,
      cells,
      summary,
      scoreFn,
      cols,
      rows,
      rand,
      profile,
      map.cellsPerProvinceTarget
    )
    if (!provinces.length) continue

    for (const prov of provinces) {
      upsertRegion(map, prov, summary)
      for (const pref of prov.children) {
        upsertRegion(map, pref, summary)
        for (const county of pref.children) upsertRegion(map, county, summary)
      }
    }
    nation.regionIds = provinces.map((p) => p.id)

    const plans = collectSeatPlans(provinces)
    /** 城市数由行省→府州→县治所数量决定，不再用手填 cityCount 截断 */
    let quota = plans.length + 1
    quota = Math.min(quota, Math.max(4, Math.floor(cells.length / 3)))

    const usedCells = new Set<string>()
    const nationPlaced: { q: number; r: number }[] = []
    const usedSeatNamesByProvince = new Map<string, Set<string>>()

    function usedInProvince(provinceId: string): Set<string> {
      let set = usedSeatNamesByProvince.get(provinceId)
      if (!set) {
        set = new Set<string>()
        usedSeatNamesByProvince.set(provinceId, set)
      }
      return set
    }

    const nationalCell =
      pickBestSeat(
        provinces.reduce((a, b) => (a.cells.length > b.cells.length ? a : b)),
        usedCells,
        scoreFn,
        summary
      ) ?? pickBestSeat(provinces[0], usedCells, scoreFn, summary)

    if (nationalCell && canPlaceAt(nationalCell, globalPlaced, cols, rows)) {
      const capProvince = provinces.reduce((a, b) => (a.cells.length > b.cells.length ? a : b))
      const capProvId = provinceIdForAdminNode(capProvince)
      const capName = assignSeatName(
        rand,
        ADMIN_ROLE.CAPITAL,
        'capital',
        nationalCell,
        nation.name,
        summary,
        nationRef,
        profile,
        usedInProvince(capProvId)
      )
      const loc = makeLocationBase(
        `loc-${String(++locIndex).padStart(3, '0')}`,
        capName,
        'capital',
        nationalCell,
        summary,
        nation.id,
        nationalCell.regionId,
        ADMIN_ROLE.CAPITAL,
        capProvince.name,
        buildCapitalDescription(
          capName,
          nation.name,
          capProvince.name,
          summary,
          provinces.length,
          cells.length
        ),
        popForType('capital', summary, ADMIN_ROLE.CAPITAL),
        devForType('capital', nationalCell, summary)
      )
      locations.push(loc)
      nation.capitalLocationId = loc.id
      usedCells.add(cellKey(nationalCell))
      nationPlaced.push({ q: nationalCell.q, r: nationalCell.r })
      globalPlaced.push({ q: nationalCell.q, r: nationalCell.r })
    }

    for (const plan of plans) {
      if (locations.filter((l) => l.nationId === nation.id).length >= quota) break
      const cell = pickBestSeat(plan.node, usedCells, scoreFn, summary)
      if (!cell) continue
      if (!canPlaceAt(cell, nationPlaced, cols, rows)) continue
      if (!canPlaceAt(cell, globalPlaced, cols, rows)) continue

      const provId = provinceIdForAdminNode(plan.node)
      const seatName = assignSeatName(
        rand,
        plan.role,
        plan.type,
        cell,
        plan.node.name,
        summary,
        nationRef,
        profile,
        usedInProvince(provId)
      )

      const loc = makeLocationBase(
        `loc-${String(++locIndex).padStart(3, '0')}`,
        seatName,
        plan.type,
        cell,
        summary,
        nation.id,
        plan.node.id,
        plan.role,
        plan.node.name,
        buildSeatDescription(
          seatName,
          plan.role,
          plan.node.name,
          cell,
          summary,
          plan.node.cells.length
        ),
        popForType(plan.type, summary, plan.role),
        devForType(plan.type, cell, summary)
      )
      locations.push(loc)
      usedCells.add(cellKey(cell))
      nationPlaced.push({ q: cell.q, r: cell.r })
      globalPlaced.push({ q: cell.q, r: cell.r })
    }

    while (
      locations.filter((l) => l.nationId === nation.id).length < quota &&
      nationPlaced.length < cells.length
    ) {
      const largest = [...provinces].sort((a, b) => b.cells.length - a.cells.length)[0]
      const cell = pickBestSeat(largest, usedCells, scoreFn, summary)
      if (!cell || !canPlaceAt(cell, nationPlaced, cols, rows)) break
      if (!canPlaceAt(cell, globalPlaced, cols, rows)) break
      const townName = assignSeatName(
        rand,
        ADMIN_ROLE.TOWN,
        'town',
        cell,
        largest.name,
        summary,
        nationRef,
        profile,
        usedInProvince(provinceIdForAdminNode(largest))
      )
      locations.push(
        makeLocationBase(
          `loc-${String(++locIndex).padStart(3, '0')}`,
          townName,
          'town',
          cell,
          summary,
          nation.id,
          largest.id,
          ADMIN_ROLE.TOWN,
          largest.name,
          buildTownDescription(townName, largest.name, cell),
          popForType('town', summary, ADMIN_ROLE.TOWN),
          devForType('town', cell, summary)
        )
      )
      usedCells.add(cellKey(cell))
      nationPlaced.push({ q: cell.q, r: cell.r })
      globalPlaced.push({ q: cell.q, r: cell.r })
    }

    if (config.includeLandmarks && ni === 0) {
      const landmarkCell = pickBestSeat(provinces[0], usedCells, scoreFn, summary)
      if (
        landmarkCell &&
        canPlaceAt(landmarkCell, nationPlaced, cols, rows) &&
        canPlaceAt(landmarkCell, globalPlaced, cols, rows)
      ) {
        locations.push({
          ...makeLocationBase(
            `loc-${String(++locIndex).padStart(3, '0')}`,
            '天柱岭',
            'landmark',
            landmarkCell,
            summary,
            nation.id,
            landmarkCell.regionId,
            '地标',
            provinces[0].name,
            `${nation.name}境内地标，与行省区划并存。`,
            '—',
            devForType('landmark', landmarkCell, summary)
          )
        })
      }
    }
  }

  normalizeProvinceSeatHierarchy(locations, map, scoreFn, summaries)
  return locations
}
