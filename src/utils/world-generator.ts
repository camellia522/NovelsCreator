import type { WorldGenConfig, WorldGenResult, WorldScale } from '@/types/world-gen'
import { buildWorldGenResultFromNative } from '@/utils/world-engine-native-adapter'
import { normalizeWorldSeed } from '@/utils/world-seed'
import { generateWorldFromHeightmap } from '@/utils/world-heightmap'
import type {
  MapRegion,
  MapRiver,
  MapTerrainCell,
  TerrainType,
  WorldLocation,
  WorldMapDocument
} from '@/types/project'

interface ScaleParams {
  grid: number
  plateCount: number
  continentalCount: number
  seaLevel: number
  minCityDist: number
  maxCities: number
  maxRivers: number
  label: string
}

interface GenContext {
  grid: number
  cell: number
  scale: WorldScale
  params: ScaleParams
}

/** 默认参考格大小（大陆级 128 格） */
export const MAP_CELL_SIZE = 100 / 128

export function gridSizeForScale(scale: WorldScale): number {
  switch (scale) {
    case 'kingdom':
      return 96
    case 'archipelago':
      return 112
    case 'continent':
      return 128
    case 'world':
      return 160
    case 'planet':
      return 192
    default:
      return 128
  }
}

export function cityCountLimits(scale: WorldScale): { min: number; max: number; default: number } {
  switch (scale) {
    case 'kingdom':
      return { min: 3, max: 12, default: 6 }
    case 'archipelago':
      return { min: 3, max: 16, default: 8 }
    case 'continent':
      return { min: 3, max: 24, default: 10 }
    case 'world':
      return { min: 5, max: 40, default: 18 }
    case 'planet':
      return { min: 8, max: 64, default: 28 }
    default:
      return { min: 3, max: 24, default: 10 }
  }
}

export function scaleLabel(scale: WorldScale): string {
  switch (scale) {
    case 'kingdom':
      return '王国级'
    case 'archipelago':
      return '群岛级'
    case 'continent':
      return '大陆级'
    case 'world':
      return '世界级'
    case 'planet':
      return '地球级'
    default:
      return scale
  }
}

function scaleParams(scale: WorldScale): ScaleParams {
  const grid = gridSizeForScale(scale)
  switch (scale) {
    case 'kingdom':
      return {
        grid,
        plateCount: 5,
        continentalCount: 2,
        seaLevel: -0.02,
        minCityDist: 10,
        maxCities: 12,
        maxRivers: 4,
        label: '王国级'
      }
    case 'archipelago':
      return {
        grid,
        plateCount: 9,
        continentalCount: 4,
        seaLevel: 0.08,
        minCityDist: 14,
        maxCities: 16,
        maxRivers: 6,
        label: '群岛级'
      }
    case 'world':
      return {
        grid,
        plateCount: 11,
        continentalCount: 5,
        seaLevel: 0.04,
        minCityDist: 7,
        maxCities: 40,
        maxRivers: 10,
        label: '世界级'
      }
    case 'planet':
      return {
        grid,
        plateCount: 14,
        continentalCount: 7,
        seaLevel: 0.03,
        minCityDist: 5,
        maxCities: 64,
        maxRivers: 14,
        label: '地球级'
      }
    default:
      return {
        grid,
        plateCount: 7,
        continentalCount: 3,
        seaLevel: 0.02,
        minCityDist: 12,
        maxCities: 24,
        maxRivers: 6,
        label: '大陆级'
      }
  }
}

function createContext(scale: WorldScale): GenContext {
  const params = scaleParams(scale)
  return { grid: params.grid, cell: 100 / params.grid, scale, params }
}

/** 归一化坐标 → 与尺度无关的噪声采样 */
function nx(gx: number, grid: number): number {
  return (gx / grid) * 48
}

// ── 随机与噪声 ──────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function hash2D(x: number, y: number, seed: number): number {
  let h = seed + x * 374761393 + y * 668265263
  h = (h ^ (h >>> 13)) >>> 0
  h = (h * 1274126177) >>> 0
  return (h ^ (h >>> 16)) / 0x100000000
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smoothstep(x - x0)
  const fy = smoothstep(y - y0)
  const v00 = hash2D(x0, y0, seed)
  const v10 = hash2D(x0 + 1, y0, seed)
  const v01 = hash2D(x0, y0 + 1, seed)
  const v11 = hash2D(x0 + 1, y0 + 1, seed)
  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy)
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 97) * amp
    norm += amp
    amp *= 0.5
    freq *= 2.1
  }
  return sum / norm
}

function domainWarp(gx: number, gy: number, grid: number, seed: number): [number, number] {
  const wx = fbm(nx(gx, grid), nx(gy, grid), seed, 4) * (grid * 0.1)
  const wy = fbm(nx(gx, grid) + 50, nx(gy, grid) + 50, seed + 300, 4) * (grid * 0.1)
  return [gx + wx, gy + wy]
}

// ── 板块构造 ──────────────────────────────────────────────

interface TectonicPlate {
  id: number
  cx: number
  cy: number
  /** 漂移方向（归一化） */
  vx: number
  vy: number
  isContinental: boolean
  /** 大陆核半径（网格单位） */
  radius: number
}

function continentalRadius(ctx: GenContext, rand: () => number): number {
  const g = ctx.grid
  switch (ctx.scale) {
    case 'kingdom':
      return g * (0.14 + rand() * 0.08)
    case 'archipelago':
      return g * (0.035 + rand() * 0.045)
    case 'world':
      return g * (0.055 + rand() * 0.07)
    case 'planet':
      return g * (0.045 + rand() * 0.06)
    default:
      return g * (0.07 + rand() * 0.07)
  }
}

function generatePlates(ctx: GenContext, rand: () => number): TectonicPlate[] {
  const { grid, params } = ctx
  const n = params.plateCount
  const nCont = params.continentalCount
  const plates: TectonicPlate[] = []
  const margin = Math.max(6, Math.floor(grid * 0.06))

  for (let i = 0; i < n; i++) {
    const isContinental = i < nCont
    const angle = rand() * Math.PI * 2
    const speed = 0.4 + rand() * 0.8
    const cx = margin + rand() * (grid - margin * 2)
    const cy = margin + rand() * (grid - margin * 2)
    plates.push({
      id: i,
      cx,
      cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      isContinental,
      radius: isContinental ? continentalRadius(ctx, rand) : grid * (0.05 + rand() * 0.04)
    })
  }
  return plates
}

function assignPlate(gx: number, gy: number, grid: number, plates: TectonicPlate[], seed: number): TectonicPlate {
  const [wx, wy] = domainWarp(gx, gy, grid, seed)
  let best = plates[0]
  let bestD = Infinity
  for (const p of plates) {
    const d = Math.hypot(wx - p.cx, wy - p.cy)
    const bias = p.isContinental ? d * 0.85 : d * 1.05
    if (bias < bestD) {
      bestD = bias
      best = p
    }
  }
  return best
}

/** 相对板块边界类型：正=汇聚（造山），负=张裂，近零=转换 */
function boundaryStress(
  gx: number,
  gy: number,
  plateA: TectonicPlate,
  plateB: TectonicPlate
): number {
  const nx = plateB.cx - plateA.cx
  const ny = plateB.cy - plateA.cy
  const len = Math.hypot(nx, ny) || 1
  const bx = nx / len
  const by = ny / len
  const vRel = plateB.vx - plateA.vx
  return -(vRel * bx + vRel * by)
}

function buildElevationAndTerrain(
  ctx: GenContext,
  config: WorldGenConfig,
  plates: TectonicPlate[],
  seed: number
): { elevation: number[][]; moisture: number[][]; terrain: TerrainType[][]; plateIds: number[][] } {
  const { grid, params } = ctx
  const seaLevel = params.seaLevel
  const elevation: number[][] = []
  const moisture: number[][] = []
  const terrain: TerrainType[][] = []
  const plateIds: number[][] = []

  for (let gy = 0; gy < grid; gy++) {
    elevation[gy] = []
    moisture[gy] = []
    terrain[gy] = []
    plateIds[gy] = []
    for (let gx = 0; gx < grid; gx++) {
      const plate = assignPlate(gx, gy, grid, plates, seed)
      plateIds[gy][gx] = plate.id

      const distCore = Math.hypot(gx - plate.cx, gy - plate.cy)
      const detail = fbm(nx(gx, grid) * 0.72, nx(gy, grid) * 0.72, seed + 500, 4) * 0.18
      const micro = fbm(nx(gx, grid) * 2.1, nx(gy, grid) * 2.1, seed + 700, 3) * 0.08

      let elev: number
      if (plate.isContinental) {
        const falloff = 1 - Math.min(1, distCore / plate.radius)
        const coastIrregular = fbm(nx(gx, grid) * 1.2 + 20, nx(gy, grid) * 1.2, seed + 900, 4) * 0.12
        elev = -0.08 + falloff * 0.55 + coastIrregular + detail + micro
      } else {
        elev = -0.55 + detail * 0.4 + micro
        if (distCore < plate.radius * 0.35) {
          elev += 0.15
        }
      }

      elevation[gy][gx] = elev
    }
  }

  for (let gy = 1; gy < grid - 1; gy++) {
    for (let gx = 1; gx < grid - 1; gx++) {
      const pid = plateIds[gy][gx]
      const plate = plates[pid]
      let maxStress = 0
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ] as const) {
        const npid = plateIds[gy + dy][gx + dx]
        if (npid === pid) continue
        const neighbor = plates[npid]
        const stress = boundaryStress(gx, gy, plate, neighbor)
        if (stress > maxStress) maxStress = stress
        if (stress > 0.25) {
          elevation[gy][gx] += stress * 0.22
        } else if (stress < -0.2) {
          elevation[gy][gx] -= 0.06
        }
      }
      if (maxStress > 0.5) {
        elevation[gy][gx] += 0.12
      }
    }
  }

  const oceanDist: number[][] = Array.from({ length: grid }, () => Array(grid).fill(Infinity))
  const q: [number, number][] = []
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      if (elevation[gy][gx] <= seaLevel) {
        oceanDist[gy][gx] = 0
        q.push([gx, gy])
      }
    }
  }
  let qi = 0
  while (qi < q.length) {
    const [gx, gy] = q[qi++]
    const d = oceanDist[gy][gx]
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      const nxg = gx + dx
      const nyg = gy + dy
      if (nxg < 0 || nyg < 0 || nxg >= grid || nyg >= grid) continue
      if (d + 1 < oceanDist[nyg][nxg]) {
        oceanDist[nyg][nxg] = d + 1
        q.push([nxg, nyg])
      }
    }
  }

  const oceanReach = Math.max(10, grid * 0.14)

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const yNorm = (gy / grid) * 100
      const latMoist = climateMoistBias(yNorm, config.climate)
      const m = Math.max(0, 1 - oceanDist[gy][gx] / oceanReach) * 0.6 + latMoist * 0.4
      moisture[gy][gx] = m

      terrain[gy][gx] = classifyTerrain(
        elevation[gy][gx],
        seaLevel,
        moisture[gy][gx],
        yNorm,
        gx,
        gy,
        elevation,
        config.climate
      )
    }
  }

  return { elevation, moisture, terrain, plateIds }
}

function climateMoistBias(y: number, mode: WorldGenConfig['climate']): number {
  if (mode === 'cold') return y < 50 ? 0.35 : 0.55
  if (mode === 'tropical') return y > 40 ? 0.75 : 0.5
  if (mode === 'temperate') return y > 30 && y < 70 ? 0.6 : 0.45
  return y < 25 ? 0.4 : y > 75 ? 0.5 : 0.65
}

function classifyTerrain(
  elev: number,
  seaLevel: number,
  moist: number,
  yNorm: number,
  gx: number,
  gy: number,
  elevation: number[][],
  climate: WorldGenConfig['climate']
): TerrainType {
  if (elev <= seaLevel) return 'ocean'

  const shoreBand = seaLevel + 0.06
  if (elev <= shoreBand) return 'coast'

  const westHigh = gx > 2 ? elevation[gy][gx - 1] > seaLevel + 0.35 : false
  const rainShadow = westHigh && moist < 0.35

  if (elev > 0.52) return 'mountain'
  if (elev > 0.38) return 'hill'

  if (rainShadow && (yNorm > 55 || yNorm < 30) && moist < 0.3) return 'desert'
  if (climate === 'cold' && yNorm < 22 && elev < 0.35) return 'wetland'
  if (moist > 0.65 && elev < 0.28) return 'wetland'
  if (moist > 0.5 && elev < 0.32) return 'forest'
  if (moist < 0.28 && yNorm > 58) return 'desert'

  return 'plain'
}

function climateAtY(y: number, mode: WorldGenConfig['climate']): string {
  if (mode === 'cold') return y < 55 ? '寒带' : '亚寒带'
  if (mode === 'tropical') return y > 45 ? '热带' : '亚热带'
  if (mode === 'temperate') return y < 25 ? '北温带' : y > 75 ? '南温带' : '中温带'
  if (y < 18) return '北寒带'
  if (y < 32) return '北温带'
  if (y < 52) return '中温带'
  if (y < 68) return '南温带'
  return '热带'
}

// ── 地形栅格与大陆轮廓 ──────────────────────────────────────

type Cell = `${number},${number}`

function cellKey(gx: number, gy: number): Cell {
  return `${gx},${gy}`
}

function isLandTerrain(t: TerrainType): boolean {
  return t !== 'ocean'
}

function floodLand(
  terrain: TerrainType[][],
  grid: number,
  startX: number,
  startY: number,
  visited: Set<Cell>
): [number, number][] {
  const cells: [number, number][] = []
  const stack: [number, number][] = [[startX, startY]]
  while (stack.length) {
    const [gx, gy] = stack.pop()!
    const k = cellKey(gx, gy)
    if (visited.has(k)) continue
    if (gx < 0 || gy < 0 || gx >= grid || gy >= grid) continue
    if (!isLandTerrain(terrain[gy][gx])) continue
    visited.add(k)
    cells.push([gx, gy])
    stack.push([gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1])
  }
  return cells
}

function landmassOutline(cells: [number, number][], cell: number, seed: number): [number, number][] {
  if (!cells.length) return []
  let cx = 0
  let cy = 0
  for (const [gx, gy] of cells) {
    cx += gx
    cy += gy
  }
  cx /= cells.length
  cy /= cells.length

  const steps = 48
  const poly: [number, number][] = []
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    const dirX = Math.cos(angle)
    const dirY = Math.sin(angle)
    let bestR = 0
    for (const [gx, gy] of cells) {
      const proj = (gx - cx) * dirX + (gy - cy) * dirY
      if (proj > bestR) bestR = proj
    }
    const wobble = 0.78 + hash2D(i, Math.floor(cx), seed) * 0.38
    const px = (cx + dirX * (bestR + 0.55) * wobble) * cell + cell / 2
    const py = (cy + dirY * (bestR + 0.55) * wobble) * cell + cell / 2
    poly.push([
      Math.max(0.5, Math.min(99.5, px)),
      Math.max(0.5, Math.min(99.5, py))
    ])
  }
  return poly
}

function buildTerrainCells(terrain: TerrainType[][], ctx: GenContext): MapTerrainCell[] {
  const { grid, cell } = ctx
  const cells: MapTerrainCell[] = []
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const t = terrain[gy][gx]
      if (t === 'ocean') continue
      cells.push({
        x: Math.round((gx * cell + cell / 2) * 1000) / 1000,
        y: Math.round((gy * cell + cell / 2) * 1000) / 1000,
        terrain: t
      })
    }
  }
  return cells
}

function landmassName(cellCount: number, grid: number, index: number): string {
  const ratio = cellCount / (grid * grid)
  if (ratio > 0.08) return `主大陆-${index}`
  if (ratio > 0.025) return `大陆-${index}`
  if (cellCount > grid * 0.8) return `次大陆-${index}`
  return `岛屿-${index}`
}

function buildLandmassRegions(
  terrain: TerrainType[][],
  ctx: GenContext,
  seed: number,
  climate: WorldGenConfig['climate']
): MapRegion[] {
  const { grid, cell } = ctx
  const visited = new Set<Cell>()
  const regions: MapRegion[] = []
  let id = 1

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      if (!isLandTerrain(terrain[gy][gx])) continue
      const k = cellKey(gx, gy)
      if (visited.has(k)) continue

      const cells = floodLand(terrain, grid, gx, gy, visited)
      if (cells.length < 3) continue

      const polygon = landmassOutline(cells, cell, seed + id * 31)
      if (polygon.length < 3) continue

      const cy = (cells.reduce((s, c) => s + c[1], 0) / cells.length / grid) * 100

      regions.push({
        id: `land-${String(id).padStart(3, '0')}`,
        name: landmassName(cells.length, grid, id),
        terrain: 'coast',
        climate: climateAtY(cy, climate),
        polygon
      })
      id++
    }
  }
  return regions
}

function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function terrainAt(x: number, y: number, ctx: GenContext, terrain: TerrainType[][]): TerrainType {
  const { grid, cell } = ctx
  const gx = Math.min(grid - 1, Math.max(0, Math.floor(x / cell)))
  const gy = Math.min(grid - 1, Math.max(0, Math.floor(y / cell)))
  return terrain[gy][gx]
}

// ── 河流（沿高度下降入海） ─────────────────────────────────

function buildRivers(
  ctx: GenContext,
  elevation: number[][],
  terrain: TerrainType[][],
  seaLevel: number,
  rand: () => number
): MapRiver[] {
  const { grid, cell, params } = ctx
  const rivers: MapRiver[] = []
  const used = new Set<Cell>()
  const margin = Math.max(6, Math.floor(grid * 0.08))
  const attempts = params.maxRivers * 3

  for (let attempt = 0; attempt < attempts && rivers.length < params.maxRivers; attempt++) {
    let gx = Math.floor(margin + rand() * (grid - margin * 2))
    let gy = Math.floor(margin + rand() * (grid - margin * 2))
    if (elevation[gy][gx] < seaLevel + 0.28) continue

    const points: [number, number][] = [[gx * cell + cell / 2, gy * cell + cell / 2]]
    let guard = Math.floor(grid * 1.2)

    while (guard-- > 0) {
      let bestGx = gx
      let bestGy = gy
      let bestElev = elevation[gy][gx]
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1]
      ]) {
        const nxg = gx + dx
        const nyg = gy + dy
        if (nxg < 0 || nyg < 0 || nxg >= grid || nyg >= grid) continue
        const e = elevation[nyg][nxg]
        if (e < bestElev - 0.001) {
          bestElev = e
          bestGx = nxg
          bestGy = nyg
        }
      }
      if (bestGx === gx && bestGy === gy) break
      gx = bestGx
      gy = bestGy
      const k = cellKey(gx, gy)
      if (used.has(k)) break
      used.add(k)
      points.push([gx * cell + cell / 2, gy * cell + cell / 2])
      const t = terrain[gy][gx]
      if (t === 'ocean' || t === 'coast' || elevation[gy][gx] <= seaLevel + 0.02) break
    }

    if (points.length >= 4) {
      rivers.push({
        id: `river-${String(rivers.length + 1).padStart(2, '0')}`,
        name: `第${rivers.length + 1}河`,
        points
      })
    }
  }
  return rivers
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function nearRiver(x: number, y: number, rivers: MapRiver[], threshold = 5): boolean {
  for (const r of rivers) {
    for (const [rx, ry] of r.points) {
      if (dist({ x, y }, { x: rx, y: ry }) < threshold) return true
    }
  }
  return false
}

function terrainAllowedForCity(terrain: TerrainType): boolean {
  return terrain === 'plain' || terrain === 'coast' || terrain === 'hill' || terrain === 'forest'
}

function isGeographicallyValid(
  x: number,
  y: number,
  terrain: TerrainType,
  climate: string,
  rivers: MapRiver[]
): boolean {
  if (!terrainAllowedForCity(terrain)) return false
  if (terrain === 'desert' && climate.includes('寒')) return false
  const nearWater = terrain === 'coast' || nearRiver(x, y, rivers)
  if (!nearWater && terrain !== 'plain') return false
  return true
}

// ── 聚落与文案 ────────────────────────────────────────────

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

function describeLocation(
  loc: Omit<WorldLocation, 'description'>,
  worldName: string,
  era: string
): string {
  const terrainDesc: Record<TerrainType, string> = {
    ocean: '濒海',
    coast: '滨海口岸',
    plain: '平原沃野',
    hill: '丘陵台地',
    mountain: '山地',
    forest: '林缘',
    desert: '沙地边缘',
    wetland: '水网泽国'
  }
  const typeDesc: Record<WorldLocation['type'], string> = {
    capital: '政治与经济中心',
    city: '区域枢纽城市',
    town: '商埠城镇',
    village: '乡镇聚落',
    fortress: '军事要塞',
    landmark: '地标性自然或人文景观'
  }
  return (
    `${loc.name}位于${worldName}的${terrainDesc[loc.terrain]}，${loc.climate}气候。` +
    `作为${typeDesc[loc.type]}，${era ? `${era}背景下` : ''}` +
    `此地${loc.type === 'fortress' ? '扼守板块边界要道，易守难攻' : '人口聚集，多沿河流或海岸分布'}。` +
    `周边以${terrainDesc[loc.terrain]}为主，适合作为故事中的` +
    `${loc.type === 'landmark' ? '探索与转折' : '驻留与冲突'}场景。`
  )
}

function findRegionForPoint(x: number, y: number, regions: MapRegion[]): MapRegion | undefined {
  for (const r of regions) {
    if (pointInPolygon(x, y, r.polygon)) return r
  }
  let best: MapRegion | undefined
  let bestD = Infinity
  for (const r of regions) {
    for (const [px, py] of r.polygon) {
      const d = dist({ x, y }, { x: px, y: py })
      if (d < bestD) {
        bestD = d
        best = r
      }
    }
  }
  return best
}

function placeLocations(
  config: WorldGenConfig,
  ctx: GenContext,
  terrain: TerrainType[][],
  elevation: number[][],
  regions: MapRegion[],
  rivers: MapRiver[],
  seaLevel: number,
  rand: () => number
): WorldLocation[] {
  const { grid, cell, params } = ctx
  const locations: WorldLocation[] = []
  const minDist = params.minCityDist
  const targetCount = Math.max(3, Math.min(params.maxCities, config.cityCount))

  const landCells: [number, number][] = []
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      if (elevation[gy][gx] > seaLevel + 0.05) landCells.push([gx, gy])
    }
  }

  for (let i = 0; i < targetCount; i++) {
    for (let attempt = 0; attempt < 120; attempt++) {
      let x: number
      let y: number
      if (landCells.length && rand() > 0.25) {
        const [gx, gy] = landCells[Math.floor(rand() * landCells.length)]
        x = gx * cell + rand() * cell
        y = gy * cell + rand() * cell
      } else {
        x = 8 + rand() * 84
        y = 8 + rand() * 84
      }

      const t = terrainAt(x, y, ctx, terrain)
      const climate = climateAtY(y, config.climate)
      if (!isGeographicallyValid(x, y, t, climate, rivers)) continue
      if (locations.some((l) => dist(l, { x, y }) < minDist)) continue

      const region = findRegionForPoint(x, y, regions)
      const type: WorldLocation['type'] =
        i === 0
          ? 'capital'
          : config.includeLandmarks && i === targetCount - 1
            ? 'landmark'
            : i % 4 === 0
              ? 'town'
              : 'city'

      const loc: WorldLocation = {
        id: `loc-${String(i + 1).padStart(3, '0')}`,
        name: cityName(rand, type),
        type,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        terrain: t,
        climate,
        regionId: region?.id,
        description: '',
        population:
          type === 'capital' ? '50万+' : type === 'city' ? '10–30万' : type === 'town' ? '1–5万' : '千人级'
      }
      loc.description = describeLocation(loc, config.worldName, config.era)
      locations.push(loc)
      break
    }
  }
  return locations
}

function buildWorldRules(
  config: WorldGenConfig,
  ctx: GenContext,
  locations: WorldLocation[],
  plateCount: number
): string {
  const caps = locations.filter((l) => l.type === 'capital').map((l) => l.name)
  return [
    `世界名称：${config.worldName}`,
    config.era ? `时代：${config.era}` : '',
    config.atmosphere.length ? `氛围：${config.atmosphere.join('、')}` : '',
    `尺度：${ctx.params.label}（栅格 ${ctx.grid}×${ctx.grid}）`,
    caps.length ? `核心都会：${caps.join('、')}` : '',
    `地质格局：${plateCount} 大板块相互漂移，汇聚边界隆起成山脉，张裂边界形成浅海与岛弧；海岸线受侵蚀与噪声扰动呈不规则形态。`,
    `主要地点 ${locations.length} 处，聚落沿河流、海岸与平原分布，符合基本地理与气候规律。`,
    '西部迎风坡多森林与降水，东部背风侧可出现干燥地带；高纬度与板块碰撞带分布山地。'
  ]
    .filter(Boolean)
    .join('\n')
}

// ── 入口 ──────────────────────────────────────────────────

export { renderResolutionForScale, equirectDimensionsForScale, numPlatesForScale } from './world-engine-official'

/** 程序化生成世界观（高度图 + 气候 + 水文 + 聚落，本地运算） */
export function generateWorldProcedural(config: WorldGenConfig): WorldGenResult {
  return { ...generateWorldFromHeightmap(config), source: 'procedural' }
}

/** 世界观生成入口：优先官方 WorldEngine Python，失败则 TS 回退 */
export async function generateWorld(config: WorldGenConfig): Promise<WorldGenResult> {
  const plainConfig = JSON.parse(JSON.stringify(config)) as WorldGenConfig
  plainConfig.seed = normalizeWorldSeed(plainConfig.seed)
  const api = typeof window !== 'undefined' ? window.novelsCreator?.world : undefined
  if (api?.generateNative) {
    const native = await api.generateNative(plainConfig)
    if (native.ok && native.payload && native.mapFilePath) {
      return buildWorldGenResultFromNative(
        plainConfig,
        native.payload,
        api.toLocalFileUrl(native.mapFilePath),
        native.mapFilePath
      )
    }
    const err = native.error ?? 'WorldEngine 原生生成失败'
    console.warn('[WorldEngine native]', err)
    throw new Error(err)
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 32))
  })
  return generateWorldProcedural(plainConfig)
}

export function getLocationById(
  locations: WorldLocation[],
  id: string | undefined
): WorldLocation | undefined {
  if (!id) return undefined
  return locations.find((l) => l.id === id)
}

export { TERRAIN_COLORS } from '@/utils/world-terrain-colors'
