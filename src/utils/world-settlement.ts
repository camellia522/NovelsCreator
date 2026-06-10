/**
 * 聚落区位论：自然 + 社会因素评分，在国家领土内选址
 */

import type {
  MapLake,
  MapRegion,
  MapRiver,
  MapTerrainCell,
  SettlementSuitability,
  TerrainType,
  WorldLocation,
  WorldNation
} from '@/types/project'
import type { WorldGenConfig } from '@/types/world-gen'
import type { ClimateInfo } from '@/utils/world-climate'
import { climateLabelShort } from '@/utils/world-climate'
import { percentToLatLon } from '@/utils/world-map-coords'
import { seededRandom } from '@/utils/world-noise'
import {
  HILLINESS_CN,
  LANDFORM_CN,
  sampleHilliness,
  sampleLandform,
  type Hilliness,
  type WorldTileGrid
} from '@/utils/world-tiles'

export interface SettlementContext {
  width: number
  height: number
  seaLevel: number
  elevation: Float32Array
  oceanDist: Float32Array
  moisture: Float32Array
  monsoon: Uint8Array
  lakeMask?: Uint8Array
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function nearRiver(x: number, y: number, rivers: MapRiver[], maxD = 4): boolean {
  for (const r of rivers) {
    for (const [rx, ry] of r.points) {
      if (Math.hypot(x - rx, y - ry) < maxD) return true
    }
  }
  return false
}

function nearLake(x: number, y: number, lakes: MapLake[], maxD = 5): boolean {
  for (const l of lakes) {
    if (Math.hypot(x - l.cx, y - l.cy) < l.radius + maxD) return true
  }
  return false
}

function pointInNationTerritory(
  x: number,
  y: number,
  nation: WorldNation,
  regions: MapRegion[]
): boolean {
  const nationRegions = regions.filter((r) => nation.regionIds.includes(r.id))
  for (const r of nationRegions) {
    let inside = false
    for (let i = 0, j = r.polygon.length - 1; i < r.polygon.length; j = i++) {
      const [xi, yi] = r.polygon[i]
      const [xj, yj] = r.polygon[j]
      const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi
      if (hit) inside = !inside
    }
    if (inside) return true
  }
  return false
}

/** 聚落必须落在稳定陆地上（国家多边形常包住海域，需比 isLandAtPercent 更严） */
export function isStrictLandForSettlement(xPct: number, yPct: number, deps: PlaceSettlementDeps): boolean {
  const { lat } = percentToLatLon(xPct, yPct)
  if (Math.abs(lat) > 72) return false

  const { ctx, tiles } = deps
  const px = Math.min(ctx.width - 1, Math.max(0, Math.floor((xPct / 100) * ctx.width)))
  const py = Math.min(ctx.height - 1, Math.max(0, Math.floor((yPct / 100) * ctx.height)))
  const centerIdx = py * ctx.width + px

  if (ctx.elevation[centerIdx] <= ctx.seaLevel + 0.035) return false
  if (ctx.lakeMask?.[centerIdx]) return false
  if (ctx.oceanDist[centerIdx] < 0.065) return false

  if (tiles) {
    if (tiles.terrain[centerIdx] === 'ocean') return false
    const xNorm = xPct / 100
    const yNorm = yPct / 100
    const t = deps.sampleTerrain(xNorm, yNorm)
    if (t === 'ocean') return false
  }

  let land = 0
  let total = 0
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = (px + dx + ctx.width) % ctx.width
      const ny = py + dy
      if (ny < 0 || ny >= ctx.height) continue
      const idx = ny * ctx.width + nx
      total++
      if (ctx.lakeMask?.[idx]) continue
      if (ctx.elevation[idx] > ctx.seaLevel + 0.028) land++
    }
  }
  if (total === 0 || land / total < 0.72) return false

  return true
}

function findNearestLandPercent(
  x: number,
  y: number,
  deps: PlaceSettlementDeps,
  nation: WorldNation,
  maxRadius = 16
): { x: number; y: number } | null {
  for (let r = 0.6; r <= maxRadius; r += 0.6) {
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2
      const nx = Math.round((x + Math.cos(ang) * r) * 10) / 10
      const ny = Math.round((y + Math.sin(ang) * r) * 10) / 10
      if (nx < 4 || nx > 96 || ny < 4 || ny > 96) continue
      if (!pointInNationTerritory(nx, ny, nation, deps.regions)) continue
      if (!isStrictLandForSettlement(nx, ny, deps)) continue
      return { x: nx, y: ny }
    }
  }
  return null
}

function refineSettlementLocations(locations: WorldLocation[], deps: PlaceSettlementDeps): WorldLocation[] {
  const nations = deps.nations
  const out: WorldLocation[] = []

  for (const loc of locations) {
    const nation = nations.find((n) => n.id === loc.nationId)
    if (!nation) continue

    let x = loc.x
    let y = loc.y
    if (!isStrictLandForSettlement(x, y, deps)) {
      const snap = findNearestLandPercent(x, y, deps, nation)
      if (!snap) continue
      x = snap.x
      y = snap.y
    }

    const minDist =
      deps.config.scale === 'planet' ? 4 : deps.config.scale === 'world' ? 5 : deps.config.scale === 'kingdom' ? 10 : 7
    if (out.some((l) => dist(l, { x, y }) < minDist)) continue

    const xNorm = x / 100
    const yNorm = y / 100
    const terrain = deps.sampleTerrain(xNorm, yNorm)
    if (terrain === 'ocean' || terrain === 'coast') continue

    out.push({
      ...loc,
      x,
      y,
      terrain: terrain === 'wetland' ? terrain : loc.terrain === 'ocean' ? 'plain' : terrain
    })
  }

  return out
}

export function scoreSettlementSite(
  x: number,
  y: number,
  ctx: SettlementContext,
  terrain: TerrainType,
  climate: ClimateInfo,
  rivers: MapRiver[],
  lakes: MapLake[],
  hilliness?: Hilliness,
  fertility?: number,
  landform?: string
): SettlementSuitability {
  const px = Math.floor((x / 100) * ctx.width)
  const py = Math.floor((y / 100) * ctx.height)
  const idx = py * ctx.width + px
  const elev = ctx.elevation[idx]
  const elevAbove = Math.max(0, elev - ctx.seaLevel)
  const natural: string[] = []
  const social: string[] = []
  let score = 20

  if (terrain === 'mountain' || terrain === 'desert') score -= 35
  if (hilliness === 'mountains' || hilliness === 'large_hills') score -= 18
  if (hilliness === 'flat' || hilliness === 'small_hills') score += 10
  if (landform === 'canyon' || landform === 'escarpment') score -= 25
  if (landform === 'delta' || landform === 'valley') score += 12
  if (fertility !== undefined && fertility > 0.55) {
    score += 14
    natural.push('高肥力土壤')
  } else if (fertility !== undefined && fertility < 0.25) {
    score -= 10
  }
  if (terrain === 'plain' || terrain === 'forest') {
    score += 18
    natural.push('土壤适宜农耕')
  }
  if (terrain === 'coast' || terrain === 'wetland') {
    score += 10
    natural.push('近水湿地')
  }

  if (climate.heat > 0.25 && climate.heat < 0.82) {
    score += 12
    natural.push('气候宜居')
  } else {
    score -= 8
  }
  if (climate.wet > 0.35 && climate.wet < 0.85) {
    score += 10
    natural.push('降水适中')
  }

  if (ctx.oceanDist[idx] < 0.08 && ctx.oceanDist[idx] > 0) {
    score += 10
    natural.push('近海但不在水上')
    social.push('海运交通')
  } else if (ctx.oceanDist[idx] < 0.04) {
    score -= 20
  }
  if (nearRiver(x, y, rivers)) {
    score += 16
    natural.push('河流水源')
    social.push('内河航运')
  }
  if (nearLake(x, y, lakes)) {
    score += 12
    natural.push('湖泊淡水')
  }
  if (ctx.monsoon[idx]) {
    score += 8
    natural.push('季风带来丰沛季雨')
  }

  if (elevAbove < 0.08) {
    score += 8
    social.push('平坦利于建设')
  } else if (elevAbove > 0.18) {
    score -= 12
  }

  if (ctx.moisture[idx] > 0.5) social.push('农业劳动力充足')
  social.push('政策鼓励垦殖')
  if (climate.label.includes('温带') || climate.label.includes('亚热带')) {
    social.push('历史交通要道')
  }

  score = Math.max(0, Math.min(100, score))
  return { score, natural, social }
}

const CITY_PREFIX = ['青', '云', '临', '安', '宁', '平', '江', '河', '岳', '岚', '星', '月', '白', '赤', '玄']
const CITY_SUFFIX = ['城', '州', '府', '港', '关', '镇', '原', '谷', '湾', '渡']

function cityName(rand: () => number, type: WorldLocation['type']): string {
  const p = CITY_PREFIX[Math.floor(rand() * CITY_PREFIX.length)]
  const s = CITY_SUFFIX[Math.floor(rand() * CITY_SUFFIX.length)]
  if (type === 'capital') return `${p}${s}（都）`
  if (type === 'fortress') return `${p}关`
  if (type === 'landmark') return `${p}峰`
  return `${p}${s}`
}

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

export interface PlaceSettlementDeps {
  config: WorldGenConfig
  ctx: SettlementContext
  nations: WorldNation[]
  regions: MapRegion[]
  rivers: MapRiver[]
  lakes: MapLake[]
  /** 已栅格化的陆地点，聚落优先从此采样，避免落海 */
  terrainCells?: MapTerrainCell[]
  isLand: (xNorm: number, yNorm: number) => boolean
  isLandAtPercent: (x: number, y: number) => boolean
  sampleTerrain: (xNorm: number, yNorm: number) => TerrainType
  getClimate: (px: number, py: number) => ClimateInfo
  findRegion: (x: number, y: number) => MapRegion | undefined
  cityCountLimits: (scale: WorldGenConfig['scale']) => { min: number; max: number }
  tiles?: WorldTileGrid
}

const SETTLEMENT_TERRAINS = new Set<TerrainType>(['plain', 'hill', 'forest'])

function pickSettlementCoords(
  nation: WorldNation,
  deps: PlaceSettlementDeps,
  rand: () => number
): { x: number; y: number } | null {
  const cells = deps.terrainCells?.filter(
    (c) =>
      SETTLEMENT_TERRAINS.has(c.terrain) &&
      pointInNationTerritory(c.x, c.y, nation, deps.regions)
  )
  if (cells?.length) {
    for (let t = 0; t < 80; t++) {
      const c = cells[Math.floor(rand() * cells.length)]
      if (isStrictLandForSettlement(c.x, c.y, deps)) return { x: c.x, y: c.y }
    }
  }
  const x = 4 + rand() * 92
  const y = 4 + rand() * 92
  if (!pointInNationTerritory(x, y, nation, deps.regions)) return null
  if (!isStrictLandForSettlement(x, y, deps)) return null
  return { x, y }
}

/** 根据 terrainCells 把聚落坐标校正到陆地（用于球面/平面标注） */
export function resolveDisplayLocation(
  map: { terrainCells?: MapTerrainCell[] },
  loc: WorldLocation
): { x: number; y: number } {
  const cells = map.terrainCells ?? []
  if (!cells.length) return { x: loc.x, y: loc.y }

  const near = cells.find(
    (c) =>
      Math.hypot(c.x - loc.x, c.y - loc.y) < 2.5 &&
      SETTLEMENT_TERRAINS.has(c.terrain)
  )
  if (near) return { x: near.x, y: near.y }

  let best: MapTerrainCell | null = null
  let bestD = Infinity
  for (const c of cells) {
    if (!SETTLEMENT_TERRAINS.has(c.terrain)) continue
    const d = Math.hypot(c.x - loc.x, c.y - loc.y)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  if (best && bestD < 14) return { x: best.x, y: best.y }
  return { x: loc.x, y: loc.y }
}

export function placeSettlements(deps: PlaceSettlementDeps, seed: number): WorldLocation[] {
  const rand = seededRandom(seed + 12000)
  const limits = deps.cityCountLimits(deps.config.scale)
  const target = Math.max(limits.min, Math.min(limits.max, deps.config.cityCount))
  const minDist =
    deps.config.scale === 'planet' ? 4 : deps.config.scale === 'world' ? 5 : deps.config.scale === 'kingdom' ? 10 : 7

  const locations: WorldLocation[] = []
  const slotsPerNation = Math.max(1, Math.ceil(target / Math.max(1, deps.nations.length)))

  for (const nation of deps.nations) {
    const candidates: {
      x: number
      y: number
      suit: SettlementSuitability
      terrain: TerrainType
      climate: ClimateInfo
      region?: MapRegion
      hill?: Hilliness
      landform?: string
    }[] = []

    for (let t = 0; t < 600; t++) {
      const picked = pickSettlementCoords(nation, deps, rand)
      if (!picked) continue
      const { x, y } = picked
      const xNorm = x / 100
      const yNorm = y / 100
      const terrain = deps.sampleTerrain(xNorm, yNorm)
      if (terrain === 'ocean' || terrain === 'coast' || terrain === 'wetland') continue
      if (!['plain', 'hill', 'forest', 'wetland'].includes(terrain)) continue

      const hill = deps.tiles ? sampleHilliness(deps.tiles, xNorm, yNorm) : undefined
      if (hill === 'mountains') continue

      const landform = deps.tiles ? sampleLandform(deps.tiles, xNorm, yNorm) : undefined
      if (landform === 'canyon' || landform === 'escarpment' || landform === 'archipelago') continue

      const px = Math.floor(xNorm * deps.ctx.width)
      const py = Math.floor(yNorm * deps.ctx.height)
      const climateInfo = deps.getClimate(px, py)
      const idx = py * deps.ctx.width + px
      const fert = deps.tiles?.fertility[idx]
      const suit = scoreSettlementSite(
        x,
        y,
        deps.ctx,
        terrain,
        climateInfo,
        deps.rivers,
        deps.lakes,
        hill,
        fert,
        landform
      )
      if (suit.score < 28) continue
      candidates.push({
        x,
        y,
        suit,
        terrain,
        climate: climateInfo,
        region: deps.findRegion(x, y),
        hill,
        landform
      })
    }

    candidates.sort((a, b) => b.suit.score - a.suit.score)
    let placed = 0

    for (const c of candidates) {
      if (placed >= slotsPerNation && locations.length >= target) break
      if (locations.some((l) => dist(l, c) < minDist)) continue

      const isFirstInNation = !locations.some((l) => l.nationId === nation.id)
      const globalIdx = locations.length
      const type: WorldLocation['type'] = isFirstInNation
        ? 'capital'
        : deps.config.includeLandmarks && globalIdx === target - 1
          ? 'landmark'
          : globalIdx % 4 === 0
            ? 'town'
            : 'city'

      const name = cityName(rand, type)
      const nat = c.suit.natural.slice(0, 3).join('、')
      const soc = c.suit.social.slice(0, 2).join('、')
      const hillLabel = c.hill ? HILLINESS_CN[c.hill] : ''
      const landLabel = c.landform && c.landform !== 'none' ? LANDFORM_CN[c.landform as keyof typeof LANDFORM_CN] : ''

      locations.push({
        id: `loc-${String(globalIdx + 1).padStart(3, '0')}`,
        name,
        type,
        x: Math.round(c.x * 10) / 10,
        y: Math.round(c.y * 10) / 10,
        terrain: c.terrain,
        climate: climateLabelShort(c.climate),
        regionId: c.region?.id,
        nationId: nation.id,
        suitability: c.suit,
        description: `${name}隶属${nation.name}，${TERRAIN_CN[c.terrain]}${hillLabel ? `（${hillLabel}）` : ''}${landLabel ? `，${landLabel}` : ''}，${c.climate.summary}。自然：${nat}；社会：${soc}。`,
        population:
          type === 'capital' ? '50万+' : type === 'city' ? '10–30万' : type === 'town' ? '1–5万' : '千人级'
      })

      if (isFirstInNation) nation.capitalLocationId = locations[locations.length - 1].id
      placed++
      if (locations.length >= target) break
    }
  }

  return refineSettlementLocations(locations, deps)
}
