/** 将 RGBA 像素缓冲编码为 PNG Data URL（浏览器环境） */

function smoothBlend(t: number): number {
  return t * t * (3 - 2 * t)
}

/** 混合左右经线边缘，使等距圆柱贴图可无缝贴到球面（极点行跳过，避免冰盖放射纹） */
export function sealEquirectangularSeam(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  blend = 8,
  skipPolarRows?: (y: number, height: number) => boolean
): void {
  const bw = Math.max(2, Math.min(blend, Math.floor(width / 8)))
  for (let y = 0; y < height; y++) {
    if (skipPolarRows?.(y, height)) continue
    const row = y * width
    for (let k = 0; k < bw; k++) {
      const t = smoothBlend(k / bw)
      const li = (row + k) * 4
      const ri = (row + width - 1 - k) * 4
      for (let c = 0; c < 3; c++) {
        const avg = (rgba[li + c] + rgba[ri + c]) * 0.5
        rgba[li + c] = Math.round(rgba[li + c] * (1 - t) + avg * t)
        rgba[ri + c] = Math.round(rgba[ri + c] * (1 - t) + avg * t)
      }
    }
    const li0 = row * 4
    const ri0 = (row + width - 1) * 4
    rgba[li0] = rgba[ri0]
    rgba[li0 + 1] = rgba[ri0 + 1]
    rgba[li0 + 2] = rgba[ri0 + 2]
    rgba[li0 + 3] = rgba[ri0 + 3]
  }
}

/** 高度场经线缝合（在着色前调用） */
export function sealElevationSeam(
  elevation: Float32Array,
  width: number,
  height: number,
  blend = 6,
  skipPolarRows?: (y: number, h: number) => boolean
): void {
  const bw = Math.max(2, Math.min(blend, Math.floor(width / 8)))
  for (let y = 0; y < height; y++) {
    if (skipPolarRows?.(y, height)) continue
    const row = y * width
    for (let k = 0; k < bw; k++) {
      const t = smoothBlend(k / bw)
      const li = row + k
      const ri = row + width - 1 - k
      const avg = (elevation[li] + elevation[ri]) * 0.5
      elevation[li] = elevation[li] * (1 - t) + avg * t
      elevation[ri] = elevation[ri] * (1 - t) + avg * t
    }
    elevation[row] = elevation[row + width - 1]
  }
}

export function encodeRgbaAsPngDataUrl(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): string {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height)
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

/** 由 terrainCells 合成 2:1 等距圆柱 PNG（无 regions 时的兜底） */
export function buildRasterFromTerrainCells(
  map: import('@/types/project').WorldMapDocument,
  terrainColors: Record<string, string>,
  width?: number,
  height?: number
): string {
  if (typeof document === 'undefined') return ''
  const w = width ?? (map.renderWidth && map.renderHeight ? map.renderWidth : 2048)
  const h = height ?? (map.renderWidth && map.renderHeight ? map.renderHeight : Math.floor(w / 2))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = terrainColors.ocean ?? '#1a3a5c'
  ctx.fillRect(0, 0, w, h)

  const cells = map.terrainCells ?? []
  const cellPx = ((map.cellSize ?? 100 / 64) / 100) * w
  const pad = Math.max(0.5, cellPx * 0.06)
  for (const c of cells) {
    ctx.fillStyle = terrainColors[c.terrain] ?? '#5a7a4a'
    const px = (c.x / 100) * w - cellPx / 2
    const py = (c.y / 100) * h - cellPx / 2
    ctx.fillRect(px, py, cellPx + pad, cellPx + pad)
  }
  const imageData = ctx.getImageData(0, 0, w, h)
  sealEquirectangularSeam(imageData.data, w, h)
  return encodeRgbaAsPngDataUrl(imageData.data, w, h)
}
