/**
 * 极地工具：经度可分辨噪声 + 不规则冰缘 / 海拔雕刻
 *
 * 等距圆柱在极区 (nx,nz)→0，纯 3D 噪声会沿整行恒定 → 球面正圆冰盖。
 * 此处用经度 sin/cos 与像素 hash 打破纬向对称。
 */

import { equirectToSphere, fbm3, hash2D } from '@/utils/world-noise'

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 + 1e-9)))
  return t * t * (3 - 2 * t)
}

/** 距赤道 0~1（与 climate equatorDistance 一致） */
export function equatorDistanceFromRow(y: number, height: number): number {
  const yNorm = (y + 0.5) / height
  return Math.abs(yNorm - 0.5) * 2
}

export function isPolarCapRow(y: number, height: number): boolean {
  return equatorDistanceFromRow(y, height) > 0.82
}

export function sphereLatitudeDeg(x: number, y: number, width: number, height: number): number {
  const { lat } = equirectToSphere(x + 0.5, y + 0.5, width, height)
  return (lat * 180) / Math.PI
}

export function sphereColatitudeDeg(x: number, y: number, width: number, height: number): number {
  return 90 - Math.abs(sphereLatitudeDeg(x, y, width, height))
}

export function longitudeRad(x: number, width: number): number {
  return ((x + 0.5) / width) * Math.PI * 2 - Math.PI
}

/**
 * 极区经度噪声 0~1；在 |ny|→1 时仍随 x 变化。
 */
export function polarLongitudeNoise(
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number
): number {
  const { ny } = equirectToSphere(x + 0.5, y + 0.5, width, height)
  const polarW = smoothstep(0.55, 0.92, Math.abs(ny))
  if (polarW < 0.02) return 0.5

  const lon = longitudeRad(x, width)
  const lonA = Math.cos(lon)
  const lonB = Math.sin(lon)
  const lonC = Math.cos(lon * 2.3 + seed * 0.017)
  const lonD = Math.sin(lon * 3.7 - seed * 0.013)

  const macro = fbm3(lonA * 2.4, lonB * 2.4, lonC * 1.6 + lonD, seed + 4401, 5)
  const meso = fbm3(lonA * 5.5, lonB * 5.5, lonD * 2.1, seed + 882, 4)
  const micro = hash2D(x * 3 + (seed % 97), y + Math.floor(width / 64), seed + 902)

  const v = macro * 0.45 + meso * 0.3 + micro * 0.25
  return polarW * v + (1 - polarW) * 0.5
}

/**
 * 冰盖强度 0~1：同纬行内随经度起伏，避免球面正圆。
 */
export function polarIceStrength(
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number
): number {
  const colat = sphereColatitudeDeg(x, y, width, height)
  if (colat > 42) return 0

  const lonN = polarLongitudeNoise(x, y, width, height, seed)
  const micro = hash2D(x, y, seed + 331)
  const meso = hash2D(x >> 1, y >> 1, seed + 772)

  const edgeColat = 8 + lonN * 26 + micro * 14 + meso * 8
  const soft = 1 - smoothstep(edgeColat, edgeColat + 14, colat)
  const patch = 0.5 + lonN * 0.35 + micro * 0.3 + meso * 0.2
  return Math.max(0, Math.min(1, soft * patch))
}

/** 雕刻极区海拔：经度方向陆海交错，减少正圆陆块 */
export function carvePolarElevation(
  elevation: Float32Array,
  width: number,
  height: number,
  seed: number
): void {
  for (let y = 0; y < height; y++) {
    const eq = equatorDistanceFromRow(y, height)
    if (eq < 0.72) continue

    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const colat = sphereColatitudeDeg(x, y, width, height)
      if (colat > 38) continue

      const t = smoothstep(38, 8, colat)
      const lonN = polarLongitudeNoise(x, y, width, height, seed)
      const micro = hash2D(x, y, seed + 1203) - 0.5

      const carve = t * (0.12 + lonN * 0.22)
      elevation[idx] -= carve
      elevation[idx] += micro * t * 0.09
    }
  }
}

/** 极冠行：削弱纬向一致性（仅对极区前几行） */
export function breakPolarRowUniformity(
  elevation: Float32Array,
  width: number,
  height: number,
  seed: number
): void {
  for (let y = 0; y < height; y++) {
    if (!isPolarCapRow(y, height)) continue
    const eq = equatorDistanceFromRow(y, height)
    const rowAmp = smoothstep(0.82, 0.98, eq) * 0.14

    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const lon = longitudeRad(x, width)
      const wobble =
        (hash2D(x, y, seed + 55) - 0.5) * 0.12 +
        Math.sin(lon * 5 + seed * 0.01) * 0.06 +
        Math.cos(lon * 9 - seed * 0.02) * 0.05
      elevation[idx] += wobble * rowAmp
    }
  }
}
