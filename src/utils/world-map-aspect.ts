import type { WorldMapDocument } from '@/types/project'

/** 等距圆柱贴图默认 2:1 */
export const DEFAULT_MAP_RASTER_ASPECT = { w: 2, h: 1 } as const

/** 编辑器 / 预览：方形显示区域 */
export const MAP_DISPLAY_ASPECT = { w: 1, h: 1 } as const

/** 贴图像素宽高（勿用 map.width/height，那是 0–100 逻辑坐标） */
export function mapRasterDimensions(
  map: Pick<WorldMapDocument, 'renderWidth' | 'renderHeight'> | null | undefined
): { w: number; h: number } {
  const rw = map?.renderWidth ?? 0
  const rh = map?.renderHeight ?? 0
  if (rw > 0 && rh > 0) return { w: rw, h: rh }
  return { w: DEFAULT_MAP_RASTER_ASPECT.w, h: DEFAULT_MAP_RASTER_ASPECT.h }
}

export function mapRasterAspectRatio(
  map: Pick<WorldMapDocument, 'renderWidth' | 'renderHeight'> | null | undefined
): number {
  const { w, h } = mapRasterDimensions(map)
  return w / h
}

/** UI 地图框比例（方形） */
export function mapDisplayDimensions(): { w: number; h: number } {
  return { w: MAP_DISPLAY_ASPECT.w, h: MAP_DISPLAY_ASPECT.h }
}

/** object-fit: contain 时，贴图在方框内的实际绘制区域（相对 frame 像素） */
export function mapContentRectInFrame(
  frameWidth: number,
  frameHeight: number,
  rasterAspect: number
): { x: number; y: number; w: number; h: number } {
  if (frameWidth <= 0 || frameHeight <= 0 || rasterAspect <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  const frameAspect = frameWidth / frameHeight
  if (rasterAspect >= frameAspect) {
    const w = frameWidth
    const h = w / rasterAspect
    return { x: 0, y: (frameHeight - h) / 2, w, h }
  }
  const h = frameHeight
  const w = h * rasterAspect
  return { x: (frameWidth - w) / 2, y: 0, w, h }
}
