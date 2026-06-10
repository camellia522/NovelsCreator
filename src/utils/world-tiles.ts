/**
 * 统一 Tile 语义层：RimWorld 式 Biome 竞争评分 + 起伏分级 + 地貌标签
 * 作为渲染、聚落选址、持久化的单一事实来源
 */

import type { MapTerrainCell, TerrainType } from '@/types/project'
import type { WorldClimateMode } from '@/types/world-gen'
import { equatorDistance, resolveClimate, type ClimateInfo } from '@/utils/world-climate'
import { equatorDistanceFromRow, sphereLatitudeDeg } from '@/utils/world-polar'
import { hash2D } from '@/utils/world-noise'

export type Hilliness = 'flat' | 'small_hills' | 'large_hills' | 'mountains'

export type LandformType =
  | 'none'
  | 'coast'
  | 'fjord'
  | 'canyon'
  | 'escarpment'
  | 'plateau'
  | 'valley'
  | 'archipelago'
  | 'delta'
  | 'lake_shore'

export interface TileBuildContext {
  width: number
  height: number
  seaLevel: number
  elevation: Float32Array
  moisture: Float32Array
  oceanDist: Float32Array
  eastCoast: Uint8Array
  westCoast: Uint8Array
  rainShadow: Uint8Array
  monsoon: Uint8Array
  lakeMask: Uint8Array
  /** 可选：水文汇流强度 */
  flowAccumulation?: Float32Array
}

export interface WorldTileGrid {
  width: number
  height: number
  terrain: TerrainType[]
  hilliness: Hilliness[]
  landform: LandformType[]
  climateLabel: string[]
  fertility: Float32Array
  heat: Float32Array
  rainfall: Float32Array
}

interface BiomeScoreCtx {
  heat: number
  wet: number
  elevAbove: number
  hilliness: Hilliness
  isCoast: boolean
  rainShadow: boolean
  monsoon: boolean
  isLake: boolean
  oceanDist: number
  eq: number
  flow: number
}

type BiomeWorker = {
  terrain: TerrainType
  score: (c: BiomeScoreCtx) => number
}

/** RimWorld 式：各 Biome 对当前格子的适居评分，最高分胜出 */
const BIOME_WORKERS: BiomeWorker[] = [
  {
    terrain: 'ocean',
    score: (c) => (c.elevAbove <= 0 ? 100 : -100)
  },
  {
    terrain: 'coast',
    score: (c) => {
      if (c.elevAbove <= 0 || c.elevAbove > 0.025) return -100
      return 40 + (1 - c.oceanDist) * 30
    }
  },
  {
    terrain: 'mountain',
    score: (c) => {
      if (c.hilliness !== 'mountains') return -100
      if (c.heat < 0.1 && c.wet > 0.3) return 35
      if (c.elevAbove > 0.2) return 28 + c.elevAbove * 40
      return -100
    }
  },
  {
    terrain: 'hill',
    score: (c) => {
      if (c.hilliness !== 'large_hills' && c.hilliness !== 'small_hills') return -100
      if (c.rainShadow && c.wet < 0.35) return -100
      return 22 + (c.elevAbove > 0.08 ? 12 : 0)
    }
  },
  {
    terrain: 'desert',
    score: (c) => {
      if (c.isLake || c.isCoast) return -100
      if (c.wet > 0.38) return -100
      if (c.rainShadow && c.wet < 0.42) return 30 + (0.4 - c.wet) * 50
      if (c.eq > 0.25 && c.eq < 0.72 && c.wet < 0.32) return 25 + (0.35 - c.wet) * 45
      if (c.heat > 0.55 && c.wet < 0.28) return 20
      return -100
    }
  },
  {
    terrain: 'wetland',
    score: (c) => {
      if (c.isLake) return 45
      if (c.wet < 0.55 || c.elevAbove > 0.07) return -100
      if (c.eq > 0.72 && c.elevAbove < 0.06) return 28
      if (c.wet > 0.68 && c.elevAbove < 0.05) return 32
      if (c.monsoon && c.elevAbove < 0.04) return 26
      return -100
    }
  },
  {
    terrain: 'forest',
    score: (c) => {
      if (c.isLake || c.isCoast) return -100
      if (c.hilliness === 'mountains') return -100
      if (c.wet < 0.42) return -100
      if (c.heat < 0.15 || c.heat > 0.88) return -100
      let s = 18 + c.wet * 35
      if (c.monsoon) s += 14
      if (c.eq < 0.45 && c.wet > 0.55) s += 10
      if (c.hilliness === 'large_hills' && c.wet > 0.5) s += 8
      return s
    }
  },
  {
    terrain: 'plain',
    score: (c) => {
      if (c.isLake) return -100
      if (c.isCoast) return -100
      if (c.hilliness === 'mountains') return -100
      let s = 15
      if (c.hilliness === 'flat') s += 12
      if (c.wet > 0.3 && c.wet < 0.65) s += 10
      if (c.heat > 0.25 && c.heat < 0.75) s += 8
      if (c.rainShadow && c.wet < 0.35) s -= 20
      return s
    }
  }
]

function localSlope(elevation: Float32Array, x: number, y: number, size: number): number {
  const idx = y * size + x
  const e = elevation[idx]
  let maxDiff = 0
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    const nx = (x + dx + size) % size
    const ny = y + dy
    if (ny < 0 || ny >= size) continue
    maxDiff = Math.max(maxDiff, Math.abs(e - elevation[ny * size + nx]))
  }
  return maxDiff
}

function localRelief(elevation: Float32Array, x: number, y: number, size: number, r = 2): number {
  let min = Infinity
  let max = -Infinity
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = (x + dx + size) % size
      const ny = y + dy
      if (ny < 0 || ny >= size) continue
      const e = elevation[ny * size + nx]
      min = Math.min(min, e)
      max = Math.max(max, e)
    }
  }
  return max - min
}

export function computeHilliness(
  elevAbove: number,
  slope: number,
  relief: number
): Hilliness {
  if (elevAbove <= 0) return 'flat'
  if (elevAbove > 0.24 || relief > 0.2 || (elevAbove > 0.16 && slope > 0.038)) return 'mountains'
  if (elevAbove > 0.12 || relief > 0.1 || slope > 0.024) return 'large_hills'
  if (elevAbove > 0.045 || slope > 0.013 || relief > 0.048) return 'small_hills'
  return 'flat'
}

function scoreBiome(ctx: BiomeScoreCtx): TerrainType {
  let best: TerrainType = 'plain'
  let bestScore = -Infinity
  for (const w of BIOME_WORKERS) {
    const s = w.score(ctx)
    if (s > bestScore) {
      bestScore = s
      best = w.terrain
    }
  }
  return best
}

function computeFertility(
  terrain: TerrainType,
  wet: number,
  heat: number,
  hilliness: Hilliness,
  flow: number
): number {
  let f = 0.3
  if (terrain === 'plain' || terrain === 'forest') f += 0.25
  if (terrain === 'wetland') f += 0.15
  if (terrain === 'desert' || terrain === 'mountain') f -= 0.25
  if (wet > 0.35 && wet < 0.8) f += 0.2
  if (heat > 0.2 && heat < 0.78) f += 0.15
  if (hilliness === 'flat') f += 0.12
  if (hilliness === 'mountains') f -= 0.2
  if (flow > 0.4) f += 0.1
  return Math.max(0, Math.min(1, f))
}

function detectLandform(
  x: number,
  y: number,
  size: number,
  ctx: TileBuildContext,
  hilliness: Hilliness,
  terrain: TerrainType,
  climate: ClimateInfo
): LandformType {
  const idx = y * size + x
  const elev = ctx.elevation[idx]
  const elevAbove = Math.max(0, elev - ctx.seaLevel)

  if (ctx.lakeMask[idx]) return 'lake_shore'

  if (terrain === 'coast' || (elevAbove > 0 && elevAbove < 0.035 && ctx.oceanDist[idx] < 0.1)) {
    if (terrain === 'coast' && ctx.flowAccumulation && ctx.flowAccumulation[idx] > 0.8) {
      return 'delta'
    }
    if (climate.heat < 0.35 && ctx.westCoast[idx] && hilliness !== 'flat') return 'fjord'
    return 'coast'
  }

  if (ctx.oceanDist[idx] < 0.04 && elevAbove > 0 && elevAbove < 0.08) {
    const landNeighbors = countLandNeighbors(x, y, size, ctx)
    if (landNeighbors <= 5) return 'archipelago'
  }

  const slope = localSlope(ctx.elevation, x, y, size)
  const relief = localRelief(ctx.elevation, x, y, size, 2)

  if (hilliness === 'flat' && relief > 0.07 && slope < 0.008) {
    const edgeSteep = hasSteepEdge(x, y, size, ctx.elevation, ctx.seaLevel)
    if (edgeSteep) return 'plateau'
  }

  if (slope > 0.04 && elevAbove > 0.05) {
    const asym = slopeAsymmetry(x, y, size, ctx.elevation)
    if (asym > 0.025) return 'escarpment'
    if (relief > 0.12) return 'canyon'
  }

  if (hilliness === 'flat' && terrain !== 'wetland') {
    const isLocalMin = isLocalElevationMin(x, y, size, ctx.elevation)
    if (isLocalMin && ctx.moisture[idx] > 0.4) return 'valley'
  }

  return 'none'
}

function countLandNeighbors(x: number, y: number, size: number, ctx: TileBuildContext): number {
  let n = 0
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = (x + dx + size) % size
      const ny = y + dy
      if (ny < 0 || ny >= size) continue
      if (ctx.elevation[ny * size + nx] > ctx.seaLevel + 0.015) n++
    }
  }
  return n
}

function hasSteepEdge(
  x: number,
  y: number,
  size: number,
  elevation: Float32Array,
  seaLevel: number
): boolean {
  const idx = y * size + x
  const e = elevation[idx]
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    const nx = (x + dx + size) % size
    const ny = y + dy
    if (ny < 0 || ny >= size) continue
    const diff = Math.abs(e - elevation[ny * size + nx])
    if (diff > 0.06 && elevation[ny * size + nx] < seaLevel + 0.05) return true
  }
  return false
}

function slopeAsymmetry(x: number, y: number, size: number, elevation: Float32Array): number {
  const idx = y * size + x
  const e = elevation[idx]
  const diffs: number[] = []
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    const nx = (x + dx + size) % size
    const ny = y + dy
    if (ny < 0 || ny >= size) continue
    diffs.push(e - elevation[ny * size + nx])
  }
  if (diffs.length < 2) return 0
  diffs.sort((a, b) => a - b)
  return diffs[diffs.length - 1] - diffs[0]
}

function isLocalElevationMin(x: number, y: number, size: number, elevation: Float32Array): boolean {
  const idx = y * size + x
  const e = elevation[idx]
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1]
  ]) {
    const nx = (x + dx + size) % size
    const ny = y + dy
    if (ny < 0 || ny >= size) continue
    if (elevation[ny * size + nx] < e - 0.002) return false
  }
  return true
}

/** 构建统一 Tile 网格（单一事实来源） */
export function buildWorldTiles(ctx: TileBuildContext, climateMode: WorldClimateMode): WorldTileGrid {
  const { width: size, height, elevation, seaLevel } = ctx
  const n = size * height
  const terrain: TerrainType[] = new Array(n)
  const hillinessArr: Hilliness[] = new Array(n)
  const landform: LandformType[] = new Array(n)
  const climateLabel: string[] = new Array(n)
  const fertility = new Float32Array(n)
  const heat = new Float32Array(n)
  const rainfall = new Float32Array(n)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x
      const elev = elevation[idx]
      const elevAbove = Math.max(0, elev - seaLevel)
      const latDeg = sphereLatitudeDeg(x, y, size, height)
      const yNorm = (90 - latDeg) / 180
      const eq = equatorDistanceFromRow(y, height)
      const slope = localSlope(elevation, x, y, size)
      const relief = localRelief(elevation, x, y, size, 2)
      const hill = computeHilliness(elevAbove, slope, relief)

      let climate = resolveClimate(
        yNorm,
        {
          isEastCoast: ctx.eastCoast[idx] === 1,
          isWestCoast: ctx.westCoast[idx] === 1,
          rainShadow: ctx.rainShadow[idx] === 1,
          monsoon: ctx.monsoon[idx] === 1,
          elevAboveSea: elevAbove,
          oceanDist: ctx.oceanDist[idx]
        },
        climateMode
      )

      if (Math.abs(latDeg) >= 75) {
        climate = {
          ...climate,
          heat: Math.min(climate.heat, 0.12),
          label: '苔原'
        }
      }

      heat[idx] = climate.heat
      rainfall[idx] = climate.wet

      const flow = ctx.flowAccumulation?.[idx] ?? 0
      const isLake = ctx.lakeMask[idx] === 1 && ctx.oceanDist[idx] > 0.1
      const isCoast =
        (elevAbove > 0 && elevAbove <= 0.04) || (ctx.oceanDist[idx] < 0.09 && elevAbove < 0.06)

      const t = scoreBiome({
        heat: climate.heat,
        wet: climate.wet,
        elevAbove,
        hilliness: hill,
        isCoast,
        rainShadow: ctx.rainShadow[idx] === 1,
        monsoon: ctx.monsoon[idx] === 1,
        isLake,
        oceanDist: ctx.oceanDist[idx],
        eq,
        flow
      })

      if (ctx.oceanDist[idx] < 0.05 && elevAbove < 0.03) {
        terrain[idx] = 'ocean'
      } else if (isLake) {
        terrain[idx] = 'wetland'
      } else {
        terrain[idx] = t
      }
      hillinessArr[idx] = hill
      climateLabel[idx] = climate.label
      fertility[idx] = computeFertility(terrain[idx], climate.wet, climate.heat, hill, flow)
      landform[idx] = detectLandform(x, y, size, ctx, hill, terrain[idx], climate)
    }
  }

  return {
    width: size,
    height,
    terrain,
    hilliness: hillinessArr,
    landform,
    climateLabel,
    fertility,
    heat,
    rainfall
  }
}

export function tileAt(grid: WorldTileGrid, x: number, y: number): number {
  const xi = Math.min(grid.width - 1, Math.max(0, Math.floor(x)))
  const yi = Math.min(grid.height - 1, Math.max(0, Math.floor(y)))
  return yi * grid.width + xi
}

export function sampleTerrainFromGrid(grid: WorldTileGrid, xNorm: number, yNorm: number): TerrainType {
  const x = xNorm * grid.width
  const y = yNorm * grid.height
  return grid.terrain[tileAt(grid, x, y)]
}

export function sampleHilliness(grid: WorldTileGrid, xNorm: number, yNorm: number): Hilliness {
  const x = xNorm * grid.width
  const y = yNorm * grid.height
  return grid.hilliness[tileAt(grid, x, y)]
}

export function sampleLandform(grid: WorldTileGrid, xNorm: number, yNorm: number): LandformType {
  const x = xNorm * grid.width
  const y = yNorm * grid.height
  return grid.landform[tileAt(grid, x, y)]
}

export function biomeColorFromTile(
  terrain: TerrainType,
  climateLabel: string,
  landform: LandformType,
  isLake: boolean,
  /** 为 false 时高纬不在瓦片阶段涂白，由 applyPolarIceCap 统一覆雪 */
  paintPolarSnow = true
): [number, number, number] {
  if (isLake) return [48, 95, 142]
  if (
    !paintPolarSnow &&
    (climateLabel.includes('冰原') || climateLabel.includes('苔原') || climateLabel.includes('极地'))
  ) {
    if (terrain === 'mountain') return [108, 102, 98]
    if (terrain === 'desert') return [168, 150, 118]
    if (terrain === 'forest') return [72, 98, 58]
    return [92, 108, 78]
  }
  if (climateLabel.includes('冰原')) {
    if (terrain === 'mountain') return [228, 236, 244]
    return [210, 222, 234]
  }
  if (climateLabel.includes('苔原')) return [168, 178, 168]
  if (terrain === 'ocean') return [18, 52, 88]
  if (terrain === 'coast' || landform === 'coast' || landform === 'delta') return [82, 112, 102]
  if (terrain === 'mountain' || landform === 'canyon' || landform === 'escarpment') return [88, 84, 78]
  if (terrain === 'hill' || landform === 'plateau') return [96, 104, 74]
  if (terrain === 'desert') return [188, 158, 102]
  if (landform === 'lake_shore') return [52, 100, 148]
  if (terrain === 'wetland' || landform === 'valley') return [62, 92, 82]
  if (terrain === 'forest') {
    if (climateLabel.includes('季风')) return [38, 92, 48]
    return [48, 98, 52]
  }
  if (climateLabel.includes('地中海')) return [120, 138, 72]
  if (climateLabel.includes('温带海洋')) return [72, 118, 62]
  if (landform === 'fjord') return [70, 100, 95]
  if (landform === 'archipelago') return [90, 120, 105]
  return [86, 114, 66]
}

/** 下采样为可持久化的 terrainCells（64×64 逻辑格） */
export function downsampleTerrainCells(
  grid: WorldTileGrid,
  ctx: TileBuildContext,
  targetSize = 64,
  seed = 0
): MapTerrainCell[] {
  const cells: MapTerrainCell[] = []
  const stepX = grid.width / targetSize
  const stepY = grid.height / targetSize

  for (let gy = 0; gy < targetSize; gy++) {
    for (let gx = 0; gx < targetSize; gx++) {
      const px = Math.floor(gx * stepX + stepX * 0.5)
      const py = Math.floor(gy * stepY + stepY * 0.5)
      const idx = tileAt(grid, px, py)
      const elev = ctx.elevation[idx]
      if (elev <= ctx.seaLevel && grid.terrain[idx] === 'ocean') continue

      cells.push({
        x: Math.round(((gx + 0.5) / targetSize) * 1000) / 10,
        y: Math.round(((gy + 0.5) / targetSize) * 1000) / 10,
        terrain: grid.terrain[idx],
        climate: grid.climateLabel[idx],
        hilliness: grid.hilliness[idx],
        landform: grid.landform[idx] !== 'none' ? grid.landform[idx] : undefined
      })
    }
  }

  void hash2D(seed, targetSize, 0)
  return cells
}

export const HILLINESS_CN: Record<Hilliness, string> = {
  flat: '平坦',
  small_hills: '小丘陵',
  large_hills: '大丘陵',
  mountains: '山地'
}

export const LANDFORM_CN: Record<LandformType, string> = {
  none: '',
  coast: '海岸',
  fjord: '峡湾',
  canyon: '峡谷',
  escarpment: '断崖',
  plateau: '高原台地',
  valley: '河谷',
  archipelago: '群岛',
  delta: '河口三角洲',
  lake_shore: '湖岸'
}
