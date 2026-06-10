/**
 * 平面等距圆柱图上的极地冰雪（80°–90° 为顶/底条带）
 * 在平面地图生成完成后再涂，最后整张贴到球面。
 */

import type { TerrainType } from '@/types/project'
import { latitudeDegFromFlatRow } from '@/utils/world-flat-map'

export const POLAR_CAP_LAT_START = 80
const POLAR_SOFT_LAT = 78

export interface PolarIceCapInput {
  rgba: Uint8ClampedArray
  width: number
  height: number
  elevation: Float32Array
  seaLevel: number
  terrain: TerrainType[]
  lakeMask?: Uint8Array
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 + 1e-9)))
  return t * t * (3 - 2 * t)
}

export function polarCapStrengthForRow(y: number, height: number): number {
  const absLat = Math.abs(latitudeDegFromFlatRow(y, height))
  if (absLat < POLAR_SOFT_LAT) return 0
  if (absLat >= POLAR_CAP_LAT_START) return 1
  return smoothstep(POLAR_SOFT_LAT, POLAR_CAP_LAT_START, absLat)
}

/** 在平面地图上施加 80°–90° 冰雪圆盖（整行一致，贴球后成纬线圆） */
export function applyFlatMapPolarIceCap(input: PolarIceCapInput): void {
  const { rgba, width, height, elevation, seaLevel, terrain, lakeMask } = input

  for (let y = 0; y < height; y++) {
    const strength = polarCapStrengthForRow(y, height)
    if (strength < 0.02) continue

    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (lakeMask?.[idx]) continue

      const pi = idx * 4
      const isLand = elevation[idx] > seaLevel + 0.01 && terrain[idx] !== 'ocean'

      if (strength >= 0.98) {
        if (isLand) {
          rgba[pi] = 242
          rgba[pi + 1] = 248
          rgba[pi + 2] = 252
        } else {
          rgba[pi] = 216
          rgba[pi + 1] = 232
          rgba[pi + 2] = 244
        }
        continue
      }

      const u = strength
      let r = rgba[pi]
      let g = rgba[pi + 1]
      let b = rgba[pi + 2]
      if (isLand) {
        r = Math.round(r * (1 - u) + 242 * u)
        g = Math.round(g * (1 - u) + 248 * u)
        b = Math.round(b * (1 - u) + 252 * u)
      } else {
        r = Math.round(r * (1 - u) + 216 * u)
        g = Math.round(g * (1 - u) + 232 * u)
        b = Math.round(b * (1 - u) + 244 * u)
      }
      rgba[pi] = r
      rgba[pi + 1] = g
      rgba[pi + 2] = b
    }
  }

  weldFlatPolarMeridian(rgba, width, height)
}

function weldFlatPolarMeridian(rgba: Uint8ClampedArray, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    if (polarCapStrengthForRow(y, height) < 0.5) continue
    const row = y * width
    const l0 = row * 4
    const r0 = (row + width - 1) * 4
    for (let c = 0; c < 3; c++) {
      const avg = Math.round((rgba[l0 + c] + rgba[r0 + c]) / 2)
      rgba[l0 + c] = avg
      rgba[r0 + c] = avg
    }
  }
}

/** @deprecated 请用 applyFlatMapPolarIceCap */
export function applyPolarIceCap(input: PolarIceCapInput): void {
  applyFlatMapPolarIceCap(input)
}

export function applyRegularPolarCaps(input: PolarIceCapInput): void {
  applyFlatMapPolarIceCap(input)
}
