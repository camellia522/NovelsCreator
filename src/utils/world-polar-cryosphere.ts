/**
 * 极地 cryosphere：经度不规则冰缘 + 明显冰雪着色
 */

import type { TerrainType } from '@/types/project'
import { polarIceStrength, sphereLatitudeDeg } from '@/utils/world-polar'

export { isPolarCapRow as isPolarSeamRow } from '@/utils/world-polar'

export interface PolarCryosphereInput {
  rgba: Uint8ClampedArray
  width: number
  height: number
  elevation: Float32Array
  seaLevel: number
  oceanDist: Float32Array
  terrain: TerrainType[]
  lakeMask: Uint8Array
  seed: number
}

function blendRgb(
  r: number,
  g: number,
  b: number,
  tr: number,
  tg: number,
  tb: number,
  t: number
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t))
  return [
    Math.round(r * (1 - u) + tr * u),
    Math.round(g * (1 - u) + tg * u),
    Math.round(b * (1 - u) + tb * u)
  ]
}

function buildOceanToLandDistance(
  elevation: Float32Array,
  seaLevel: number,
  width: number,
  height: number
): Float32Array {
  const n = width * height
  const dist = new Float32Array(n)
  dist.fill(Infinity)
  const q: number[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (elevation[idx] > seaLevel + 0.015) {
        dist[idx] = 0
        q.push(idx)
      }
    }
  }

  let qi = 0
  while (qi < q.length) {
    const idx = q[qi++]
    const d0 = dist[idx]
    const x = idx % width
    const y = Math.floor(idx / width)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = (x + dx + width) % width
      const ny = y + dy
      if (ny < 0 || ny >= height) continue
      const ni = ny * width + nx
      if (elevation[ni] > seaLevel + 0.015) continue
      const nd = d0 + 1
      if (dist[ni] > nd) {
        dist[ni] = nd
        q.push(ni)
      }
    }
  }
  return dist
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 + 1e-9)))
  return t * t * (3 - 2 * t)
}

export function applyPolarCryosphere(input: PolarCryosphereInput): void {
  const { rgba, width, height, elevation, seaLevel, oceanDist, terrain, lakeMask, seed } = input
  const oceanToLand = buildOceanToLandDistance(elevation, seaLevel, width, height)
  const maxLandDist = Math.max(12, width * 0.1)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const pi = idx * 4
      if (lakeMask[idx]) continue

      const ice = polarIceStrength(x, y, width, height, seed)
      if (ice < 0.06) continue

      const elev = elevation[idx]
      const elevAbove = Math.max(0, elev - seaLevel)
      const isOcean = elev <= seaLevel + 0.01 || terrain[idx] === 'ocean'
      const absLat = Math.abs(sphereLatitudeDeg(x, y, width, height))

      let r = rgba[pi]
      let g = rgba[pi + 1]
      let b = rgba[pi + 2]

      if (isOcean) {
        const nearLand = oceanToLand[idx]
        const coastal = 1 - smoothstep(2, maxLandDist, Math.min(nearLand, maxLandDist))
        const pack = ice * (0.78 + coastal * 0.22)
        const seaIceRgb = blendRgb(r, g, b, 205, 225, 240, pack * 0.9)
        if (absLat > 80) {
          const core = blendRgb(seaIceRgb[0], seaIceRgb[1], seaIceRgb[2], 240, 248, 252, 0.6)
          r = core[0]
          g = core[1]
          b = core[2]
        } else {
          r = seaIceRgb[0]
          g = seaIceRgb[1]
          b = seaIceRgb[2]
        }
      } else {
        const nearCoast = smoothstep(0, 0.2, oceanDist[idx])
        let snow = ice * (0.88 - nearCoast * 0.12)
        const tileTerrain = terrain[idx]
        if (tileTerrain === 'mountain' || elevAbove > 0.1) snow = Math.min(1, snow + 0.1)
        if (tileTerrain === 'desert' && absLat < 76) snow *= 0.4

        const snowRgb = blendRgb(r, g, b, 235, 242, 248, snow * 0.94)
        if (ice > 0.5) {
          const glaze = blendRgb(snowRgb[0], snowRgb[1], snowRgb[2], 250, 252, 255, (ice - 0.45) * 0.55)
          r = glaze[0]
          g = glaze[1]
          b = glaze[2]
        } else {
          r = snowRgb[0]
          g = snowRgb[1]
          b = snowRgb[2]
        }
      }

      rgba[pi] = r
      rgba[pi + 1] = g
      rgba[pi + 2] = b
    }
  }
}
