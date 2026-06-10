import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import type { WorldGenResult } from '@/types/world-gen'

export interface MapImageSources {
  url?: string | null
  filePath?: string | null
}

export type ReadMapFileResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string }

function parseNcMapFilePath(url: string): string | null {
  if (!url.startsWith('nc-map://')) return null
  try {
    return decodeURIComponent(url.slice('nc-map://'.length))
  } catch {
    return null
  }
}

function isPngDataUrl(dataUrl: string): boolean {
  if (!dataUrl.startsWith('data:image/png;base64,')) return false
  try {
    const raw = atob(dataUrl.slice('data:image/png;base64,'.length))
    return raw.charCodeAt(0) === 0x89 && raw.charCodeAt(1) === 0x50
  } catch {
    return false
  }
}

/** 解析为可在 <img> / Three.js 中使用的 URL（优先 IPC 读本地 PNG） */
export async function resolveDisplayMapUrl(
  url: string | null | undefined,
  filePath?: string | null
): Promise<string | null> {
  const api = typeof window !== 'undefined' ? window.novelsCreator?.world : undefined
  const paths = [filePath, url ? parseNcMapFilePath(url) : null].filter(
    (p): p is string => !!p
  )

  for (const path of paths) {
    if (!api?.readMapFile) break
    try {
      const read = await api.readMapFile(path)
      if (read.ok && read.dataUrl.startsWith('data:image/')) return read.dataUrl
    } catch {
      /* try next */
    }
  }

  if (!url) return null
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) {
    return url
  }
  if (url.startsWith('nc-map://')) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`地图加载失败 (${res.status})`)
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    } catch {
      return null
    }
  }
  return null
}

export function bytesToDataUrl(bytes: Uint8Array, mime = 'image/png'): Promise<string> {
  const copy = Uint8Array.from(bytes)
  const blob = new Blob([copy], { type: mime })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取地图失败'))
    reader.readAsDataURL(blob)
  })
}

/** 将生成结果中的贴图固定为内存 data URL，与地图编辑/预览显示同源 */
export async function pinWorldGenMapRaster(result: WorldGenResult): Promise<WorldGenResult> {
  if (!result.map?.hasRasterImage) return result
  const raster = await resolveMapDataUrlForSave(result.mapImageDataUrl, result.mapImageFilePath)
  if (!raster) return result
  return {
    ...result,
    mapImageDataUrl: raster,
    mapImageFilePath: undefined
  }
}

/** 写入项目前转为 data URL（供 knowledge/map.png 落盘） */
export async function resolveMapDataUrlForSave(
  url: string | null | undefined,
  filePath?: string | null
): Promise<string | null> {
  if (url?.startsWith('data:') && isPngDataUrl(url)) return url

  const api = typeof window !== 'undefined' ? window.novelsCreator?.world : undefined
  if (filePath && api?.readMapFile) {
    try {
      const read = await api.readMapFile(filePath)
      if (read.ok && isPngDataUrl(read.dataUrl)) return read.dataUrl
    } catch {
      /* fall through */
    }
  }

  const display = await resolveDisplayMapUrl(url, filePath)
  if (!display) return null
  if (display.startsWith('data:')) return display
  if (display.startsWith('blob:')) {
    const res = await fetch(display)
    const blob = await res.blob()
    return bytesToDataUrl(new Uint8Array(await blob.arrayBuffer()), blob.type || 'image/png')
  }
  return null
}

export function useDisplayMapUrl(
  urlSource: Ref<string | null | undefined>,
  filePathSource?: Ref<string | null | undefined>
): { displayUrl: Ref<string | null>; loadError: Ref<string | null> } {
  const displayUrl = ref<string | null>(null)
  const loadError = ref<string | null>(null)
  let blobUrl: string | null = null
  let requestId = 0

  function revoke(): void {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      blobUrl = null
    }
  }

  watch(
    [urlSource, filePathSource ?? ref(null)],
    async ([url, filePath]) => {
      const id = ++requestId
      revoke()
      displayUrl.value = null
      loadError.value = null
      if (!url && !filePath) return
      try {
        const resolved = await resolveDisplayMapUrl(url, filePath)
        if (id !== requestId) return
        if (resolved?.startsWith('blob:')) blobUrl = resolved
        displayUrl.value = resolved
        if (!resolved) loadError.value = '无法加载地图贴图'
      } catch (err) {
        if (id !== requestId) return
        loadError.value = err instanceof Error ? err.message : String(err)
      }
    },
    { immediate: true }
  )

  onUnmounted(revoke)
  return { displayUrl, loadError }
}

/** 预览页：平面 + 球面共用同一张已解析贴图 */
export function useWorldMapPreviewImage(
  preview: Ref<{ mapImageDataUrl?: string; mapImageFilePath?: string } | null>
) {
  const urlSource = computed(() => preview.value?.mapImageDataUrl)
  const filePathSource = computed(() => preview.value?.mapImageFilePath)
  return useDisplayMapUrl(urlSource, filePathSource)
}
