/**
 * 根据作者涂抹的六边形领土生成国家设定与聚落（本地算法 + 可选 LLM 润色）
 */

import type { MapHexCell, TerrainType, WorldLocation, WorldMapDocument, WorldNation } from '@/types/project'
import type { WorldGenConfig, WorldGenResult, WorldSocietyGenerateResponse } from '@/types/world-gen'
import { seededRandom } from '@/utils/world-noise'
import { nationColor } from '@/utils/world-map-territory'
import { parseJsonLoose, pickWorkflowOutput, unwrapSocietyRoot } from '@/utils/world-dify-parse'
import { parseAdminRole } from '@/utils/world-location-marker'
import { ensureMapHexGrid, hexCellAtPercent, hexNeighborCoords } from '@/utils/world-hex-grid'
import { syncHexClimateFromTerrain } from '@/utils/world-hex-climate'
import { equatorDistance } from '@/utils/world-climate'
import {
  alignDirectionInPlaceName,
  CELLS_PER_PROVINCE_DEFAULT,
  compassHintLabel,
  extractProvinceRegionId,
  guardLocationDirectionNames,
  nationGeoRefByNationId,
  nationGeoRefFromCells,
  placeCitiesByAdminDivisions,
  normalizeProvinceSeatHierarchy
} from '@/utils/world-admin-divisions'
import {
  generateAutoNationName,
  isDefaultNationName,
  namingProfileForNation,
  namingStyleBriefLine,
  nationNameNeedsPolish,
  normalizePlaceNamingStyle,
  type PlaceNamingStyle
} from '@/utils/world-place-naming'
import { hasLatinInName, latinPlaceNameToChinese, truncateChinesePlaceName } from '@/utils/world-place-name-zh'

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

export type DevelopmentTier = '鼎盛' | '成长' | '停滞' | '边缘'

export interface TerritoryNationSummary {
  nationId: string
  name: string
  hexCount: number
  landHexCount: number
  terrainBreakdown: Record<string, number>
  avgHeat: number
  avgWet: number
  avgDevelopment: number
  monsoonPct: number
  coastPct: number
  mountainPct: number
  desertPct: number
  forestPct: number
  aridityIndex: number
  habitabilityScore: number
  developmentTier: DevelopmentTier
  environmentalProfile: string
  centroid: { x: number; y: number }
  latBand: string
}

/** territory_json schemaVersion 3 — 含行省区划 adminProvinces + localDraftLocations */
export const TERRITORY_JSON_SCHEMA_VERSION = 3

export interface TerritoryMapPoint {
  x: number
  y: number
}

export interface TerritoryTerrainCentroid extends TerritoryMapPoint {
  hexCount: number
}

export interface TerritorySettlementCandidate extends TerritoryMapPoint {
  rank: number
  q: number
  r: number
  terrain: TerrainType
  development: number
  suitability: number
  suggestedRole: 'capital' | 'port' | 'city' | 'town' | 'landmark' | 'fortress'
}

export interface TerritoryBorderNeighbor {
  nationId: string
  name: string
  sharedBorderHexes: number
  nearestPoint: TerritoryMapPoint
}

export interface TerritoryRiverHint extends TerritoryMapPoint {
  riverId: string
  riverName: string
  order?: number
  /** 距河线最近距离（地图 0–100 单位） */
  distance: number
}

export interface TerritoryLocalDraftLocation {
  id: string
  type: WorldLocation['type']
  x: number
  y: number
  terrain: TerrainType
  name: string
  /** 都城 / 省会 / 府治 / 县治 / 镇 / 地标 */
  adminRole?: string
  /** 相对本国国土中心的方位，供 LLM 润色时与 x/y 一致 */
  compassHint?: string
  /** 该国占位地名所属风格（混合模式下各国可能不同） */
  placeNamingStyle?: PlaceNamingStyle
  regionId?: string
  regionName?: string
  population?: string
  development?: number
  candidateRank?: number
}

export interface TerritoryAdminProvince {
  id: string
  name: string
  landHexCount: number
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  seats: TerritoryLocalDraftLocation[]
}

export interface TerritoryNationSpatial {
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  extremes: { north: TerritoryMapPoint; south: TerritoryMapPoint; west: TerritoryMapPoint; east: TerritoryMapPoint }
  terrainCentroids: Partial<Record<TerrainType, TerritoryTerrainCentroid>>
  settlementCandidates: TerritorySettlementCandidate[]
  borderNeighbors: TerritoryBorderNeighbor[]
  riverHints: TerritoryRiverHint[]
  localDraftLocations: TerritoryLocalDraftLocation[]
  /** 行省 → 府州 → 县层级下的各省块与治所 */
  adminProvinces?: TerritoryAdminProvince[]
}

export interface TerritoryBriefOptions {
  /** 本地已选址结果，写入 spatial.localDraftLocations */
  localDraft?: Pick<SocietyGenerationResult, 'locations'>
}

export interface SocietyGenerationResult {
  worldRules: string
  nations: WorldNation[]
  locations: WorldLocation[]
  source: 'local' | 'llm' | 'hybrid'
  /** 仅当次 Dify 请求诊断，不写入知识库 */
  batchDiagnostics?: SocietyBatchDiagnostic[]
}

export function hasPaintedTerritory(map: WorldMapDocument): boolean {
  ensureMapHexGrid(map)
  return map.hexGrid!.cells.some((c) => !!c.nationId && c.terrain !== 'ocean')
}

/** 格子是否已写入行省归属（生成器落盘后的 prov-* regionId） */
export function hasPaintedProvinces(map: WorldMapDocument): boolean {
  ensureMapHexGrid(map)
  return map.hexGrid!.cells.some((c) => {
    if (c.terrain === 'ocean' || !c.regionId) return false
    const provId = extractProvinceRegionId(c.regionId)
    return !!provId?.startsWith('prov-')
  })
}

/** 从 nation.regionIds / hex.regionId 补全缺失的 hex.nationId（旧档或网格重建后） */
export function syncHexNationFromRegions(map: WorldMapDocument): boolean {
  ensureMapHexGrid(map)
  const nations = map.nations ?? []
  if (!nations.length) return false
  const provToNation = new Map<string, string>()
  for (const n of nations) {
    for (const rid of n.regionIds ?? []) {
      provToNation.set(rid, n.id)
    }
  }
  let changed = false
  for (const c of map.hexGrid!.cells) {
    if (c.nationId || c.terrain === 'ocean' || !c.regionId) continue
    const provId = extractProvinceRegionId(c.regionId)
    if (!provId) continue
    const nationId = provToNation.get(provId)
    if (nationId) {
      c.nationId = nationId
      changed = true
    }
  }
  return changed
}

function terrainPct(breakdown: Record<string, number>, terrain: string, land: number): number {
  if (!land) return 0
  return Math.round(((breakdown[terrain] ?? 0) / land) * 100)
}

function latBandFromY(cy: number): string {
  const eq = equatorDistance(cy / 100)
  if (eq >= 0.75) return cy < 50 ? '北境寒带' : '南极寒带'
  if (eq >= 0.58) return cy < 50 ? '北半球亚寒带' : '南半球亚寒带'
  if (eq < 0.12) return '赤道热带'
  if (eq < 0.28) return cy < 50 ? '北半球热带' : '南半球热带'
  if (eq < 0.42) return cy < 50 ? '北半球亚热带' : '南半球亚热带'
  return cy < 50 ? '北半球温带' : '南半球温带'
}

function climateBiasLabel(mode: WorldGenConfig['climate']): string {
  switch (mode) {
    case 'cold':
      return '项目气候倾向：寒带/北境为主'
    case 'tropical':
      return '项目气候倾向：热带/南方为主'
    case 'temperate':
      return '项目气候倾向：温带为主'
    default:
      return '项目气候倾向：混合气候带'
  }
}

const SCALE_CN: Record<WorldGenConfig['scale'], string> = {
  kingdom: '王国尺度',
  archipelago: '群岛尺度',
  continent: '大陆尺度',
  world: '整界尺度',
  planet: '行星尺度'
}

/** 作者向导词条 → 供大模型创作的背景方向（写入 territory_json） */
export function buildAuthorCreativeBrief(config: WorldGenConfig): Record<string, string | string[]> {
  const atmosphere = config.atmosphere.length ? config.atmosphere : ['写实']
  return {
    worldName: config.worldName,
    era: config.era,
    atmosphere,
    atmosphereHint: `叙事须体现作者所选氛围：${atmosphere.join('、')}`,
    scale: config.scale,
    scaleHint: SCALE_CN[config.scale] ?? config.scale,
    climate: config.climate,
    climateHint: climateBiasLabel(config.climate),
    placeNamingStyle: normalizePlaceNamingStyle(config.placeNamingStyle),
    namingStyleHint: namingStyleBriefLine(config)
  }
}

/** 选址/区划事实摘要，仅供大模型参考，勿原样写入 world_rules */
export function buildPlacementSummary(
  config: WorldGenConfig,
  summaries: TerritoryNationSummary[],
  locationCount: number
): string {
  return [
    `世界：${config.worldName}`,
    `时代：${config.era}；氛围：${config.atmosphere.join('、')}`,
    `尺度：${config.scale}；作者已划定 ${summaries.length} 国领土。`,
    ...summaries.map(
      (s) =>
        `· ${s.name}：${s.landHexCount} 陆格，${s.developmentTier}，${s.environmentalProfile}`
    ),
    `共 ${locationCount} 处聚落（行省→府州→县区划）。`
  ].join('\n')
}

/** 无大模型时的可读世界背景草案（由作者词条 + 领土概况生成） */
export function buildDraftWorldBackground(
  config: WorldGenConfig,
  summaries: TerritoryNationSummary[]
): string {
  const atmosphere = config.atmosphere.length ? config.atmosphere.join('、') : '写实'
  const scaleLabel = SCALE_CN[config.scale] ?? config.scale
  const climateHint = climateBiasLabel(config.climate).replace(/^项目气候倾向：/, '')

  const nationLines =
    summaries.length === 1
      ? `全境约 ${summaries[0]!.landHexCount} 陆格，${summaries[0]!.developmentTier}而${summaries[0]!.latBand}，${summaries[0]!.environmentalProfile}。`
      : summaries
          .map((s) => `${s.name}以${s.environmentalProfile}为主，${s.developmentTier}`)
          .join('；') + '。'

  return (
    `「${config.worldName}」是一座${config.era}背景下的${atmosphere}世界，整体为${scaleLabel}，${climateHint}。` +
    `${nationLines}` +
    `聚落沿河流、海岸与可耕平原分布，行省府县层级已划定；可在社会层润色后继续充实政体、文化与各国关系。`
  )
}

export interface NationTraitDerivation {
  government: string
  culture: string
  developmentTier: DevelopmentTier
  environmentalProfile: string
  developmentNote: string
}

/** 由框选领土的环境统计 + 项目参数推导政体/文化/发展层级 */
export function deriveNationTraits(
  summary: TerritoryNationSummary,
  config: WorldGenConfig
): NationTraitDerivation {
  const { coastPct, desertPct, forestPct, mountainPct, avgHeat, avgWet, avgDevelopment, monsoonPct } =
    summary
  const era = config.era
  const atmo = config.atmosphere.join('、')

  let government = '议会共和'
  let culture = '农耕'

  if (coastPct >= 28) {
    culture = '航海'
    government = era.includes('古') ? '城邦联盟' : '联邦'
  }
  if (desertPct >= 22 || summary.aridityIndex >= 55) {
    culture = '游牧'
    government = '部落联盟'
  }
  if (forestPct >= 35 && avgWet >= 55) {
    culture = culture === '游牧' ? '游牧' : '农耕'
    if (monsoonPct >= 25) culture = '农耕'
  }
  if (mountainPct >= 25) {
    culture = '尚武'
    government = '军事寡头'
  }
  if (avgHeat >= 62 && desertPct < 15) {
    if (culture === '农耕') culture = config.climate === 'tropical' ? '重商' : culture
  }
  if (avgHeat <= 38) {
    culture = culture === '航海' ? culture : '学术'
    government = era.includes('近') || era.includes('现') ? '中央集权' : '君主立宪'
  }
  if (avgDevelopment >= 58) {
    culture = culture === '游牧' ? '重商' : culture === '农耕' ? '重商' : culture
    government = '中央集权'
  }
  if (avgDevelopment <= 28) {
    government = desertPct > 20 ? '部落联盟' : '城邦联盟'
    culture = desertPct > 20 ? '游牧' : '农耕'
  }
  if (atmo.includes('仙侠') || atmo.includes('史诗')) {
    if (mountainPct >= 18) culture = '宗教立国'
  }
  if (atmo.includes('赛博') && (era.includes('未来') || era.includes('现代'))) {
    culture = '重商'
    government = '中央集权'
  }

  const profileParts: string[] = [
    summary.latBand,
    `均温${avgHeat}%·均湿${avgWet}%`,
    `海岸${coastPct}%·森林${forestPct}%·山地${mountainPct}%·荒漠${desertPct}%`,
    `季风区${monsoonPct}%·平均发展${avgDevelopment}`,
    climateBiasLabel(config.climate)
  ]
  const environmentalProfile = profileParts.join('；')

  const developmentNote =
    summary.developmentTier === '鼎盛'
      ? '领土内发展程度整体较高，都市与交通网密集。'
      : summary.developmentTier === '成长'
        ? '处于上升期，沿河海与平原聚落扩张。'
        : summary.developmentTier === '停滞'
          ? '发展不均，内陆与边陲滞后。'
          : '边陲/严酷环境为主，聚落稀疏。'

  return { government, culture, developmentTier: summary.developmentTier, environmentalProfile, developmentNote }
}

const DEFAULT_SUMMARY_CONFIG: WorldGenConfig = {
  worldName: '',
  era: '架空',
  atmosphere: [],
  scale: 'continent',
  climate: 'mixed',
  cityCount: 8,
  includeLandmarks: true
}

export function summarizeTerritories(
  map: WorldMapDocument,
  nations: WorldNation[],
  config: WorldGenConfig = DEFAULT_SUMMARY_CONFIG
): TerritoryNationSummary[] {
  ensureMapHexGrid(map)
  const byId = new Map<string, MapHexCell[]>()
  for (const c of map.hexGrid!.cells) {
    if (!c.nationId) continue
    const list = byId.get(c.nationId) ?? []
    list.push(c)
    byId.set(c.nationId, list)
  }

  const out: TerritoryNationSummary[] = []
  for (const nation of nations) {
    const cells = byId.get(nation.id) ?? []
    if (!cells.length) continue
    const land = cells.filter((c) => c.terrain !== 'ocean')
    const terrainBreakdown: Record<string, number> = {}
    let heat = 0
    let wet = 0
    let dev = 0
    let monsoon = 0
    let sx = 0
    let sy = 0
    for (const c of land.length ? land : cells) {
      terrainBreakdown[c.terrain] = (terrainBreakdown[c.terrain] ?? 0) + 1
      heat += c.heat ?? 0.5
      wet += c.wet ?? 0.5
      dev += c.development ?? 0
      if (c.monsoon) monsoon++
      sx += c.x
      sy += c.y
    }
    const n = land.length || cells.length
    const cy = sy / n
    const latBand = latBandFromY(cy)
    const avgHeat = Math.round((heat / n) * 100)
    const avgWet = Math.round((wet / n) * 100)
    const avgDevelopment = Math.round(dev / n)
    const monsoonPct = Math.round((monsoon / n) * 100)
    const coastPct = terrainPct(terrainBreakdown, 'coast', n)
    const mountainPct = terrainPct(terrainBreakdown, 'mountain', n) + terrainPct(terrainBreakdown, 'hill', n)
    const desertPct = terrainPct(terrainBreakdown, 'desert', n)
    const forestPct = terrainPct(terrainBreakdown, 'forest', n)
    const aridityIndex = Math.max(0, Math.min(100, 100 - avgWet + desertPct * 0.4))
    const habitabilityScore = Math.round(
      (100 - Math.abs(avgHeat - 48) * 0.35 - aridityIndex * 0.25 + coastPct * 0.15 + forestPct * 0.08) *
        (0.7 + avgDevelopment / 200)
    )

    let developmentTier: DevelopmentTier = '成长'
    if (avgDevelopment >= 55 && habitabilityScore >= 52) developmentTier = '鼎盛'
    else if (avgDevelopment >= 38) developmentTier = '成长'
    else if (avgDevelopment >= 22) developmentTier = '停滞'
    else developmentTier = '边缘'

    const base: TerritoryNationSummary = {
      nationId: nation.id,
      name: nation.name,
      hexCount: cells.length,
      landHexCount: land.length,
      terrainBreakdown,
      avgHeat,
      avgWet,
      avgDevelopment,
      monsoonPct,
      coastPct,
      mountainPct,
      desertPct,
      forestPct,
      aridityIndex,
      habitabilityScore: Math.max(0, Math.min(100, habitabilityScore)),
      developmentTier,
      environmentalProfile: '',
      centroid: { x: Math.round((sx / n) * 10) / 10, y: Math.round((sy / n) * 10) / 10 },
      latBand
    }
    base.environmentalProfile = deriveNationTraits(base, config).environmentalProfile
    out.push(base)
  }
  return out.sort((a, b) => b.landHexCount - a.landHexCount)
}

function roundMapCoord(n: number): number {
  return Math.round(n * 10) / 10
}

function distPointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-8) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function distPointToRiver(px: number, py: number, river: { points: [number, number][] }): number {
  let min = Infinity
  const pts = river.points
  for (let i = 0; i < pts.length - 1; i++) {
    min = Math.min(min, distPointToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]))
  }
  return min
}

function suggestCandidateRole(
  rank: number,
  cell: MapHexCell,
  summary: TerritoryNationSummary,
  nationIndex: number,
  config: WorldGenConfig
): TerritorySettlementCandidate['suggestedRole'] {
  if (rank === 1) return 'capital'
  if (config.includeLandmarks && rank === 2 && nationIndex === 0) return 'landmark'
  if (cell.terrain === 'coast' && summary.coastPct >= 12) return 'port'
  if (cell.terrain === 'mountain' || cell.terrain === 'hill') return rank <= 3 ? 'fortress' : 'town'
  return rank % 3 === 0 ? 'town' : 'city'
}

function buildTerrainCentroids(cells: MapHexCell[]): Partial<Record<TerrainType, TerritoryTerrainCentroid>> {
  const acc = new Map<TerrainType, { sx: number; sy: number; n: number }>()
  for (const c of cells) {
    if (c.terrain === 'ocean') continue
    const cur = acc.get(c.terrain) ?? { sx: 0, sy: 0, n: 0 }
    cur.sx += c.x
    cur.sy += c.y
    cur.n++
    acc.set(c.terrain, cur)
  }
  const out: Partial<Record<TerrainType, TerritoryTerrainCentroid>> = {}
  for (const [terrain, { sx, sy, n }] of acc) {
    if (n < 2) continue
    out[terrain] = {
      x: roundMapCoord(sx / n),
      y: roundMapCoord(sy / n),
      hexCount: n
    }
  }
  return out
}

function adminRoleFromLocation(loc: WorldLocation, _map: WorldMapDocument): string {
  const role = parseAdminRole(loc.authorSettings)
  if (role) return role
  if (loc.type === 'capital') return '首都'
  if (loc.type === 'landmark') return '地标'
  if (loc.type === 'town') return '县市'
  if (loc.type === 'city') return '城市'
  return '小镇'
}

function draftLocationFromWorld(
  loc: WorldLocation,
  map: WorldMapDocument,
  rankByPoint: Map<string, number>,
  nationGeoRef?: ReturnType<typeof nationGeoRefFromCells>,
  nationNamingStyle?: PlaceNamingStyle
): TerritoryLocalDraftLocation {
  const regionName = loc.regionId ? map.regions.find((r) => r.id === loc.regionId)?.name : undefined
  const x = roundMapCoord(loc.x)
  const y = roundMapCoord(loc.y)
  return {
    id: loc.id,
    type: loc.type,
    x,
    y,
    terrain: loc.terrain,
    name: loc.name,
    adminRole: adminRoleFromLocation(loc, map),
    compassHint: nationGeoRef ? compassHintLabel(x, y, nationGeoRef) : undefined,
    placeNamingStyle: nationNamingStyle,
    regionId: loc.regionId,
    regionName,
    population: loc.population,
    development: loc.development,
    candidateRank: rankByPoint.get(`${x},${y}`)
  }
}

function buildAdminProvinces(
  map: WorldMapDocument,
  nationId: string,
  localDraft?: Pick<SocietyGenerationResult, 'locations'>
): TerritoryAdminProvince[] {
  const provinceRegions = (map.regions ?? []).filter((r) =>
    new RegExp(`^prov-${nationId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(r.id)
  )
  if (!provinceRegions.length) return []

  ensureMapHexGrid(map)
  const nationLocs = (localDraft?.locations ?? []).filter((l) => l.nationId === nationId)

  return provinceRegions.map((region) => {
    const landCells = map.hexGrid!.cells.filter(
      (c) => c.nationId === nationId && c.terrain !== 'ocean' && c.regionId === region.id
    )
    const xs = landCells.map((c) => c.x)
    const ys = landCells.map((c) => c.y)
    const bounds =
      landCells.length > 0
        ? {
            minX: roundMapCoord(Math.min(...xs)),
            minY: roundMapCoord(Math.min(...ys)),
            maxX: roundMapCoord(Math.max(...xs)),
            maxY: roundMapCoord(Math.max(...ys))
          }
        : {
            minX: region.polygon[0]?.[0] ?? 0,
            minY: region.polygon[0]?.[1] ?? 0,
            maxX: region.polygon[2]?.[0] ?? 0,
            maxY: region.polygon[2]?.[1] ?? 0
          }
    const seats = nationLocs
      .filter((l) => l.regionId === region.id || l.regionId?.startsWith(`${region.id}-`))
      .map((l) =>
        draftLocationFromWorld(l, map, new Map())
      )
    return {
      id: region.id,
      name: region.name,
      landHexCount: landCells.length || seats.length,
      bounds,
      seats
    }
  })
}

function buildNationSpatial(
  map: WorldMapDocument,
  summary: TerritoryNationSummary,
  nations: WorldNation[],
  nationIndex: number,
  config: WorldGenConfig,
  localDraft?: Pick<SocietyGenerationResult, 'locations'>
): TerritoryNationSpatial {
  ensureMapHexGrid(map)
  const { cols, rows } = map.hexGrid!
  const landCells = map.hexGrid!.cells.filter(
    (c) => c.nationId === summary.nationId && c.terrain !== 'ocean'
  )
  if (!landCells.length) {
    return {
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      extremes: {
        north: { x: 0, y: 0 },
        south: { x: 0, y: 0 },
        west: { x: 0, y: 0 },
        east: { x: 0, y: 0 }
      },
      terrainCentroids: {},
      settlementCandidates: [],
      borderNeighbors: [],
      riverHints: [],
      localDraftLocations: [],
      adminProvinces: []
    }
  }
  const xs = landCells.map((c) => c.x)
  const ys = landCells.map((c) => c.y)
  const bounds = {
    minX: roundMapCoord(Math.min(...xs)),
    minY: roundMapCoord(Math.min(...ys)),
    maxX: roundMapCoord(Math.max(...xs)),
    maxY: roundMapCoord(Math.max(...ys))
  }
  const toPoint = (c: MapHexCell): TerritoryMapPoint => ({ x: roundMapCoord(c.x), y: roundMapCoord(c.y) })
  const pickExtreme = (better: (a: MapHexCell, b: MapHexCell) => boolean): TerritoryMapPoint =>
    toPoint(landCells.reduce((best, cur) => (better(cur, best) ? cur : best)))
  const extremes = {
    north: pickExtreme((a, b) => a.y < b.y),
    south: pickExtreme((a, b) => a.y > b.y),
    west: pickExtreme((a, b) => a.x < b.x),
    east: pickExtreme((a, b) => a.x > b.x)
  }

  const candidateLimit = Math.min(
    8,
    Math.max(3, Math.ceil(Math.sqrt(landCells.length) / 1.2))
  )
  const sampleCap = 280
  const sampled =
    landCells.length <= sampleCap
      ? landCells
      : (() => {
          const out: MapHexCell[] = []
          const step = Math.max(1, Math.floor(landCells.length / sampleCap))
          for (let i = 0; i < landCells.length && out.length < sampleCap; i += step) {
            out.push(landCells[i])
          }
          return out
        })()
  const settlementCandidates: TerritorySettlementCandidate[] = sampled
    .map((cell) => ({ cell, suitability: scoreHexForCity(cell, summary) }))
    .filter((x) => x.suitability > 0)
    .sort((a, b) => b.suitability - a.suitability)
    .slice(0, candidateLimit)
    .map(({ cell, suitability }, i) => ({
      rank: i + 1,
      x: roundMapCoord(cell.x),
      y: roundMapCoord(cell.y),
      q: cell.q,
      r: cell.r,
      terrain: cell.terrain,
      development: Math.round(cell.development ?? 0),
      suitability: Math.round(suitability),
      suggestedRole: suggestCandidateRole(i + 1, cell, summary, nationIndex, config)
    }))

  const borderCounts = new Map<string, { count: number; point: TerritoryMapPoint }>()
  const cellIndex = new Map(map.hexGrid!.cells.map((c) => [`${c.q},${c.r}`, c]))
  for (const cell of landCells) {
    for (const nb of hexNeighborCoords(cell.q, cell.r, cols, rows)) {
      const other = cellIndex.get(`${nb.q},${nb.r}`)
      if (!other?.nationId || other.nationId === summary.nationId) continue
      const cur = borderCounts.get(other.nationId) ?? { count: 0, point: { x: cell.x, y: cell.y } }
      cur.count++
      borderCounts.set(other.nationId, cur)
    }
  }
  const borderNeighbors: TerritoryBorderNeighbor[] = [...borderCounts.entries()]
    .map(([nationId, { count, point }]) => ({
      nationId,
      name: nations.find((n) => n.id === nationId)?.name ?? nationId,
      sharedBorderHexes: count,
      nearestPoint: { x: roundMapCoord(point.x), y: roundMapCoord(point.y) }
    }))
    .sort((a, b) => b.sharedBorderHexes - a.sharedBorderHexes)
    .slice(0, 4)

  const riverHints: TerritoryRiverHint[] = []
  for (const river of map.rivers ?? []) {
    let bestCell = landCells[0]
    let bestDist = Infinity
    for (const cell of landCells) {
      const d = distPointToRiver(cell.x, cell.y, river)
      if (d < bestDist) {
        bestDist = d
        bestCell = cell
      }
    }
    if (bestDist <= 5) {
      riverHints.push({
        riverId: river.id,
        riverName: river.name,
        order: river.order,
        x: roundMapCoord(bestCell.x),
        y: roundMapCoord(bestCell.y),
        distance: roundMapCoord(bestDist)
      })
    }
  }
  riverHints.sort((a, b) => a.distance - b.distance)

  const rankByPoint = new Map(
    settlementCandidates.map((c) => [`${c.x},${c.y}`, c.rank])
  )
  const nationGeoRef = nationGeoRefFromCells(landCells)
  const nationNamingStyle = namingProfileForNation(config, nationIndex).style
  const localDraftLocations: TerritoryLocalDraftLocation[] = (localDraft?.locations ?? [])
    .filter((loc) => loc.nationId === summary.nationId)
    .map((loc) =>
      draftLocationFromWorld(loc, map, rankByPoint, nationGeoRef, nationNamingStyle)
    )

  const adminProvinces = buildAdminProvinces(map, summary.nationId, localDraft)

  return {
    bounds,
    extremes,
    terrainCentroids: buildTerrainCentroids(landCells),
    settlementCandidates,
    borderNeighbors,
    riverHints: riverHints.slice(0, 3),
    localDraftLocations,
    adminProvinces
  }
}

/** 单次 Dify 润色城市默认上限（过大易截断/缺条，可在向导中调高） */
export const SOCIETY_LLM_BATCH_SIZE_DEFAULT = 12
export const SOCIETY_LLM_BATCH_SIZE_MIN = 6
export const SOCIETY_LLM_BATCH_SIZE_MAX = 24
/** 与 SOCIETY_LLM_BATCH_SIZE_DEFAULT 相同，兼容旧引用 */
export const SOCIETY_LLM_BATCH_SIZE = SOCIETY_LLM_BATCH_SIZE_DEFAULT

/** 首批完成后并行请求的批次数（首批仍单独跑，以拿到 world_rules / nations） */
export const SOCIETY_LLM_PARALLEL_DEFAULT = 3
export const SOCIETY_LLM_PARALLEL_MIN = 1
export const SOCIETY_LLM_PARALLEL_MAX = 5

const SOCIETY_LLM_PREFS_KEY = 'nc-society-llm-prefs'

export interface SocietyLlmBatchPrefs {
  batchSize: number
  parallelBatches: number
}

export function clampSocietyLlmBatchPrefs(
  prefs: Partial<SocietyLlmBatchPrefs>
): SocietyLlmBatchPrefs {
  const batchSize = Math.min(
    SOCIETY_LLM_BATCH_SIZE_MAX,
    Math.max(SOCIETY_LLM_BATCH_SIZE_MIN, Math.trunc(prefs.batchSize ?? SOCIETY_LLM_BATCH_SIZE_DEFAULT))
  )
  const parallelBatches = Math.min(
    SOCIETY_LLM_PARALLEL_MAX,
    Math.max(SOCIETY_LLM_PARALLEL_MIN, Math.trunc(prefs.parallelBatches ?? SOCIETY_LLM_PARALLEL_DEFAULT))
  )
  return { batchSize, parallelBatches }
}

export function loadSocietyLlmBatchPrefs(): SocietyLlmBatchPrefs {
  try {
    const raw = localStorage.getItem(SOCIETY_LLM_PREFS_KEY)
    if (!raw) return clampSocietyLlmBatchPrefs({})
    return clampSocietyLlmBatchPrefs(JSON.parse(raw) as Partial<SocietyLlmBatchPrefs>)
  } catch {
    return clampSocietyLlmBatchPrefs({})
  }
}

export function saveSocietyLlmBatchPrefs(prefs: SocietyLlmBatchPrefs): void {
  localStorage.setItem(SOCIETY_LLM_PREFS_KEY, JSON.stringify(clampSocietyLlmBatchPrefs(prefs)))
}

export interface SocietyLlmBatchRunResult {
  parsed: Partial<SocietyGenerationResult> | null
  error?: string
}

export interface SocietyLlmBatchRunner {
  runBatch(territoryBriefJson: string): Promise<SocietyLlmBatchRunResult>
}

export interface SocietyLlmBatchOptions extends SocietyLlmBatchPrefs {}

function stripHeavySpatialForLlmBatch(spatial: TerritoryNationSpatial): void {
  spatial.settlementCandidates = []
  spatial.terrainCentroids = {}
  spatial.riverHints = []
}

/** 并行执行 async 任务，限制同时 in-flight 数量 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items.length) return []
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i]!, i)
    }
  }
  const workers = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

/**
 * 社会层大模型分批润色：首批单独（world_rules + nations），其余批并行。
 */
export async function fetchSocietyLlmPayloadBatched(
  territoryBriefJson: string,
  localLocations: WorldLocation[],
  runner: SocietyLlmBatchRunner,
  options?: Partial<SocietyLlmBatchOptions>,
  onProgress?: (msg: string) => void
): Promise<Partial<SocietyGenerationResult> | null> {
  const { batchSize, parallelBatches } = clampSocietyLlmBatchPrefs(options ?? {})
  const allIds = collectLocalDraftIdsFromBrief(territoryBriefJson)
  const total = allIds.length
  if (!total) return null

  const batchCount = Math.ceil(total / batchSize)
  const chunks: string[][] = []
  for (let b = 0; b < batchCount; b++) {
    chunks.push(allIds.slice(b * batchSize, b * batchSize + batchSize))
  }

  async function runOneBatch(
    batchIndex: number,
    chunk: string[]
  ): Promise<{ batchIndex: number; chunk: string[]; result: SocietyLlmBatchRunResult }> {
    const brief = buildTerritoryBriefForLocationIds(territoryBriefJson, chunk, {
      batchIndex,
      batchCount,
      totalCount: total
    })
    const result = await runner.runBatch(brief)
    return { batchIndex, chunk, result }
  }

  function mergeBatchResult(
    batchIndex: number,
    chunk: string[],
    parsed: Partial<SocietyGenerationResult> | null,
    error: string | undefined,
    locById: Map<string, WorldLocation>,
    batchDiagnostics: SocietyBatchDiagnostic[],
    state: { worldRules?: string; nationsPatch?: SocietyGenerationResult['nations'] }
  ): void {
    if (parsed) {
      if (batchIndex === 0) {
        if (parsed.worldRules?.trim()) state.worldRules = parsed.worldRules
        if (parsed.nations?.length) state.nationsPatch = parsed.nations
      }
      const aligned = alignLlmPatchesToLocalChunk(parsed.locations ?? [], chunk, localLocations)
      for (const [id, loc] of aligned) locById.set(id, loc)
      batchDiagnostics.push({
        batchIndex,
        expected: chunk.length,
        returned: parsed.locations?.length ?? 0,
        aligned: aligned.size,
        error
      })
    } else {
      batchDiagnostics.push({
        batchIndex,
        expected: chunk.length,
        returned: 0,
        aligned: 0,
        error
      })
    }
  }

  if (batchCount === 1) {
    onProgress?.('正在调用大模型润色国家与城市…')
    const { chunk, result } = await runOneBatch(0, chunks[0]!)
    const locById = new Map<string, WorldLocation>()
    const batchDiagnostics: SocietyBatchDiagnostic[] = []
    const state: {
      worldRules?: string
      nationsPatch?: SocietyGenerationResult['nations']
    } = {}
    mergeBatchResult(0, chunk, result.parsed, result.error, locById, batchDiagnostics, state)
    if (!result.parsed && result.error) throw new Error(result.error)
    if (!locById.size && !state.worldRules && !state.nationsPatch?.length) {
      return batchDiagnostics.length ? { locations: [], source: 'llm', batchDiagnostics } : null
    }
    return {
      worldRules: state.worldRules,
      nations: state.nationsPatch,
      locations: Array.from(locById.values()),
      source: 'llm',
      batchDiagnostics
    }
  }

  const locById = new Map<string, WorldLocation>()
  const batchDiagnostics: SocietyBatchDiagnostic[] = []
  const state: {
    worldRules?: string
    nationsPatch?: SocietyGenerationResult['nations']
  } = {}

  onProgress?.(
    `大模型润色第 1/${batchCount} 批（含世界背景，${chunks[0]!.length} 座）…`
  )
  const first = await runOneBatch(0, chunks[0]!)
  mergeBatchResult(
    0,
    first.chunk,
    first.result.parsed,
    first.result.error,
    locById,
    batchDiagnostics,
    state
  )
  if (!first.result.parsed && first.result.error) {
    onProgress?.(`第 1 批失败：${first.result.error.slice(0, 80)}…`)
  }

  const restChunks = chunks.slice(1)
  if (restChunks.length) {
    let doneRest = 0
    onProgress?.(
      `并行润色剩余 ${restChunks.length} 批（最多 ${parallelBatches} 路同时请求，共 ${total} 座）…`
    )
    await mapWithConcurrency(restChunks, parallelBatches, async (chunk, idx) => {
      const batchIndex = idx + 1
      const { result } = await runOneBatch(batchIndex, chunk)
      mergeBatchResult(
        batchIndex,
        chunk,
        result.parsed,
        result.error,
        locById,
        batchDiagnostics,
        state
      )
      doneRest++
      onProgress?.(
        `并行润色进度 ${doneRest}/${restChunks.length} 批完成（全图 ${locById.size}/${total} 座已对齐）…`
      )
      return result
    })
  }

  batchDiagnostics.sort((a, b) => a.batchIndex - b.batchIndex)

  if (!locById.size && !state.worldRules && !state.nationsPatch?.length) {
    return batchDiagnostics.length ? { locations: [], source: 'llm', batchDiagnostics } : null
  }
  return {
    worldRules: state.worldRules,
    nations: state.nationsPatch,
    locations: Array.from(locById.values()),
    source: 'llm',
    batchDiagnostics
  }
}

export interface SocietyBatchDiagnostic {
  batchIndex: number
  expected: number
  returned: number
  aligned: number
  /** 本批 Dify/解析失败时的错误摘要 */
  error?: string
}

/** 将大模型 locations 一对一映射到本地城市（禁止同一条 patch 吸附多城） */
export function buildLlmPatchMapForLocals(
  patches: WorldLocation[],
  local: WorldLocation[],
  geoRefByNation?: Map<string, ReturnType<typeof nationGeoRefFromCells>>
): Map<string, WorldLocation> {
  const ids = local.map((l) => l.id)
  return alignLlmPatchesToLocalChunk(patches, ids, local, geoRefByNation)
}

export interface SocietyBatchMeta {
  batchIndex: number
  batchCount: number
  totalCount: number
}

/** 从 territory_json 收集全部 localDraft id（顺序稳定） */
export function collectLocalDraftIdsFromBrief(territoryBriefJson: string): string[] {
  try {
    const root = JSON.parse(territoryBriefJson) as {
      nations?: { spatial?: { localDraftLocations?: { id: string }[] } }[]
    }
    const ids: string[] = []
    for (const n of root.nations ?? []) {
      for (const d of n.spatial?.localDraftLocations ?? []) {
        if (d.id) ids.push(d.id)
      }
    }
    return ids
  } catch {
    return []
  }
}

/** 仅保留指定城市 id，用于分批调用大模型 */
export function buildTerritoryBriefForLocationIds(
  territoryBriefJson: string,
  locationIds: string[],
  batchMeta?: SocietyBatchMeta
): string {
  const idSet = new Set(locationIds)
  const root = JSON.parse(territoryBriefJson) as {
    projectConfig?: Record<string, unknown>
    nations?: Array<{
      spatial?: TerritoryNationSpatial
      [key: string]: unknown
    }>
  }
  for (const n of root.nations ?? []) {
    const spatial = n.spatial
    if (!spatial) continue
    spatial.localDraftLocations = (spatial.localDraftLocations ?? []).filter((d) =>
      idSet.has(d.id)
    )
    if (spatial.adminProvinces) {
      spatial.adminProvinces = spatial.adminProvinces
        .map((p) => ({
          ...p,
          seats: (p.seats ?? []).filter((s) => idSet.has(s.id))
        }))
        .filter((p) => p.seats.length > 0)
    }
    if (batchMeta && batchMeta.batchIndex > 0) {
      stripHeavySpatialForLlmBatch(spatial)
    }
  }
  if (batchMeta && batchMeta.batchIndex > 0) {
    root.nations = (root.nations ?? []).filter(
      (n) => (n.spatial?.localDraftLocations?.length ?? 0) > 0
    )
  }
  const n = locationIds.length
  root.projectConfig = {
    ...(root.projectConfig ?? {}),
    cityCount: n,
    localLocationCount: n,
    ...(batchMeta
      ? {
          societyBatch: batchMeta
        }
      : {})
  }
  return JSON.stringify(root)
}

export function buildTerritoryBriefJson(
  map: WorldMapDocument,
  nations: WorldNation[],
  config: WorldGenConfig,
  options?: TerritoryBriefOptions
): string {
  const summaries = summarizeTerritories(map, nations, config)
  return JSON.stringify(
    {
      schemaVersion: TERRITORY_JSON_SCHEMA_VERSION,
      authorCreativeBrief: buildAuthorCreativeBrief(config),
      placementSummary:
        options?.localDraft?.locations?.length != null
          ? buildPlacementSummary(
              config,
              summaries,
              options.localDraft.locations.length
            )
          : undefined,
      projectConfig: {
        worldName: config.worldName,
        era: config.era,
        atmosphere: config.atmosphere,
        scale: config.scale,
        climate: config.climate,
        climateHint: climateBiasLabel(config.climate),
        cityCount:
          options?.localDraft?.locations?.length ??
          config.cityCount,
        includeLandmarks: config.includeLandmarks,
        seed: config.seed,
        numPlates: config.numPlates,
        cellsPerProvinceTarget: map.cellsPerProvinceTarget ?? CELLS_PER_PROVINCE_DEFAULT,
        adminDivisionMode: 'province_prefecture_county',
        placeNamingStyle: normalizePlaceNamingStyle(config.placeNamingStyle),
        namingStyleHint: namingStyleBriefLine(config),
        localLocationCount: options?.localDraft?.locations?.length ?? 0,
        cityCountSource:
          (options?.localDraft?.locations?.length ?? 0) > 0
            ? 'admin_division_algorithm'
            : 'config'
      },
      mapContext: {
        hexCols: map.hexGrid?.cols,
        hexRows: map.hexGrid?.rows,
        riverCount: map.rivers?.length ?? 0,
        lakeCount: map.lakes?.length ?? 0
      },
      nations: summaries.map((s, i) => {
        const nation = nations.find((n) => n.id === s.nationId)
        const profile = namingProfileForNation(config, i)
        const displayName = nation?.name?.trim() ?? s.name
        return {
          ...s,
          traits: deriveNationTraits(s, config),
          nationNamingStyle: profile.style,
          polishNationName: nation
            ? nationNameNeedsPolish(displayName, profile) || isDefaultNationName(displayName)
            : true,
          spatial: buildNationSpatial(map, s, nations, i, config, options?.localDraft)
        }
      })
    },
    null,
    0
  )
}

function dominantTerrain(breakdown: Record<string, number>): TerrainType {
  let best: TerrainType = 'plain'
  let bestN = 0
  for (const [t, n] of Object.entries(breakdown)) {
    if (t === 'ocean') continue
    if (n > bestN) {
      bestN = n
      best = t as TerrainType
    }
  }
  return best
}

export function scoreHexForCity(cell: MapHexCell, summary?: TerritoryNationSummary): number {
  if (cell.terrain === 'ocean') return -999
  const h = cell.heat ?? 0.5
  if (h < 0.12) return -999
  const w: Record<TerrainType, number> = {
    ocean: -999,
    plain: 90,
    coast: 82,
    hill: 70,
    forest: 62,
    wetland: 55,
    desert: 40,
    mountain: 35
  }
  let s = w[cell.terrain] ?? 50
  if (h < 0.22) s -= 50
  else if (h < 0.32) s -= 22
  s += (cell.wet ?? 0.5) * 8
  s += (1 - Math.abs(h - 0.48)) * 18
  const dev = cell.development ?? 0
  if (dev > 0) s += Math.min(22, dev / 4)
  if (summary) {
    if (summary.developmentTier === '鼎盛') s += dev * 0.08
    if (summary.developmentTier === '边缘' && cell.terrain === 'desert') s -= 8
    if (summary.coastPct > 20 && cell.terrain === 'coast') s += 10
  }
  return s
}

function enrichNationLocal(
  nation: WorldNation,
  summary: TerritoryNationSummary,
  config: WorldGenConfig,
  rand: () => number,
  index: number
): WorldNation {
  const profile = namingProfileForNation(config, index)
  const dom = dominantTerrain(summary.terrainBreakdown)
  const derived = deriveNationTraits(summary, config)
  const gov = nation.government?.trim() || derived.government
  const cult = nation.culture?.trim() || derived.culture
  const terrainDesc = Object.entries(summary.terrainBreakdown)
    .filter(([t]) => t !== 'ocean')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, n]) => `${TERRAIN_CN[t as TerrainType] ?? t}${n}格`)
    .join('、')

  const keepName = nation.name?.trim() && !isDefaultNationName(nation.name)
  const autoName = generateAutoNationName(profile, index, rand)

  const description =
    nation.description?.trim() ||
    `【${config.worldName}·${config.era}·${config.atmosphere.join('、')}】` +
      `${keepName ? nation.name : autoName}控制约${summary.landHexCount}个陆格（发展层级：${summary.developmentTier}，宜居${summary.habitabilityScore}）。` +
      `环境：${summary.environmentalProfile}。地形以${TERRAIN_CN[dom]}为主（${terrainDesc}）。` +
      `${derived.developmentNote}实行${gov}，文化倾向${cult}。`

  return {
    ...nation,
    name: keepName ? nation.name : autoName,
    government: gov,
    culture: cult,
    description,
    color: nation.color ?? nationColor(index),
    authorSettings:
      nation.authorSettings?.trim() ||
      `环境画像：${summary.environmentalProfile}\n发展：${summary.developmentTier}（均${summary.avgDevelopment}）\n作者可在此继续修改。`
  }
}

export function placeCitiesOnHexTerritory(
  map: WorldMapDocument,
  nations: WorldNation[],
  config: WorldGenConfig,
  seed: number
): WorldLocation[] {
  ensureMapHexGrid(map)
  syncHexClimateFromTerrain(map)
  const summaries = summarizeTerritories(map, nations, config)
  if (!summaries.length) return []
  return placeCitiesByAdminDivisions(map, nations, summaries, config, seed, scoreHexForCity)
}

export function generateLocalSociety(
  preview: WorldGenResult,
  config: WorldGenConfig
): SocietyGenerationResult {
  const map = preview.map
  ensureMapHexGrid(map)
  syncHexClimateFromTerrain(map)
  const nations = [...(map.nations ?? [])]
  const seed = normalizeWorldSeed(config.seed ?? map.seed)
  const summaries = summarizeTerritories(map, nations, config)

  const enriched = nations.map((n, i) => {
    const summary = summaries.find((s) => s.nationId === n.id)
    if (!summary) return n
    return enrichNationLocal(n, summary, config, seededRandom(seed + i * 17), i)
  })

  const locations = placeCitiesOnHexTerritory(map, enriched, config, seed)
  map.nations = enriched

  const snappedLocations = localizeSocietyPlaceNames(snapAllLocationsToLand(map, locations))
  const localizedNations = localizeSocietyNationNames(enriched)

  return {
    worldRules: buildDraftWorldBackground(config, summaries),
    nations: localizedNations,
    locations: snappedLocations,
    source: 'local'
  }
}

function localizeSocietyPlaceNames(locations: WorldLocation[]): WorldLocation[] {
  return locations.map((loc) => {
    let name = loc.name
    if (hasLatinInName(name)) name = latinPlaceNameToChinese(name)
    else name = truncateChinesePlaceName(name)
    return name === loc.name ? loc : { ...loc, name }
  })
}

function localizeSocietyNationNames(nations: WorldNation[]): WorldNation[] {
  return nations.map((n) => {
    let name = n.name
    if (hasLatinInName(name)) name = latinPlaceNameToChinese(name)
    else name = truncateChinesePlaceName(name, 8)
    return name === n.name ? n : { ...n, name }
  })
}

function normalizeWorldSeed(seed?: number): number {
  const v = Math.trunc(seed ?? Date.now())
  return ((v % 65536) + 65536) % 65536
}

export interface SocietyLlmPayload {
  world_rules?: string
  nations_json?: string
  locations_json?: string
  society_json?: string
  /** 分批请求时由客户端填充，用于 UI 诊断 */
  batchDiagnostics?: SocietyBatchDiagnostic[]
}

export function parseSocietyLlmPayload(raw: SocietyLlmPayload | WorldSocietyGenerateResponse): Partial<SocietyGenerationResult> | null {
  const bag = raw as Record<string, unknown>
  const society_json = pickWorkflowOutput(bag, 'society_json') || (raw.society_json ?? '')
  const nations_json = pickWorkflowOutput(bag, 'nations_json') || (raw.nations_json ?? '')
  const locations_json = pickWorkflowOutput(bag, 'locations_json') || (raw.locations_json ?? '')
  const world_rules = pickWorkflowOutput(bag, 'world_rules') || (raw.world_rules ?? '')

  if (society_json.trim()) {
    const obj = unwrapSocietyRoot(society_json)
    const nations = Array.isArray(obj.nations) ? (obj.nations as WorldNation[]) : []
    const locations = Array.isArray(obj.locations) ? (obj.locations as WorldLocation[]) : []
    const wr = String(obj.world_rules ?? obj.worldRules ?? world_rules ?? '').trim()
    if (nations.length || locations.length || wr) {
      return {
        worldRules: wr || undefined,
        nations: nations.length ? nations : undefined,
        locations,
        source: 'llm'
      }
    }
  }

  const nations = nations_json.trim() ? parseJsonLoose<WorldNation[]>(nations_json, []) : []
  const locations = locations_json.trim() ? parseJsonLoose<WorldLocation[]>(locations_json, []) : []
  const wr = world_rules.trim()
  if (!nations.length && !locations.length && !wr) return null
  return {
    worldRules: wr || undefined,
    nations: nations.length ? nations : undefined,
    locations,
    source: 'llm'
  }
}

function snapLocationToNationHex(
  loc: WorldLocation,
  map: WorldMapDocument,
  nationId: string
): WorldLocation | null {
  ensureMapHexGrid(map)
  const cells = map.hexGrid!.cells.filter((c) => c.nationId === nationId && c.terrain !== 'ocean')
  if (!cells.length) return null
  return snapToNearestCell(loc, cells, nationId)
}

/** 聚落若在海上（按 hex 地势或 terrain 字段），吸附到同省（或同国）最近陆地格 */
export function snapLocationToLand(
  loc: WorldLocation,
  map: WorldMapDocument
): WorldLocation {
  ensureMapHexGrid(map)
  const atCell = hexCellAtPercent(map, loc.x, loc.y)
  const onOceanHex = !atCell || atCell.terrain === 'ocean'
  if (!onOceanHex && loc.terrain !== 'ocean') return loc
  const nationId = loc.nationId

  const inProvince = (c: MapHexCell): boolean => {
    if (!loc.regionId) return true
    return c.regionId === loc.regionId || (c.regionId?.startsWith(`${loc.regionId}-`) ?? false)
  }

  let pool = nationId
    ? map.hexGrid!.cells.filter(
        (c) => c.nationId === nationId && c.terrain !== 'ocean' && inProvince(c)
      )
    : []
  if (!pool.length && nationId) {
    pool = map.hexGrid!.cells.filter((c) => c.nationId === nationId && c.terrain !== 'ocean')
  }
  if (!pool.length) {
    pool = map.hexGrid!.cells.filter((c) => c.terrain !== 'ocean')
  }
  if (!pool.length) return loc
  const snapped = snapToNearestCell(loc, pool, nationId ?? pool[0].nationId ?? loc.nationId ?? '')
  return snapped ?? loc
}

function snapToNearestCell(
  loc: WorldLocation,
  cells: MapHexCell[],
  nationId: string
): WorldLocation | null {
  let best = cells[0]
  let bestD = Infinity
  for (const c of cells) {
    const d = (c.x - loc.x) ** 2 + (c.y - loc.y) ** 2
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return {
    ...loc,
    x: best.x,
    y: best.y,
    terrain: best.terrain,
    nationId,
    regionId: best.regionId ?? loc.regionId
  }
}

export function snapAllLocationsToLand(
  map: WorldMapDocument,
  locations: WorldLocation[]
): WorldLocation[] {
  return locations.map((loc) => snapLocationToLand(loc, map))
}

/** loc-1 / loc-01 → loc-001，便于与大模型返回对齐 */
export function normalizeLocationId(id: string): string {
  const m = /^loc-0*(\d+)$/i.exec(id.trim())
  if (m) return `loc-${String(Number.parseInt(m[1], 10)).padStart(3, '0')}`
  return id.trim()
}

function mapCoordKey(x: number, y: number): string {
  return `${(Math.round(x * 10) / 10).toFixed(1)},${(Math.round(y * 10) / 10).toFixed(1)}`
}

const LLM_COORD_MATCH_MAX = 5

function coerceMapCoord(n: unknown, fallback: number): number {
  const v = typeof n === 'string' ? Number.parseFloat(n.trim()) : Number(n)
  return Number.isFinite(v) ? v : fallback
}

/** 补全/规范化大模型聚落字段，缺坐标时用本地草稿 */
export function sanitizeLlmLocation(patch: WorldLocation, local?: WorldLocation): WorldLocation {
  const x = coerceMapCoord(patch.x, local?.x ?? NaN)
  const y = coerceMapCoord(patch.y, local?.y ?? NaN)
  const id = patch.id ? normalizeLocationId(String(patch.id)) : patch.id
  return {
    ...patch,
    id: id || local?.id || patch.id || '',
    x: Number.isFinite(x) ? x : (local?.x ?? 0),
    y: Number.isFinite(y) ? y : (local?.y ?? 0),
    nationId: patch.nationId || local?.nationId,
    terrain: patch.terrain || local?.terrain,
    type: patch.type || local?.type
  }
}

function mergeLlmPatchOntoLocal(
  patch: WorldLocation,
  local: WorldLocation,
  nationRef?: ReturnType<typeof nationGeoRefFromCells>
): WorldLocation {
  const p = sanitizeLlmLocation(patch, local)
  let name = p.name?.trim() || local.name
  if (nationRef) name = alignDirectionInPlaceName(name, local.x, local.y, nationRef)
  if (hasLatinInName(name)) name = latinPlaceNameToChinese(name)
  return {
    ...p,
    id: local.id,
    x: local.x,
    y: local.y,
    type: local.type,
    terrain: local.terrain,
    nationId: local.nationId,
    regionId: local.regionId,
    name,
    description: p.description?.trim() || local.description,
    climate: p.climate?.trim() || local.climate,
    population: p.population?.trim() || local.population,
    development: typeof p.development === 'number' ? p.development : local.development
  }
}

/**
 * 单批大模型结果对齐到 chunk 顺序的本地城市（id/坐标匹配 + 按序回退，避免全吸附到同一城）
 */
export function alignLlmPatchesToLocalChunk(
  patches: WorldLocation[],
  chunkIds: string[],
  localLocations: WorldLocation[],
  geoRefByNation?: Map<string, ReturnType<typeof nationGeoRefFromCells>>
): Map<string, WorldLocation> {
  const orderedLocal = chunkIds
    .map((id) => localLocations.find((l) => l.id === id))
    .filter((l): l is WorldLocation => !!l)
  const out = new Map<string, WorldLocation>()
  const usedLocal = new Set<string>()
  const usedPatchIdx = new Set<number>()

  for (let pi = 0; pi < patches.length; pi++) {
    const patch = sanitizeLlmLocation(patches[pi])
    const available = orderedLocal.filter((l) => !usedLocal.has(l.id))
    const targetId = resolveLocalIdForLlmPatch(patch, available)
    if (!targetId) continue
    usedLocal.add(targetId)
    usedPatchIdx.add(pi)
    const local = orderedLocal.find((l) => l.id === targetId)!
    const ref = local.nationId ? geoRefByNation?.get(local.nationId) : undefined
    out.set(targetId, mergeLlmPatchOntoLocal(patch, local, ref))
  }

  const remLocal = orderedLocal.filter((l) => !usedLocal.has(l.id))
  const remPatches = patches
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => !usedPatchIdx.has(i))
    .map(({ p }) => p)
  const n = Math.min(remLocal.length, remPatches.length)
  for (let i = 0; i < n; i++) {
    const local = remLocal[i]
    const patch = remPatches[i]
    if (!local || out.has(local.id)) continue
    const ref = local.nationId ? geoRefByNation?.get(local.nationId) : undefined
    out.set(local.id, mergeLlmPatchOntoLocal(patch, local, ref))
  }

  return out
}

/**
 * 将大模型返回的聚落对齐到本地 id（优先 id，其次同坐标，再按距离吸附）
 */
export function resolveLocalIdForLlmPatch(
  patch: WorldLocation,
  localCandidates: WorldLocation[]
): string | null {
  if (!localCandidates.length) return null

  if (patch.id) {
    const norm = normalizeLocationId(patch.id)
    const byId = localCandidates.find((l) => l.id === patch.id || l.id === norm)
    if (byId) return byId.id
  }

  const ck = mapCoordKey(patch.x, patch.y)
  const byCoord = localCandidates.find(
    (l) =>
      mapCoordKey(l.x, l.y) === ck &&
      (!patch.nationId || !l.nationId || patch.nationId === l.nationId)
  )
  if (byCoord) return byCoord.id

  let best: WorldLocation | null = null
  let bestD = LLM_COORD_MATCH_MAX
  for (const l of localCandidates) {
    if (patch.nationId && l.nationId && patch.nationId !== l.nationId) continue
    const d = Math.hypot(l.x - patch.x, l.y - patch.y)
    if (d < bestD) {
      bestD = d
      best = l
    }
  }
  return best?.id ?? null
}

/** 统计有多少本地城市能套上大模型润色（按 id/坐标对齐，非裸比 id 集合） */
export function countSocietyLlmMatches(
  local: WorldLocation[],
  llm: Partial<SocietyGenerationResult>
): { matched: number; total: number } {
  const patchMap = buildLlmPatchMapForLocals(llm.locations ?? [], local)
  let matched = 0
  for (const loc of local) {
    const patch = patchMap.get(loc.id)
    if (!patch) continue
    const desc = patch.description?.trim()
    const name = patch.name?.trim()
    if (desc || (name && name !== loc.name)) matched++
  }
  return { matched, total: local.length }
}

/** 合并后统计简介实际被大模型改写的城市数（与 UI 展示一致） */
export function countMergedSocietyDescriptions(
  local: WorldLocation[],
  merged: WorldLocation[]
): { polished: number; total: number } {
  const before = new Map(local.map((l) => [l.id, (l.description ?? '').trim()]))
  let polished = 0
  for (const loc of merged) {
    const prev = before.get(loc.id)
    if (prev === undefined) continue
    const next = (loc.description ?? '').trim()
    if (next && next !== prev) polished++
  }
  return { polished, total: local.length }
}

export function mergeSocietyWithLlm(
  local: SocietyGenerationResult,
  llm: Partial<SocietyGenerationResult>,
  map: WorldMapDocument
): SocietyGenerationResult {
  let nations = local.nations.map((n) => {
    const patch = llm.nations?.find((x) => x.id === n.id)
    if (!patch) return n
    const patchName = patch.name?.trim()
    return {
      ...n,
      name: patchName || n.name,
      government: patch.government?.trim() || n.government,
      culture: patch.culture?.trim() || n.culture,
      description: patch.description?.trim() || n.description,
      authorSettings: patch.authorSettings?.trim() || patch.description?.trim() || n.authorSettings
    }
  })

  const geoRefByNation = nationGeoRefByNationId(map)
  let locations = local.locations
  if (llm.locations?.length) {
    const hasLocalDraft = local.locations.length > 0
    if (hasLocalDraft) {
      const patchMap = buildLlmPatchMapForLocals(llm.locations!, local.locations, geoRefByNation)
      locations = local.locations.map((loc) => {
        const patch = patchMap.get(loc.id)
        if (!patch) return loc
        const ref = loc.nationId ? geoRefByNation.get(loc.nationId) : undefined
        return mergeLlmPatchOntoLocal(patch, loc, ref)
      })
    } else {
      const validated: WorldLocation[] = []
      for (const loc of llm.locations) {
        if (!loc.nationId) continue
        const snapped = snapLocationToNationHex(loc, map, loc.nationId)
        if (snapped) validated.push(snapped)
      }
      if (validated.length >= Math.max(2, Math.floor(local.locations.length * 0.4))) {
        locations = validated.map((loc) => {
          const patch = llm.locations?.find((x) => x.id === loc.id)
          if (!patch?.name?.trim()) return loc
          return { ...loc, name: patch.name.trim(), description: patch.description?.trim() || loc.description }
        })
      }
    }
  }

  locations = snapAllLocationsToLand(map, locations)
  locations = guardLocationDirectionNames(locations, geoRefByNation)
  locations = localizeSocietyPlaceNames(locations)
  nations = localizeSocietyNationNames(nations)

  for (const n of nations) {
    const cap = locations.find((l) => l.nationId === n.id && l.type === 'capital')
    if (cap) n.capitalLocationId = cap.id
  }

  const llmRules = llm.worldRules?.trim()
  const worldRules = llmRules || local.worldRules

  return {
    worldRules,
    nations,
    locations,
    source: 'hybrid'
  }
}

export function applySocietyToPreview(preview: WorldGenResult, society: SocietyGenerationResult): void {
  preview.map.nations = society.nations
  preview.nations = society.nations
  preview.locations = snapAllLocationsToLand(preview.map, society.locations)
  const summaries = summarizeTerritories(preview.map, society.nations)
  normalizeProvinceSeatHierarchy(preview.locations, preview.map, scoreHexForCity, summaries)
  const rules = society.worldRules.trim()
  if (rules) preview.worldRules = rules
}
