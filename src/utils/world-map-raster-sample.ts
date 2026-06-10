import type { MapTerrainCell, TerrainType, WorldMapDocument } from '@/types/project'
import { createHexLayout, ensureMapHexGrid, hexCenter } from '@/utils/world-hex-grid'

/** WorldEngine 卫星图海洋色 rgb(23,94,145) */
const SATELLITE_OCEAN: [number, number, number] = [23, 94, 145]

export function loadMapImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('地图贴图加载失败'))
    img.src = src
  })
}

function readImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法读取地图像素')
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

function colorDist(r: number, g: number, b: number, ref: [number, number, number]): number {
  return Math.hypot(r - ref[0], g - ref[1], b - ref[2])
}

/** 从卫星地势 PNG 判断海洋 / 陆地（用于与 hex 领土对齐） */
export function classifySatellitePixel(r: number, g: number, b: number, a = 255): TerrainType {
  if (a < 8) return 'ocean'
  if (colorDist(r, g, b, SATELLITE_OCEAN) < 55) return 'ocean'
  if (b > 95 && r < 85 && g < 130 && b > r + 28 && b > g + 8) return 'ocean'
  if (g > 55 && g >= b - 8 && r < 130) return 'forest'
  if (r > 175 && g > 160 && b > 140 && r - b < 40) return 'desert'
  if (r > 200 && g > 200 && b > 200) return 'plain'
  return 'plain'
}

export function sampleTerrainFromImageAtPercent(
  data: ImageData,
  xPct: number,
  yPct: number
): TerrainType {
  const w = data.width
  const h = data.height
  if (w <= 0 || h <= 0) return 'ocean'
  const px = Math.min(w - 1, Math.max(0, Math.round((xPct / 100) * w)))
  const py = Math.min(h - 1, Math.max(0, Math.round((yPct / 100) * h)))
  const i = (py * w + px) * 4
  return classifySatellitePixel(data.data[i]!, data.data[i + 1]!, data.data[i + 2]!, data.data[i + 3]!)
}

/** 按贴图像素重采样 terrainCells（64×64） */
export function rebuildTerrainCellsFromImage(
  map: WorldMapDocument,
  img: HTMLImageElement
): number {
  const data = readImageData(img)
  const gridSize = map.gridSize ?? 64
  const cells: MapTerrainCell[] = []
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const x = (gx / gridSize) * 100
      const y = (gy / gridSize) * 100
      cells.push({
        x,
        y,
        terrain: sampleTerrainFromImageAtPercent(data, x, y)
      })
    }
  }
  map.terrainCells = cells
  return cells.length
}

/** 按贴图像素更新 hex 格地势，使领土层与地势图陆海一致 */
export function syncHexTerrainFromImage(map: WorldMapDocument, img: HTMLImageElement): number {
  ensureMapHexGrid(map)
  const data = readImageData(img)
  const layout = createHexLayout(map.hexGrid!.cols, map.hexGrid!.rows)
  let changed = 0
  for (const c of map.hexGrid!.cells) {
    const { x, y } = hexCenter(layout, c.q, c.r)
    const terrain = sampleTerrainFromImageAtPercent(data, x, y)
    if (c.terrain !== terrain) {
      c.terrain = terrain
      changed++
    }
    if (c.x !== x || c.y !== y) {
      c.x = x
      c.y = y
      changed++
    }
  }
  return changed
}
