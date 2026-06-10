/**

 * 由地势与季风带推导六边形格的温度、湿度

 * 地图 y：0=北端，100=南端，50≈赤道（与 world-climate.ts 一致）

 */



import type { MapHexCell, MapLake, MapRiver, MapTerrainCell, TerrainType, WorldMapDocument } from '@/types/project'
import { equatorDistance } from '@/utils/world-climate'
import { buildTerrainIndex, sampleTerrainAt } from '@/utils/world-terrain-index'



function climateFromBiomeLabel(label: string | undefined): { heat: number; wet: number; monsoon: boolean } {

  const l = (label ?? '').toLowerCase()

  let heat = 0.5

  let wet = 0.5

  let monsoon = false



  if (l.includes('冰原') || l.includes('极寒') || l === 'ice' || l.includes('polar desert')) {

    heat = 0.05

    wet = 0.28

  } else if (l.includes('苔原') || l.includes('tundra') || l.includes('subpolar')) {

    heat = 0.16

    wet = 0.36

  } else if (l.includes('boreal') || l.includes('亚寒')) {

    heat = 0.28

    wet = 0.42

  } else if (l.includes('热带沙漠') || (l.includes('desert') && !l.includes('polar'))) {

    heat = 0.82

    wet = 0.18

  } else if (l.includes('rainforest') || l.includes('雨林') || (l.includes('tropical') && l.includes('forest'))) {

    heat = 0.88

    wet = 0.82

  } else if (l.includes('tropical') || l.includes('赤道')) {

    heat = 0.86

    wet = 0.72

  } else if (l.includes('monsoon') || l.includes('季风')) {

    heat = 0.72

    wet = 0.78

    monsoon = true

  } else if (l.includes('subtropical') || l.includes('亚热带')) {

    heat = 0.68

    wet = 0.58

  } else if (l.includes('mediterranean') || l.includes('地中海')) {

    heat = 0.58

    wet = 0.42

  } else if (l.includes('temperate') || l.includes('cool') || l.includes('温带')) {

    heat = 0.46

    wet = 0.52

  } else if (l.includes('warm')) {

    heat = 0.62

    wet = 0.55

  } else if (l.includes('alpine') || l.includes('mountain')) {

    heat = 0.22

    wet = 0.38

  } else if (l.includes('scrub') || l.includes('steppe') || l.includes('semiarid')) {

    heat = 0.55

    wet = 0.32

  } else if (l.includes('forest') || l.includes('woodland')) {

    heat = 0.48

    wet = 0.62

  } else if (l.includes('polar')) {

    heat = 0.08

    wet = 0.3

  }

  if (l.includes('humid') || l.includes('rain')) wet = Math.max(wet, 0.65)

  if (l.includes('arid') || l.includes('dry')) wet = Math.min(wet, 0.35)

  return { heat, wet, monsoon }

}



function terrainAdjust(terrain: MapHexCell['terrain'], heat: number, wet: number): { heat: number; wet: number } {

  let h = heat

  let w = wet

  if (terrain === 'mountain') h -= 0.12

  if (terrain === 'desert') {

    w -= 0.22

    h += 0.06

  }

  if (terrain === 'wetland' || terrain === 'coast') w += 0.1

  if (terrain === 'forest') w += 0.08

  if (terrain === 'ocean') {

    h -= 0.04

    w += 0.12

  }

  return {

    heat: Math.max(0.02, Math.min(1, h)),

    wet: Math.max(0.05, Math.min(1, w))

  }

}



const WATER_TERRAINS = new Set<TerrainType>(['ocean', 'coast', 'wetland'])

const TERRAIN_DEVELOPMENT_BASE: Record<TerrainType, number> = {
  ocean: 0,
  plain: 40,
  coast: 32,
  forest: 24,
  hill: 18,
  wetland: 30,
  desert: 10,
  mountain: 8
}

function distanceToRivers(x: number, y: number, rivers: MapRiver[]): number {
  let min = Infinity
  for (const river of rivers) {
    for (const [rx, ry] of river.points) {
      min = Math.min(min, Math.hypot(x - rx, y - ry))
    }
  }
  return min
}

function distanceToLakes(x: number, y: number, lakes: MapLake[]): number {
  let min = Infinity
  for (const lake of lakes) {
    min = Math.min(min, Math.max(0, Math.hypot(x - lake.cx, y - lake.cy) - lake.radius))
  }
  return min
}

function distanceToWaterTerrain(
  xPct: number,
  yPct: number,
  index: Map<string, MapTerrainCell>,
  gridSize: number,
  maxSteps = 12
): number {
  const gx0 = Math.min(gridSize - 1, Math.max(0, Math.round((xPct / 100) * gridSize)))
  const gy0 = Math.min(gridSize - 1, Math.max(0, Math.round((yPct / 100) * gridSize)))
  const stepPct = 100 / gridSize

  for (let r = 0; r <= maxSteps; r++) {
    for (let dg = -r; dg <= r; dg++) {
      for (let dh = -r; dh <= r; dh++) {
        if (Math.max(Math.abs(dg), Math.abs(dh)) !== r) continue
        const gx = gx0 + dg
        const gy = gy0 + dh
        if (gx < 0 || gy < 0 || gx >= gridSize || gy >= gridSize) continue
        const sample = index.get(`${gx},${gy}`)
        if (sample && WATER_TERRAINS.has(sample.terrain)) {
          return r * stepPct
        }
      }
    }
  }
  return maxSteps * stepPct
}

function waterProximityBonus(
  x: number,
  y: number,
  terrain: TerrainType,
  index: Map<string, MapTerrainCell>,
  gridSize: number,
  rivers: MapRiver[],
  lakes: MapLake[]
): number {
  if (terrain === 'coast' || terrain === 'wetland') return 34
  const terrainDist = distanceToWaterTerrain(x, y, index, gridSize)
  const riverDist = rivers.length ? distanceToRivers(x, y, rivers) : Infinity
  const lakeDist = lakes.length ? distanceToLakes(x, y, lakes) : Infinity
  const waterDist = Math.min(terrainDist, riverDist, lakeDist)
  const range = 11
  const maxBonus = 30
  return maxBonus * Math.max(0, 1 - waterDist / range)
}

function computeLandDevelopment(
  cell: MapHexCell,
  index: Map<string, MapTerrainCell>,
  gridSize: number,
  rivers: MapRiver[],
  lakes: MapLake[]
): number {
  const terrain = cell.terrain
  if (terrain === 'ocean') return 0
  let dev = TERRAIN_DEVELOPMENT_BASE[terrain] ?? 20
  dev += waterProximityBonus(cell.x, cell.y, terrain, index, gridSize, rivers, lakes)
  if (terrain === 'plain') dev += 6
  dev += (cell.wet ?? 0.5) * 4
  return dev
}

function capDevelopmentForClimate(heat: number, dev: number): number {
  const cap = heat < 0.12 ? 12 : heat < 0.22 ? 18 : heat < 0.32 ? 28 : undefined
  if (cap != null) return Math.min(dev, cap)
  return dev
}

function applyCellDevelopment(
  cell: MapHexCell,
  heat: number,
  index: Map<string, MapTerrainCell>,
  gridSize: number,
  rivers: MapRiver[],
  lakes: MapLake[]
): void {
  if (cell.terrain === 'ocean') {
    cell.development = 0
    return
  }
  let dev = computeLandDevelopment(cell, index, gridSize, rivers, lakes)
  dev = capDevelopmentForClimate(heat, dev)
  cell.development = Math.round(Math.max(0, Math.min(100, dev)))
}

/** 陆格发展度是否已有足够差异（避免全图统一占位值 20） */
export function hexDevelopmentAlreadySynced(map: WorldMapDocument): boolean {
  const cells = map.hexGrid?.cells
  if (!cells?.length) return true
  let land = 0
  let minD = 101
  let maxD = 0
  for (const c of cells) {
    if (c.terrain === 'ocean') continue
    land++
    const d = c.development ?? 0
    minD = Math.min(minD, d)
    maxD = Math.max(maxD, d)
  }
  if (land < 8) return true
  return maxD - minD >= 14
}

/** 仅重算发展度（气候已同步、发展度仍为统一占位时使用） */
export function syncHexDevelopmentFromTerrain(map: WorldMapDocument): void {
  if (!map.hexGrid?.cells?.length) return
  const gridSize = map.gridSize ?? 64
  const terrainIndex = buildTerrainIndex(map.terrainCells, gridSize)
  const rivers = map.rivers ?? []
  const lakes = map.lakes ?? []
  for (const cell of map.hexGrid.cells) {
    applyCellDevelopment(cell, cell.heat ?? 0.5, terrainIndex, gridSize, rivers, lakes)
  }
}



/** 已保存的 hex 气候是否无需重算（须有多纬度温差，避免仅有 development 占位时误判） */
export function hexClimateAlreadySynced(map: WorldMapDocument): boolean {
  const cells = map.hexGrid?.cells
  if (!cells?.length) return false
  let defined = 0
  let minH = 1
  let maxH = 0
  for (const c of cells) {
    if (c.heat == null || c.wet == null) continue
    defined++
    minH = Math.min(minH, c.heat)
    maxH = Math.max(maxH, c.heat)
  }
  if (defined < Math.floor(cells.length * 0.85)) return false
  return maxH - minH >= 0.12
}

/** 根据纬度带 + 最近 biome + 地形填充 hex 的 heat/wet/monsoon */

export function syncHexClimateFromTerrain(map: WorldMapDocument): void {

  if (!map.hexGrid?.cells?.length) return

  const gridSize = map.gridSize ?? 64
  const terrainIndex = buildTerrainIndex(map.terrainCells, gridSize)
  const rivers = map.rivers ?? []
  const lakes = map.lakes ?? []

  for (const cell of map.hexGrid.cells) {

    const sample = sampleTerrainAt(cell.x, cell.y, terrainIndex, gridSize)

    const fromBiome = climateFromBiomeLabel(sample?.climate)



    if (fromBiome.heat <= 0.18) {

      const adj = terrainAdjust(cell.terrain, fromBiome.heat, fromBiome.wet)

      cell.heat = adj.heat

      cell.wet = adj.wet

      cell.monsoon = fromBiome.monsoon

      applyCellDevelopment(cell, adj.heat, terrainIndex, gridSize, rivers, lakes)

      continue

    }



    const yNorm = cell.y / 100

    const eq = equatorDistance(yNorm)

    const absLat = Math.abs(90 - yNorm * 180)

    if (absLat >= 70) {

      cell.heat = 0.05

      cell.wet = 0.3

      cell.monsoon = false

      applyCellDevelopment(cell, 0.05, terrainIndex, gridSize, rivers, lakes)

      continue

    }



    const baseHeat = 1 - eq * 0.88

    const baseWet = 0.45 + (1 - eq) * 0.25

    let heat = baseHeat * 0.35 + fromBiome.heat * 0.65

    let wet = baseWet * 0.35 + fromBiome.wet * 0.65

    let monsoon = fromBiome.monsoon



    if (eq > 0.35 && eq < 0.55 && cell.terrain !== 'ocean' && cell.terrain !== 'desert') {

      if (cell.x > 52 && cell.x < 88) monsoon = true

      if (monsoon) wet += 0.12

    }



    const adj = terrainAdjust(cell.terrain, heat, wet)

    cell.heat = adj.heat

    cell.wet = adj.wet

    cell.monsoon = monsoon

    applyCellDevelopment(cell, adj.heat, terrainIndex, gridSize, rivers, lakes)

  }

}



export function heatColor(heat: number): string {

  const t = Math.max(0, Math.min(1, heat))

  if (t < 0.18) {

    const u = t / 0.18

    const r = Math.round(210 + u * 45)

    const g = Math.round(228 + u * 22)

    const b = Math.round(248 - u * 18)

    return `rgb(${r},${g},${b})`

  }

  if (t < 0.38) {

    const u = (t - 0.18) / 0.2

    const r = Math.round(80 + u * 70)

    const g = Math.round(140 + u * 40)

    const b = Math.round(210 - u * 40)

    return `rgb(${r},${g},${b})`

  }

  if (t < 0.55) {

    const u = (t - 0.38) / 0.17

    const r = Math.round(150 + u * 40)

    const g = Math.round(180 + u * 30)

    const b = Math.round(170 - u * 80)

    return `rgb(${r},${g},${b})`

  }

  const u = (t - 0.55) / 0.45

  const r = Math.round(190 + u * 65)

  const g = Math.round(210 - u * 120)

  const b = Math.round(90 - u * 70)

  return `rgb(${r},${g},${b})`

}



export function wetColor(wet: number): string {

  const t = Math.max(0, Math.min(1, wet))

  const r = Math.round(180 - t * 120)

  const g = Math.round(140 + t * 60)

  const b = Math.round(80 + t * 120)

  return `rgb(${r},${g},${b})`

}



export function developmentColor(dev: number): string {

  const t = Math.max(0, Math.min(100, dev)) / 100

  return `rgba(232, 197, 71, ${0.15 + t * 0.75})`

}


