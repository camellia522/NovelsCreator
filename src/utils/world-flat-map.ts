/**
 * 平面超高精度地形：精细化柏林噪声 + 板块 + 域扭曲
 * 输出等距圆柱 PNG 后贴球面。
 */

import type { WorldScale } from '@/types/world-gen'
import type { GeoEvolutionContext } from '@/utils/world-evolution'
import { fbm2, perlin2, ridged2 } from '@/utils/world-noise'

export type TerrainQuality = 'high' | 'ultra'

export interface FlatPlate {
  cx: number
  cy: number
  isContinental: boolean
  radius: number
}

function noiseScaleForWorld(scale: WorldScale): { base: number; detail: number; ridge: number; micro: number } {
  switch (scale) {
    case 'kingdom':
      return { base: 2.6, detail: 10, ridge: 6.5, micro: 22 }
    case 'archipelago':
      return { base: 3.0, detail: 12, ridge: 7.5, micro: 26 }
    case 'world':
      return { base: 2.2, detail: 9, ridge: 5.5, micro: 20 }
    case 'planet':
      return { base: 2.0, detail: 8.5, ridge: 5, micro: 18 }
    default:
      return { base: 2.4, detail: 10, ridge: 6, micro: 21 }
  }
}

function qualityParams(q: TerrainQuality): {
  macroOct: number
  detailOct: number
  microOct: number
  warpStrength: number
} {
  if (q === 'ultra') {
    return { macroOct: 8, detailOct: 6, microOct: 4, warpStrength: 0.42 }
  }
  return { macroOct: 6, detailOct: 4, microOct: 3, warpStrength: 0.32 }
}

function domainWarp2(
  x: number,
  y: number,
  seed: number,
  strength: number
): [number, number] {
  const wx = (perlin2(x * 0.35, y * 0.35, seed + 51) - 0.5) * strength
  const wy = (perlin2(x * 0.35 + 4.2, y * 0.35 + 1.8, seed + 52) - 0.5) * strength
  const wx2 = (perlin2(x * 0.9 + 9, y * 0.9, seed + 53) - 0.5) * strength * 0.35
  const wy2 = (perlin2(x * 0.9, y * 0.9 + 7, seed + 54) - 0.5) * strength * 0.35
  return [x + wx + wx2, y + wy + wy2]
}

function plateInfluence(x: number, y: number, plates: FlatPlate[]): number {
  let boost = 0
  for (const p of plates) {
    const d = Math.hypot(x - p.cx, y - p.cy)
    if (d >= p.radius) continue
    const t = 1 - d / p.radius
    const s = t * t * (3 - 2 * t)
    boost += p.isContinental ? s * 0.2 : -s * 0.07
  }
  return boost
}

/** 平面像素 → 高度 [0,1] */
export function sampleFlatElevation(
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  scale: WorldScale,
  plates: FlatPlate[],
  quality: TerrainQuality = 'ultra'
): number {
  const freq = noiseScaleForWorld(scale)
  const qp = qualityParams(quality)

  let nx = ((x + 0.5) / width) * freq.base * 3.4
  let ny = ((y + 0.5) / height) * freq.base * 1.7
  ;[nx, ny] = domainWarp2(nx, ny, seed, qp.warpStrength)
  ;[nx, ny] = domainWarp2(nx + 12, ny + 8, seed + 900, qp.warpStrength * 0.55)

  const continental = fbm2(nx, ny, seed, qp.macroOct, 2.02, 0.48)
  const detail = fbm2(
    nx * (freq.detail / freq.base),
    ny * (freq.detail / freq.base),
    seed + 200,
    qp.detailOct,
    2.08,
    0.5
  )
  const micro = fbm2(
    nx * (freq.micro / freq.base),
    ny * (freq.micro / freq.base),
    seed + 600,
    qp.microOct,
    2.15,
    0.52
  )
  const ridge = ridged2(
    nx * (freq.ridge / freq.base),
    ny * (freq.ridge / freq.base),
    seed + 400,
    qp.detailOct
  )

  let elev = continental * 0.64 + (detail - 0.5) * 0.12 + (micro - 0.5) * 0.045
  const landCore = Math.max(0, continental - 0.48)
  elev += landCore * ridge * 0.44
  if (continental < 0.36) elev -= (0.36 - continental) * 0.24

  elev += plateInfluence(x, y, plates)

  return Math.max(0, Math.min(1, elev))
}

export function evolveGeologyFlat(
  ctx: GeoEvolutionContext,
  yearsMa: number,
  seed: number,
  quality: TerrainQuality = 'ultra'
): void {
  const steps = Math.min(quality === 'ultra' ? 32 : 20, Math.max(6, Math.floor(yearsMa / 3)))
  const { width: w, height: h, elevation } = ctx

  for (let s = 0; s < steps; s++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x
        const nx = ((x + 0.5) / w) * 14
        const ny = ((y + 0.5) / h) * 14
        const n = fbm2(nx, ny, seed + s * 19, 4)
        const ridge = ridged2(nx * 1.3, ny * 1.3, seed + s * 31, 3)
        elevation[idx] += (n - 0.5) * 0.005 + (ridge - 0.5) * 0.002
      }
    }
  }
}

export function latitudeDegFromFlatRow(y: number, height: number): number {
  return 90 - ((y + 0.5) / height) * 180
}
