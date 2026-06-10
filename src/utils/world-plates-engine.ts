/**
 * WorldEngine 风格板块地形（TypeScript 移植，浏览器可运行）
 * 参考：https://github.com/Mindwerks/worldengine
 * - Voronoi 板块 + 域扭曲
 * - 汇聚/张裂边界应力 → 造山/裂谷
 * - 陆地居中、边缘降海、海底平滑、边界噪声
 */

import { fbm2, perlin2, seededRandom } from '@/utils/world-noise'

export interface TectonicPlateSpec {
  id: number
  cx: number
  cy: number
  vx: number
  vy: number
  isContinental: boolean
  radius: number
}

export function createTectonicPlates(
  numPlates: number,
  width: number,
  height: number,
  seed: number
): TectonicPlateSpec[] {
  const continental = Math.max(1, Math.floor(numPlates * 0.5))
  const rand = seededRandom(seed + 3000)
  const plates: TectonicPlateSpec[] = []
  const marginX = width * 0.06
  const marginY = height * 0.08
  const ref = Math.min(width, height)

  for (let i = 0; i < numPlates; i++) {
    const isContinental = i < continental
    const angle = rand() * Math.PI * 2
    const speed = 0.35 + rand() * 0.75
    const cx = marginX + rand() * (width - marginX * 2)
    let cy = marginY + rand() * (height - marginY * 2)
    const polarMargin = height * 0.12
    if (cy < polarMargin || cy > height - polarMargin) {
      cy = polarMargin + rand() * (height - polarMargin * 2)
    }
    let radius: number
    if (isContinental) {
      radius = ref * (0.055 + rand() * 0.075)
    } else {
      radius = ref * (0.05 + rand() * 0.04)
    }
    plates.push({
      id: i,
      cx,
      cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      isContinental,
      radius
    })
  }
  return plates
}

/** pyplatec 式多周期板块步进（cycle_count=2, erosion_period≈60） */
export function simulatePlateDriftSteps(
  plates: TectonicPlateSpec[],
  width: number,
  height: number,
  steps: number
): void {
  const dt = refStep(width, height) * 0.85
  const yMin = height * 0.05
  const yMax = height * 0.95

  for (let s = 0; s < steps; s++) {
    for (const p of plates) {
      p.cx += p.vx * dt
      p.cy += p.vy * dt * 0.55
      if (p.cx < 0) p.cx += width
      else if (p.cx >= width) p.cx -= width
      p.cy = Math.max(yMin, Math.min(yMax, p.cy))
    }
  }
}

/** @deprecated 使用 simulatePlateDriftSteps */
export function simulatePlateDrift(
  plates: TectonicPlateSpec[],
  width: number,
  height: number,
  yearsMa: number
): void {
  const steps = Math.min(28, Math.max(5, Math.floor(yearsMa / 3)))
  simulatePlateDriftSteps(plates, width, height, steps)
}

function refStep(width: number, height: number): number {
  return Math.min(width, height) * 0.0018
}

function domainWarpPlateCoords(
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number
): [number, number] {
  const nx = x / width
  const ny = y / height
  const wx = (perlin2(nx * 14, ny * 14, seed + 61) - 0.5) * width * 0.045
  const wy = (perlin2(nx * 14 + 2.1, ny * 14 + 1.3, seed + 62) - 0.5) * height * 0.045
  return [x + wx, y + wy]
}

export function assignPlateAt(
  x: number,
  y: number,
  width: number,
  height: number,
  plates: TectonicPlateSpec[],
  seed: number
): TectonicPlateSpec {
  const [wx, wy] = domainWarpPlateCoords(x, y, width, height, seed)
  let best = plates[0]
  let bestD = Infinity
  for (const p of plates) {
    let dx = wx - p.cx
    if (dx > width * 0.5) dx -= width
    else if (dx < -width * 0.5) dx += width
    const d = Math.hypot(dx, wy - p.cy)
    const bias = p.isContinental ? d * 0.82 : d * 1.08
    if (bias < bestD) {
      bestD = bias
      best = p
    }
  }
  return best
}

/** 相对边界应力：正=汇聚造山，负=张裂 */
export function boundaryStress(plateA: TectonicPlateSpec, plateB: TectonicPlateSpec): number {
  let nx = plateB.cx - plateA.cx
  const ny = plateB.cy - plateA.cy
  const len = Math.hypot(nx, ny) || 1
  nx /= len
  const by = ny / len
  const vRelX = plateB.vx - plateA.vx
  const vRelY = plateB.vy - plateA.vy
  return -(vRelX * nx + vRelY * by)
}

function normCoord(x: number, y: number, width: number, height: number): [number, number] {
  return [(x + 0.5) / width, (y + 0.5) / height]
}

/** 单格板块基底高度（大陆/洋壳 + 海岸细节） */
export function samplePlateBaseElevation(
  x: number,
  y: number,
  width: number,
  height: number,
  plate: TectonicPlateSpec,
  seed: number
): number {
  let dx = x - plate.cx
  if (dx > width * 0.5) dx -= width
  else if (dx < -width * 0.5) dx += width
  const distCore = Math.hypot(dx, y - plate.cy)
  const [ux, uy] = normCoord(x, y, width, height)
  const detail = (fbm2(ux * 5.2, uy * 5.2, seed + 500, 4) - 0.5) * 0.18
  const micro = (fbm2(ux * 14, uy * 14, seed + 700, 3) - 0.5) * 0.08

  if (plate.isContinental) {
    const falloff = 1 - Math.min(1, distCore / plate.radius)
    const coastIrregular = (fbm2(ux * 8 + 0.2, uy * 8, seed + 900, 4) - 0.5) * 0.24
    return -0.08 + falloff * 0.58 + coastIrregular + detail + micro
  }

  let elev = -0.52 + detail * 0.38 + micro
  if (distCore < plate.radius * 0.35) elev += 0.12
  return elev
}

export function buildPlateIdGrid(
  width: number,
  height: number,
  plates: TectonicPlateSpec[],
  seed: number
): Uint16Array {
  const n = width * height
  const ids = new Uint16Array(n)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      ids[y * width + x] = assignPlateAt(x, y, width, height, plates, seed).id
    }
  }
  return ids
}

export function fillElevationFromPlates(
  elevation: Float32Array,
  plateIds: Uint16Array,
  width: number,
  height: number,
  plates: TectonicPlateSpec[],
  seed: number
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const plate = plates[plateIds[idx]]
      elevation[idx] = samplePlateBaseElevation(x, y, width, height, plate, seed)
    }
  }
}

/** 邻格板块边界 → 造山/裂谷 */
export function applyPlateBoundaryMountains(
  elevation: Float32Array,
  plateIds: Uint16Array,
  width: number,
  height: number,
  plates: TectonicPlateSpec[]
): void {
  for (let y = 1; y < height - 1; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const pid = plateIds[idx]
      const plate = plates[pid]
      let maxStress = 0
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ] as const) {
        const nx = (x + dx + width) % width
        const ny = y + dy
        const npid = plateIds[ny * width + nx]
        if (npid === pid) continue
        const stress = boundaryStress(plate, plates[npid])
        if (stress > maxStress) maxStress = stress
        if (stress > 0.22) {
          elevation[idx] += stress * 0.2
        } else if (stress < -0.18) {
          elevation[idx] -= 0.05
        }
      }
      if (maxStress > 0.45) elevation[idx] += 0.1
    }
  }
}

/** WorldEngine add_noise_to_elevation */
export function addWorldEngineElevationNoise(
  elevation: Float32Array,
  width: number,
  height: number,
  seed: number,
  amplitude = 0.038
): void {
  const octaves = 8
  const freq = 16 * octaves
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const n = fbm2((x / freq) * 2, (y / freq) * 2, seed, octaves, 2.0, 0.5)
      elevation[idx] += (n - 0.5) * amplitude * 2
    }
  }
}

/** 将更多陆地卷到地图中央，减少边缘大陆（WorldEngine center_land） */
export function centerLandMass(elevation: Float32Array, width: number, height: number): void {
  const rowSum = new Float64Array(height)
  const colSum = new Float64Array(width)
  for (let y = 0; y < height; y++) {
    let rs = 0
    for (let x = 0; x < width; x++) rs += elevation[y * width + x]
    rowSum[y] = rs
  }
  for (let x = 0; x < width; x++) {
    let cs = 0
    for (let y = 0; y < height; y++) cs += elevation[y * width + x]
    colSum[x] = cs
  }
  let minRow = 0
  let minRowVal = rowSum[0]
  for (let y = 1; y < height; y++) {
    if (rowSum[y] < minRowVal) {
      minRowVal = rowSum[y]
      minRow = y
    }
  }
  let minCol = 0
  let minColVal = colSum[0]
  for (let x = 1; x < width; x++) {
    if (colSum[x] < minColVal) {
      minColVal = colSum[x]
      minCol = x
    }
  }
  rollElevation(elevation, width, height, -minCol, -minRow)
}

function rollElevation(
  elevation: Float32Array,
  width: number,
  height: number,
  shiftX: number,
  shiftY: number
): void {
  const sx = ((shiftX % width) + width) % width
  const sy = ((shiftY % height) + height) % height
  if (sx === 0 && sy === 0) return
  const copy = new Float32Array(elevation)
  for (let y = 0; y < height; y++) {
    const syi = (y + sy) % height
    for (let x = 0; x < width; x++) {
      const sxi = (x + sx) % width
      elevation[y * width + x] = copy[syi * width + sxi]
    }
  }
}

/** 地图四边压低为海洋（WorldEngine place_oceans_at_map_borders） */
export function placeOceansAtMapBorders(
  elevation: Float32Array,
  width: number,
  height: number
): void {
  const oceanBorder = Math.min(30, Math.max(width / 5, height / 5))
  const border = Math.floor(oceanBorder)

  for (let x = 0; x < width; x++) {
    for (let i = 0; i < border; i++) {
      const t = i / border
      elevation[i * width + x] *= t
      elevation[(height - 1 - i) * width + x] *= t
    }
  }
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < border; i++) {
      const t = i / border
      elevation[y * width + i] *= t
      elevation[y * width + (width - 1 - i)] *= t
    }
  }
}

/** 从地图边缘泛洪标记真实海洋（WorldEngine fill_ocean） */
export function fillOceanFromBorders(
  elevation: Float32Array,
  width: number,
  height: number,
  seaLevel: number
): Uint8Array {
  const ocean = new Uint8Array(width * height)
  const q: number[] = []

  const tryPush = (x: number, y: number): void => {
    const idx = y * width + x
    if (ocean[idx] || elevation[idx] > seaLevel) return
    ocean[idx] = 1
    q.push(idx)
  }

  for (let x = 0; x < width; x++) {
    tryPush(x, 0)
    tryPush(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y)
    tryPush(width - 1, y)
  }

  let qi = 0
  while (qi < q.length) {
    const idx = q[qi++]
    const x = idx % width
    const y = Math.floor(idx / width)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      tryPush(nx, ny)
    }
  }
  return ocean
}

/** 海底噪声减弱（WorldEngine harmonize_ocean） */
export function harmonizeOceanFloor(
  elevation: Float32Array,
  ocean: Uint8Array,
  width: number,
  height: number,
  seaLevel: number
): void {
  const shallowSea = seaLevel * 0.85
  const midpoint = shallowSea * 0.5

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (!ocean[idx] || elevation[idx] >= shallowSea) continue
      const e = elevation[idx]
      if (e < midpoint) {
        elevation[idx] = midpoint - (midpoint - e) / 5
      } else {
        elevation[idx] = midpoint + (e - midpoint) / 5
      }
    }
  }
}

function normalizeElevationRange(elevation: Float32Array): void {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < elevation.length; i++) {
    if (elevation[i] < min) min = elevation[i]
    if (elevation[i] > max) max = elevation[i]
  }
  const span = max - min || 1
  for (let i = 0; i < elevation.length; i++) {
    elevation[i] = 0.15 + ((elevation[i] - min) / span) * 1.65
  }
}

/** WorldEngine plates.py：板块 → 居中 → 噪声 → 边缘海洋 */
export function runWorldEnginePlatePhase(
  width: number,
  height: number,
  seed: number,
  numPlates: number
): { elevation: Float32Array; plateIds: Uint16Array; plates: TectonicPlateSpec[] } {
  const plates = createTectonicPlates(numPlates, width, height, seed)
  for (let c = 0; c < 2; c++) {
    simulatePlateDriftSteps(plates, width, height, 60)
  }

  const n = width * height
  const elevation = new Float32Array(n)
  const plateIds = buildPlateIdGrid(width, height, plates, seed)
  fillElevationFromPlates(elevation, plateIds, width, height, plates, seed)
  applyPlateBoundaryMountains(elevation, plateIds, width, height, plates)
  normalizeElevationRange(elevation)
  centerLandMass(elevation, width, height)
  addWorldEngineElevationNoise(elevation, width, height, seed + 4096)
  placeOceansAtMapBorders(elevation, width, height)
  normalizeElevationRange(elevation)

  return { elevation, plateIds, plates }
}
