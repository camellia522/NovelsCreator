/**
 * 由 map.regions / lakes / rivers / terrainCells 程序化绘制 2:1 等距圆柱贴图（不依赖万相）
 */

import type { MapLake, MapRegion, MapRiver, TerrainType, WorldMapDocument } from '@/types/project'
import type { WorldScale } from '@/types/world-gen'
import { equirectDimensionsForScale } from '@/utils/world-engine-official'
import { renderResolutionForScale } from '@/utils/world-heightmap'
import { TERRAIN_COLORS } from '@/utils/world-terrain-colors'
import { encodeRgbaAsPngDataUrl, sealEquirectangularSeam } from '@/utils/world-map-image'
import { hash2D } from '@/utils/world-noise'

export interface EquirectRasterOptions {
  width?: number
  height?: number
  scale?: WorldScale
  seed?: number
  /** 叠加 terrainCells 细粒度纹理（默认 true） */
  overlayCells?: boolean
}

export { equirectDimensionsForScale } from '@/utils/world-engine-official'

export function equirectDimensionsForMap(map: WorldMapDocument, scale: WorldScale): {
  width: number
  height: number
} {
  const rw = map.renderWidth ?? 0
  const rh = map.renderHeight ?? 0
  if (rw > 0 && rh > 0) {
    if (rw >= rh * 1.8) return { width: rw, height: rh }
    return { width: rw * 2, height: rw }
  }
  return equirectDimensionsForScale(scale)
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToCss([r, g, b]: [number, number, number], a = 1): string {
  return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`
}

function terrainRgb(terrain: TerrainType): [number, number, number] {
  return hexToRgb(TERRAIN_COLORS[terrain] ?? TERRAIN_COLORS.plain)
}

function polygonArea(poly: [number, number][]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) * 0.5
}

export function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function strokePolygon(
  ctx: CanvasRenderingContext2D,
  polygon: [number, number][],
  width: number,
  height: number
): void {
  if (polygon.length < 2) return
  const [x0, y0] = polygon[0]
  ctx.moveTo((x0 / 100) * width, (y0 / 100) * height)
  for (let i = 1; i < polygon.length; i++) {
    const [x, y] = polygon[i]
    ctx.lineTo((x / 100) * width, (y / 100) * height)
  }
  ctx.closePath()
}

function fillPolygon(
  ctx: CanvasRenderingContext2D,
  polygon: [number, number][],
  width: number,
  height: number
): void {
  ctx.beginPath()
  strokePolygon(ctx, polygon, width, height)
  ctx.fill()
}

function lakeAt(xPct: number, yPct: number, lakes: MapLake[]): boolean {
  for (const lake of lakes) {
    if (lake.polygon?.length && lake.polygon.length >= 3) {
      if (pointInPolygon(xPct, yPct, lake.polygon)) return true
      continue
    }
    const dx = xPct - lake.cx
    const dy = yPct - lake.cy
    if (dx * dx + dy * dy <= lake.radius * lake.radius) return true
  }
  return false
}

function applyTerrainNoise(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seed: number,
  oceanRgb: [number, number, number]
): void {
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (Math.abs(r - oceanRgb[0]) < 8 && Math.abs(g - oceanRgb[1]) < 8 && Math.abs(b - oceanRgb[2]) < 8) {
        continue
      }
      const n = hash2D(px * 0.15, py * 0.15, seed) * 0.08 - 0.04
      data[i] = Math.min(255, Math.max(0, Math.round(r * (1 + n))))
      data[i + 1] = Math.min(255, Math.max(0, Math.round(g * (1 + n))))
      data[i + 2] = Math.min(255, Math.max(0, Math.round(b * (1 + n))))
    }
  }
}

function applyCoastTint(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  oceanRgb: [number, number, number],
  coastRgb: [number, number, number]
): void {
  const isOcean = (i: number) => {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    return Math.abs(r - oceanRgb[0]) < 10 && Math.abs(g - oceanRgb[1]) < 10 && Math.abs(b - oceanRgb[2]) < 10
  }

  const out = new Uint8ClampedArray(data)
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = py * width + px
      const i = idx * 4
      if (isOcean(i)) continue
      let nearOcean = false
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1]
      ]) {
        const nx = px + dx
        const ny = py + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          nearOcean = true
          break
        }
        if (isOcean((ny * width + nx) * 4)) {
          nearOcean = true
          break
        }
      }
      if (!nearOcean) continue
      const t = 0.42
      out[i] = Math.round(out[i] * (1 - t) + coastRgb[0] * t)
      out[i + 1] = Math.round(out[i + 1] * (1 - t) + coastRgb[1] * t)
      out[i + 2] = Math.round(out[i + 2] * (1 - t) + coastRgb[2] * t)
    }
  }
  data.set(out)
}

function drawRivers(
  ctx: CanvasRenderingContext2D,
  rivers: MapRiver[],
  width: number,
  height: number
): void {
  const lw = Math.max(1, width / 720)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const river of rivers) {
    if (!river.points || river.points.length < 2) continue
    const order = river.order ?? 2
    ctx.strokeStyle = `rgba(42, 78, 108, ${0.35 + order * 0.08})`
    ctx.lineWidth = lw * (0.6 + order * 0.25)
    ctx.beginPath()
    const [x0, y0] = river.points[0]
    ctx.moveTo((x0 / 100) * width, (y0 / 100) * height)
    for (let i = 1; i < river.points.length; i++) {
      const [x, y] = river.points[i]
      ctx.lineTo((x / 100) * width, (y / 100) * height)
    }
    ctx.stroke()
  }
}

function rasterizeFromCells(
  ctx: CanvasRenderingContext2D,
  map: WorldMapDocument,
  width: number,
  height: number
): void {
  const cells = map.terrainCells ?? []
  if (!cells.length) return
  const cellPx = Math.max(1, ((map.cellSize ?? 100 / 64) / 100) * width)
  for (const c of cells) {
    ctx.fillStyle = TERRAIN_COLORS[c.terrain] ?? TERRAIN_COLORS.plain
    const px = (c.x / 100) * width - cellPx / 2
    const py = (c.y / 100) * height - cellPx / 2
    ctx.fillRect(px, py, cellPx + 1, cellPx + 1)
  }
}

/**
 * 由 WorldMapDocument 生成 2:1 等距圆柱 PNG Data URL
 */
export function buildEquirectangularFromMap(
  map: WorldMapDocument,
  options: EquirectRasterOptions = {}
): string {
  if (typeof document === 'undefined') return ''

  const scale = options.scale ?? 'continent'
  const { width, height } =
    options.width && options.height
      ? { width: options.width, height: options.height }
      : equirectDimensionsForMap(map, scale)
  const seed = options.seed ?? map.seed ?? 0
  const overlayCells = options.overlayCells !== false
  const oceanRgb = terrainRgb('ocean')
  const coastRgb = terrainRgb('coast')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = TERRAIN_COLORS.ocean
  ctx.fillRect(0, 0, width, height)

  const regions = [...(map.regions ?? [])]
    .filter((r) => r.polygon && r.polygon.length >= 3)
    .sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon))

  if (regions.length) {
    for (const region of regions) {
      const rgb = terrainRgb(region.terrain)
      const n = hash2D(region.id.length * 17, seed, region.id.charCodeAt(0) || 0) * 0.06 - 0.03
      ctx.fillStyle = rgbToCss([
        Math.min(255, Math.max(0, Math.round(rgb[0] * (1 + n)))),
        Math.min(255, Math.max(0, Math.round(rgb[1] * (1 + n)))),
        Math.min(255, Math.max(0, Math.round(rgb[2] * (1 + n))))
      ])
      fillPolygon(ctx, region.polygon, width, height)
    }
  } else if (map.terrainCells?.length) {
    rasterizeFromCells(ctx, map, width, height)
  }

  if (overlayCells && regions.length && map.terrainCells?.length) {
    ctx.globalAlpha = 0.35
    rasterizeFromCells(ctx, map, width, height)
    ctx.globalAlpha = 1
  }

  const lakes = map.lakes ?? []
  const lakeRgb: [number, number, number] = [36, 92, 138]
  for (const lake of lakes) {
    ctx.fillStyle = rgbToCss(lakeRgb, 0.92)
    if (lake.polygon?.length && lake.polygon.length >= 3) {
      fillPolygon(ctx, lake.polygon, width, height)
    } else {
      const cx = (lake.cx / 100) * width
      const cy = (lake.cy / 100) * height
      const r = Math.max(2, (lake.radius / 100) * width)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  drawRivers(ctx, map.rivers ?? [], width, height)

  const imageData = ctx.getImageData(0, 0, width, height)
  const rgba = imageData.data

  if (!regions.length && !map.terrainCells?.length) {
    sealEquirectangularSeam(rgba, width, height)
    return encodeRgbaAsPngDataUrl(rgba, width, height)
  }

  applyTerrainNoise(rgba, width, height, seed, oceanRgb)
  applyCoastTint(rgba, width, height, oceanRgb, coastRgb)

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const xPct = ((px + 0.5) / width) * 100
      const yPct = ((py + 0.5) / height) * 100
      if (lakeAt(xPct, yPct, lakes)) {
        const i = (py * width + px) * 4
        rgba[i] = lakeRgb[0]
        rgba[i + 1] = lakeRgb[1]
        rgba[i + 2] = lakeRgb[2]
        rgba[i + 3] = 255
      }
    }
  }

  sealEquirectangularSeam(rgba, width, height)
  return encodeRgbaAsPngDataUrl(rgba, width, height)
}
