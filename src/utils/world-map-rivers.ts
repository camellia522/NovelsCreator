/**
 * 等距圆柱贴图：河流（浅蓝）、湖泊（略深蓝）
 */

import type { MapLake, MapRiver } from '@/types/project'
import { percentToLatLon } from '@/utils/world-map-coords'
import { smoothPolyline } from '@/utils/world-map-coords'

/** 河流：浅蓝 */
export const RIVER_STROKE = 'rgba(130, 200, 245, 0.92)'
export const RIVER_STROKE_MAIN = 'rgba(150, 215, 252, 0.95)'

/** 湖泊：比河流略深 */
export const LAKE_FILL = 'rgba(42, 88, 138, 0.94)'

function absLat(yPct: number): number {
  return Math.abs(percentToLatLon(0, yPct).lat)
}

export function sanitizeRiverPoints(points: [number, number][]): [number, number][] {
  if (points.length < 2) return []
  const out: [number, number][] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1]
    const cur = points[i]
    if (absLat(cur[1]) > 78) continue
    if (Math.abs(cur[0] - prev[0]) > 42) {
      if (out.length >= 2) out.push(cur)
      else out[0] = cur
      continue
    }
    if (Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) < 0.15) continue
    out.push(cur)
  }
  return out.length >= 2 ? smoothPolyline(out, 2) : []
}

function strokeRiverPath(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  width: number,
  height: number,
  style: string,
  lineWidth: number
): void {
  if (pts.length < 2) return
  ctx.strokeStyle = style
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const [x0, y0] = pts[0]
  ctx.moveTo((x0 / 100) * width, (y0 / 100) * height)
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [xp] = pts[i - 1]
    const px = (x1 / 100) * width
    const py = (y1 / 100) * height
    if (Math.abs(x1 - xp) > 42) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
}

export function drawRiversOnRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  rivers: MapRiver[]
): void {
  if (typeof document === 'undefined' || !rivers.length) return

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height)
  ctx.putImageData(imageData, 0, 0)

  const lw = Math.max(1.4, width / 520)
  for (const river of rivers) {
    const pts = sanitizeRiverPoints(river.points)
    const order = river.order ?? 1
    const style = order >= 3 ? RIVER_STROKE_MAIN : RIVER_STROKE
    strokeRiverPath(ctx, pts, width, height, style, lw * (order >= 3 ? 1.4 : 1))
  }

  rgba.set(ctx.getImageData(0, 0, width, height).data)
}

export function drawLakesOnRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  lakes: MapLake[],
  lakeMask: Uint8Array
): void {
  if (typeof document === 'undefined') return

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height)
  ctx.putImageData(imageData, 0, 0)

  ctx.fillStyle = LAKE_FILL

  for (const lake of lakes) {
    if (lake.polygon && lake.polygon.length >= 3) {
      ctx.beginPath()
      const [x0, y0] = lake.polygon[0]
      ctx.moveTo((x0 / 100) * width, (y0 / 100) * height)
      for (let i = 1; i < lake.polygon.length; i++) {
        const [x, y] = lake.polygon[i]
        ctx.lineTo((x / 100) * width, (y / 100) * height)
      }
      ctx.closePath()
      ctx.fill()
    } else {
      const cx = (lake.cx / 100) * width
      const cy = (lake.cy / 100) * height
      const r = Math.max(2, (lake.radius / 100) * width)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const n = width * height
  for (let idx = 0; idx < n; idx++) {
    if (lakeMask[idx] !== 1) continue
    const x = idx % width
    const y = Math.floor(idx / width)
    ctx.fillRect(x, y, 1, 1)
  }

  rgba.set(ctx.getImageData(0, 0, width, height).data)
}
