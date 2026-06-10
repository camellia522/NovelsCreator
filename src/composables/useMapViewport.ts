import { computed, ref } from 'vue'
import { mapContentRectInFrame } from '@/utils/world-map-aspect'

export interface MapPointerOptions {
  /** 贴图宽高比（宽/高）；方形视口下按 letterbox 映射坐标 */
  contentAspect?: number
}

/** Ctrl + 滚轮缩放地图视口；放大后可拖移查看 */
export function useMapViewport() {
  const zoom = ref(1)
  const panX = ref(0)
  const panY = ref(0)

  function onWheel(e: WheelEvent): void {
    if (!e.ctrlKey) return
    e.preventDefault()
    const step = e.deltaY > 0 ? 0.9 : 1.1
    zoom.value = Math.min(4, Math.max(0.5, zoom.value * step))
    if (zoom.value <= 1.02) {
      panX.value = 0
      panY.value = 0
    }
  }

  const viewportStyle = computed(() => ({
    transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
    transformOrigin: 'center center'
  }))

  /** 将屏幕坐标反算为地图舞台内的 0–100%（须用未 transform 的 frame 矩形） */
  function pointerToMapPercent(
    clientX: number,
    clientY: number,
    stageRect: DOMRect,
    opts?: MapPointerOptions
  ): { x: number; y: number } {
    if (stageRect.width <= 0 || stageRect.height <= 0) return { x: 0, y: 0 }
    const cx = stageRect.width / 2
    const cy = stageRect.height / 2
    const z = zoom.value
    const localX = (clientX - stageRect.left - cx - panX.value) / z + cx
    const localY = (clientY - stageRect.top - cy - panY.value) / z + cy

    let mapX = 0
    let mapY = 0
    let mapW = stageRect.width
    let mapH = stageRect.height
    if (opts?.contentAspect && opts.contentAspect > 0) {
      const box = mapContentRectInFrame(stageRect.width, stageRect.height, opts.contentAspect)
      mapX = box.x
      mapY = box.y
      mapW = box.w
      mapH = box.h
    }

    return {
      x: ((localX - mapX) / mapW) * 100,
      y: ((localY - mapY) / mapH) * 100
    }
  }

  const zoomLabel = computed(() =>
    Math.abs(zoom.value - 1) < 0.02 ? '' : `${Math.round(zoom.value * 100)}%`
  )

  const canPan = computed(() => zoom.value > 1.02)

  function resetViewport(): void {
    zoom.value = 1
    panX.value = 0
    panY.value = 0
  }

  function panBy(dx: number, dy: number): void {
    if (!canPan.value) return
    panX.value += dx
    panY.value += dy
  }

  return {
    zoom,
    panX,
    panY,
    canPan,
    onWheel,
    viewportStyle,
    zoomLabel,
    resetViewport,
    panBy,
    pointerToMapPercent
  }
}
