/**
 * 地形后处理：极地过渡、海岸平滑、邻海水体并入海洋
 */

import type { MapLake, MapRiver } from '@/types/project'
import type { GeoEvolutionContext } from '@/utils/world-evolution'

/** 0=极地，1=中低纬（smoothstep，约 12°–90° 过渡带） */
export function polarBlendFactor(yNorm: number): number {
  const d = Math.min(yNorm, 1 - yNorm) * 2
  const t = Math.min(1, d / 0.14)
  return t * t * (3 - 2 * t)
}

/** 极冠行轻微竖向平滑（强度很低，避免抹出纬向正圆陆块） */
export function softenPolarElevation(elevation: Float32Array, width: number, height: number): void {
  const scratch = new Float32Array(elevation.length)
  scratch.set(elevation)
  for (let y = 1; y < height - 1; y++) {
    const blend = polarBlendFactor((y + 0.5) / height)
    if (blend > 0.82) continue
    const mix = (1 - blend) * 0.05
    if (mix < 0.015) continue
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const up = elevation[(y - 1) * width + x]
      const dn = elevation[(y + 1) * width + x]
      const avg = (up + elevation[idx] + dn) / 3
      scratch[idx] = elevation[idx] * (1 - mix) + avg * mix
    }
  }
  elevation.set(scratch)
}

/** 海岸带高度场轻量平滑，减少笔直岸线 */
export function smoothCoastalElevation(
  elevation: Float32Array,
  width: number,
  height: number,
  seaLevel: number,
  passes = 2
): void {
  const next = new Float32Array(elevation.length)
  const band = 0.09
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        const d = Math.abs(elevation[idx] - seaLevel)
        if (d > band) {
          next[idx] = elevation[idx]
          continue
        }
        const t = 1 - d / band
        const w = t * t * 0.45
        let sum = 0
        let wt = 0
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
          const nx = (x + dx + width) % width
          const ny = y + dy
          if (ny < 0 || ny >= height) continue
          const ni = ny * width + nx
          sum += elevation[ni]
          wt += 1
        }
        const avg = sum / wt
        next[idx] = elevation[idx] * (1 - w) + avg * w
      }
    }
    elevation.set(next)
  }
}

export function touchesOceanCell(
  x: number,
  y: number,
  elevation: Float32Array,
  seaLevel: number,
  size: number,
  margin = 0.014
): boolean {
  const threshold = seaLevel + margin
  for (const [dx, dy] of [
    [0, 0],
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
    if (elevation[ny * size + nx] <= threshold) return true
  }
  return false
}

function idxFromPercent(
  xPct: number,
  yPct: number,
  ctx: GeoEvolutionContext
): { idx: number; x: number; y: number } {
  const x = Math.min(ctx.width - 1, Math.max(0, Math.floor((xPct / 100) * ctx.width)))
  const y = Math.min(ctx.height - 1, Math.max(0, Math.floor((yPct / 100) * ctx.height)))
  return { idx: y * ctx.width + x, x, y }
}

function isCoastalWaterCell(idx: number, ctx: GeoEvolutionContext): boolean {
  const { elevation, seaLevel, oceanDist } = ctx
  if (elevation[idx] <= seaLevel + 0.02) return true
  return oceanDist[idx] < 0.085
}

/** 邻海河流不单独成河；湖泊若触海则视为海洋 */
export function mergeCoastalHydrology(
  ctx: GeoEvolutionContext,
  rivers: MapRiver[],
  lakes: MapLake[],
  lakeMask: Uint8Array
): { rivers: MapRiver[]; lakes: MapLake[] } {
  const { width: size, elevation, seaLevel } = ctx
  const n = size * size

  for (let i = 0; i < n; i++) {
    if (lakeMask[i] !== 1) continue
    const x = i % size
    const y = Math.floor(i / size)
    if (touchesOceanCell(x, y, elevation, seaLevel, size) || ctx.oceanDist[i] < 0.09) {
      lakeMask[i] = 0
    }
  }

  const keptLakes: MapLake[] = []
  for (const lake of lakes) {
    const { idx, x, y } = idxFromPercent(lake.cx, lake.cy, ctx)
    if (lakeMask[idx] !== 1) continue
    if (touchesOceanCell(x, y, elevation, seaLevel, size)) continue
    keptLakes.push(lake)
  }

  const keptRivers: MapRiver[] = []
  for (const river of rivers) {
    if (!river.points?.length) continue
    const trimmed: [number, number][] = []
    for (const pt of river.points) {
      const { idx, x, y } = idxFromPercent(pt[0], pt[1], ctx)
      if (isCoastalWaterCell(idx, ctx) || touchesOceanCell(x, y, elevation, seaLevel, size)) {
        break
      }
      trimmed.push(pt)
    }
    if (trimmed.length < 5) continue
    const last = trimmed[trimmed.length - 1]
    const { idx: li, x: lx, y: ly } = idxFromPercent(last[0], last[1], ctx)
    if (ctx.oceanDist[li] < 0.12 || touchesOceanCell(lx, ly, elevation, seaLevel, size, 0.02)) {
      trimmed.pop()
    }
    if (trimmed.length < 5) continue
    keptRivers.push({ ...river, points: trimmed })
  }

  return { rivers: keptRivers, lakes: keptLakes }
}
