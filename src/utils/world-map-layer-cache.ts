/**
 * 地图六边形分层缓存：各 overlay 预计算 fill 后入库，切换图层只合成描边，避免实时重算卡顿。
 */

import type {
  MapHexCell,
  SerializedMapLayerBitmap,
  WorldMapLayerCacheDocument,
  WorldNation
} from '@/types/project'
import type { MapOverlayMode } from '@/components/world/map-editor-types'
import { hexPolygonPoints, type HexLayout } from '@/utils/world-hex-grid'
import { developmentColor, heatColor, wetColor } from '@/utils/world-hex-climate'
import {
  buildProvinceOverlayData,
  buildTerritoryOverlayData,
  type ProvinceOverlayData
} from '@/utils/world-admin-divisions'

export type CachedPaintLayer = Exclude<MapOverlayMode, 'terrain'>

export interface HexGeometryEntry {
  id: string
  points: string
}

export interface ComposedHexPaint extends HexGeometryEntry {
  fill: string
  stroke: string
  strokeWidth: number
}

/** full=气候等全格；sparse-painted=仅已填色格；sparse-selection=仅选格 */
export type HexPaintRenderMode = 'full' | 'sparse-painted' | 'sparse-selection'

export interface StoredLayerBitmap {
  cacheKey: string
  fills: Map<string, string>
  provinceBorderIds?: Set<string>
  meta?: { provinceCount?: number }
}

function defaultStrokeForCell(
  cellId: string,
  layer: MapOverlayMode,
  bitmap: StoredLayerBitmap | undefined,
  selected: Set<string>
): { stroke: string; strokeWidth: number } {
  if (selected.has(cellId)) {
    return { stroke: '#e8c547', strokeWidth: 0.08 }
  }
  if (layer === 'provinces' && bitmap?.provinceBorderIds?.has(cellId)) {
    return { stroke: 'rgba(240, 230, 168, 0.95)', strokeWidth: 0.22 }
  }
  if (layer === 'provinces' && bitmap?.fills.has(cellId)) {
    return { stroke: 'rgba(255, 255, 255, 0.22)', strokeWidth: 0.08 }
  }
  if (
    (layer === 'territory' || layer === 'provinces') &&
    bitmap &&
    !bitmap.fills.has(cellId)
  ) {
    return { stroke: 'transparent', strokeWidth: 0 }
  }
  return { stroke: 'rgba(255,255,255,0.12)', strokeWidth: 0.08 }
}

export function buildHexGeometry(cells: MapHexCell[], layout: HexLayout): HexGeometryEntry[] {
  return cells.map((cell) => ({
    id: cell.id,
    points: hexPolygonPoints(cell, layout)
  }))
}

export function geometryCacheKey(cells: MapHexCell[], layout: HexLayout): string {
  const first = cells[0]?.id ?? ''
  const last = cells[cells.length - 1]?.id ?? ''
  return `g:${cells.length}:${layout.cols}x${layout.rows}:${first}:${last}`
}

function climateFillWithOverlayAlpha(color: string, alpha = 0.72): string {
  if (color.startsWith('rgba')) return color
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(color.trim())
  if (!m) return color
  return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`
}

/** 国家领土/行省在卫星底图上需更高不透明度 */
export function territoryOverlayFillColor(color: string, alpha = 0.68): string {
  const trimmed = color.trim()
  if (trimmed.startsWith('rgba')) return trimmed
  const hsla = /^hsla?\(([^)]+)\)$/i.exec(trimmed)
  if (hsla) {
    const parts = hsla[1]!.split(/[/,]/).map((s) => s.trim())
    if (parts.length >= 4) {
      const a = Math.max(parseFloat(parts[3]!) || alpha, alpha)
      return `hsla(${parts[0]} ${parts[1]} ${parts[2]} / ${a})`
    }
    if (parts.length === 3) {
      return `hsla(${parts[0]} ${parts[1]} ${parts[2]} / ${alpha})`
    }
  }
  const rgb = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(trimmed)
  if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${alpha})`
  if (/^#[0-9a-f]{8}$/i.test(trimmed)) return trimmed
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return `${trimmed}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
  return trimmed
}

export function buildClimateLayerFills(
  cells: MapHexCell[],
  layer: 'temperature' | 'humidity' | 'monsoon' | 'development'
): Map<string, string> {
  const fills = new Map<string, string>()
  for (const cell of cells) {
    let fill = 'transparent'
    if (layer === 'temperature') {
      fill = climateFillWithOverlayAlpha(heatColor(cell.heat ?? 0.5))
    } else if (layer === 'humidity') {
      fill = climateFillWithOverlayAlpha(wetColor(cell.wet ?? 0.5))
    } else if (layer === 'monsoon') {
      fill = cell.monsoon ? 'rgba(80, 160, 220, 0.58)' : 'rgba(20, 24, 32, 0.12)'
    } else if (layer === 'development') {
      fill = developmentColor(cell.development ?? 0)
    }
    fills.set(cell.id, fill)
  }
  return fills
}

export function buildTerritoryLayerBitmap(
  cells: MapHexCell[],
  nations: WorldNation[],
  cacheKey: string
): StoredLayerBitmap {
  const data = buildTerritoryOverlayData(cells, nations)
  const fills = new Map<string, string>()
  for (const [id, color] of data.cellFill) {
    fills.set(id, territoryOverlayFillColor(color, 0.68))
  }
  return { cacheKey, fills }
}

export function buildProvinceLayerBitmap(
  provinceData: ProvinceOverlayData,
  cacheKey: string
): StoredLayerBitmap {
  const fills = new Map<string, string>()
  for (const [id, info] of provinceData.cellFill) {
    fills.set(id, info.fillColor)
  }
  return {
    cacheKey,
    fills,
    provinceBorderIds: provinceData.borderIds
  }
}

export function climateLayerCacheKey(cells: MapHexCell[], layer: CachedPaintLayer): string {
  if (layer === 'territory' || layer === 'provinces') return ''
  let minH = 1
  let maxH = 0
  let minW = 1
  let maxW = 0
  for (const c of cells) {
    const h = c.heat ?? 0.5
    const w = c.wet ?? 0.5
    minH = Math.min(minH, h)
    maxH = Math.max(maxH, h)
    minW = Math.min(minW, w)
    maxW = Math.max(maxW, w)
  }
  return `cli:${layer}:${cells.length}:${minH.toFixed(2)}:${maxH.toFixed(2)}:${minW.toFixed(2)}:${maxW.toFixed(2)}`
}

export function territoryLayerCacheKey(
  territoryRevision: number,
  nations: WorldNation[]
): string {
  return `ter:${territoryRevision}:${nations.map((n) => `${n.id}:${n.color ?? ''}`).join(';')}`
}

export function provinceLayerCacheKey(
  territoryRevision: number,
  nationScope: string | null,
  cellsPerProvince: number,
  seed: number,
  namingStyle?: string
): string {
  return `prov:${territoryRevision}:${nationScope ?? 'all'}:${cellsPerProvince}:${seed}:${namingStyle ?? 'chinese'}`
}

/** 分图层存储 + 合成显示 */
export class WorldMapLayerStore {
  private geometryKey = ''
  private geometry: HexGeometryEntry[] = []
  private geometryById = new Map<string, HexGeometryEntry>()
  private layers = new Map<CachedPaintLayer, StoredLayerBitmap>()
  private composed: ComposedHexPaint[] = []
  private activeLayer: MapOverlayMode = 'terrain'
  private composedLayer: MapOverlayMode | null = null
  private composedLayerKey = ''
  private composedRenderMode: HexPaintRenderMode = 'full'
  private selectionKey = ''

  get geometryCount(): number {
    return this.geometry.length
  }

  ensureGeometry(cells: MapHexCell[], layout: HexLayout): boolean {
    const key = geometryCacheKey(cells, layout)
    if (key === this.geometryKey && this.geometry.length === cells.length) return false
    this.geometryKey = key
    this.geometry = buildHexGeometry(cells, layout)
    this.geometryById = new Map(this.geometry.map((g) => [g.id, g]))
    this.layers.clear()
    this.composed = []
    this.composedLayer = null
    this.composedLayerKey = ''
    this.composedRenderMode = 'full'
    return true
  }

  hasLayer(layer: CachedPaintLayer, cacheKey: string): boolean {
    const hit = this.layers.get(layer)
    return !!hit && hit.cacheKey === cacheKey
  }

  getLayer(layer: CachedPaintLayer): StoredLayerBitmap | undefined {
    return this.layers.get(layer)
  }

  putLayer(layer: CachedPaintLayer, bitmap: StoredLayerBitmap): void {
    this.layers.set(layer, bitmap)
    if (this.activeLayer === layer) {
      this.composed = []
      this.composedLayerKey = ''
    }
  }

  invalidateLayer(layer: CachedPaintLayer): void {
    this.layers.delete(layer)
    if (this.activeLayer === layer) {
      this.composed = []
      this.composedLayerKey = ''
    }
  }

  invalidateAllLayers(): void {
    this.layers.clear()
    this.composed = []
    this.composedLayer = null
    this.composedLayerKey = ''
  }

  /** 缓存 fills 的 cell id 是否与当前几何一致（避免保存后格网 id 变化导致图层全透明） */
  layerMatchesGeometry(layer: CachedPaintLayer, geometry: HexGeometryEntry[]): boolean {
    const bitmap = this.layers.get(layer)
    if (!bitmap?.fills.size || !geometry.length) return false

    if (layer === 'territory' || layer === 'provinces') {
      for (const id of bitmap.fills.keys()) {
        if (this.geometryById.has(id)) return true
      }
      return false
    }

    const sample =
      geometry.length <= 16
        ? geometry
        : [geometry[0]!, geometry[Math.floor(geometry.length / 2)]!, geometry[geometry.length - 1]!]
    let hits = 0
    for (const g of sample) {
      if (bitmap.fills.has(g.id)) hits++
    }
    if (hits < Math.min(2, sample.length)) return false
    return bitmap.fills.size >= geometry.length * 0.85
  }

  pruneLayersNotMatchingGeometry(geometry: HexGeometryEntry[]): void {
    for (const layer of [...this.layers.keys()]) {
      if (!this.layerMatchesGeometry(layer, geometry)) {
        this.layers.delete(layer)
      }
    }
    this.composed = []
    this.composedLayer = null
    this.composedLayerKey = ''
  }

  getLayerIfValid(layer: CachedPaintLayer, cacheKey: string): StoredLayerBitmap | undefined {
    const hit = this.layers.get(layer)
    if (!hit || hit.cacheKey !== cacheKey) return undefined
    if (!this.layerMatchesGeometry(layer, this.geometry)) return undefined
    return hit
  }

  setActiveLayer(layer: MapOverlayMode): void {
    if (layer !== this.activeLayer) {
      this.activeLayer = layer
      this.composed = []
      this.composedLayer = null
      this.composedLayerKey = ''
      this.composedRenderMode = 'full'
      this.selectionKey = ''
    }
  }

  getDisplayPaints(
    selectedIds: Set<string>,
    layerKey = '',
    renderMode: HexPaintRenderMode = 'full'
  ): ComposedHexPaint[] {
    const selKey = [...selectedIds].sort().join(',')
    const key = layerKey ?? ''
    const layerBitmap =
      this.activeLayer === 'terrain'
        ? undefined
        : key
          ? this.getLayerIfValid(this.activeLayer, key)
          : this.layers.get(this.activeLayer)

    const useSparse =
      renderMode === 'sparse-painted' &&
      (this.activeLayer === 'territory' || this.activeLayer === 'provinces')
    const useSparseSelection =
      renderMode === 'sparse-selection' && this.activeLayer === 'terrain'

    const layerReady =
      (this.activeLayer === 'terrain' || !!layerBitmap) &&
      this.composedLayer === this.activeLayer &&
      this.composedLayerKey === key &&
      this.composedRenderMode === renderMode &&
      this.composed.length > 0

    if (layerReady && this.selectionKey === selKey) {
      return this.composed
    }

    if (layerReady && this.selectionKey !== selKey && !useSparse && !useSparseSelection) {
      this.applySelectionStrokes(selectedIds, layerBitmap)
      this.selectionKey = selKey
      return this.composed
    }

    let paints: ComposedHexPaint[]
    if (useSparse && layerBitmap) {
      paints = this.buildSparsePainted(layerBitmap, selectedIds)
    } else if (useSparse) {
      paints = []
    } else if (useSparseSelection) {
      paints = this.buildSparseSelection(selectedIds)
    } else {
      paints = this.buildFullPaints(layerBitmap, selectedIds)
    }

    this.composed = paints
    this.composedLayer = this.activeLayer
    this.composedLayerKey = key
    this.composedRenderMode = renderMode
    this.selectionKey = selKey
    return paints
  }

  private buildFullPaints(
    layerBitmap: StoredLayerBitmap | undefined,
    selectedIds: Set<string>
  ): ComposedHexPaint[] {
    const paints: ComposedHexPaint[] = []
    for (const g of this.geometry) {
      const fill =
        this.activeLayer === 'terrain'
          ? 'transparent'
          : (layerBitmap?.fills.get(g.id) ?? 'transparent')
      const { stroke, strokeWidth } = defaultStrokeForCell(
        g.id,
        this.activeLayer,
        layerBitmap,
        selectedIds
      )
      paints.push({ id: g.id, points: g.points, fill, stroke, strokeWidth })
    }
    return paints
  }

  private buildSparsePainted(
    layerBitmap: StoredLayerBitmap,
    selectedIds: Set<string>
  ): ComposedHexPaint[] {
    const ids = new Set<string>(selectedIds)
    for (const id of layerBitmap.fills.keys()) ids.add(id)
    if (layerBitmap.provinceBorderIds) {
      for (const id of layerBitmap.provinceBorderIds) ids.add(id)
    }
    const paints: ComposedHexPaint[] = []
    for (const id of ids) {
      const g = this.geometryById.get(id)
      if (!g) continue
      const fill = layerBitmap.fills.get(id) ?? 'transparent'
      const { stroke, strokeWidth } = defaultStrokeForCell(
        id,
        this.activeLayer,
        layerBitmap,
        selectedIds
      )
      paints.push({ id, points: g.points, fill, stroke, strokeWidth })
    }
    return paints
  }

  private buildSparseSelection(selectedIds: Set<string>): ComposedHexPaint[] {
    const paints: ComposedHexPaint[] = []
    for (const id of selectedIds) {
      const g = this.geometryById.get(id)
      if (!g) continue
      paints.push({
        id,
        points: g.points,
        fill: 'rgba(110, 181, 255, 0.2)',
        stroke: '#e8c547',
        strokeWidth: 0.1
      })
    }
    return paints
  }

  private applySelectionStrokes(
    selectedIds: Set<string>,
    bitmap: StoredLayerBitmap | undefined
  ): void {
    for (const p of this.composed) {
      const { stroke, strokeWidth } = defaultStrokeForCell(
        p.id,
        this.activeLayer,
        bitmap,
        selectedIds
      )
      p.stroke = stroke
      p.strokeWidth = strokeWidth
    }
  }

  hydrateFromDocument(doc: WorldMapLayerCacheDocument | null | undefined): void {
    if (!doc?.layers || doc.schemaVersion !== 1) return
    for (const [key, raw] of Object.entries(doc.layers)) {
      const layer = key as CachedPaintLayer
      if (!raw) continue
      this.layers.set(layer, deserializeLayerBitmap(raw))
    }
  }

  exportToDocument(): WorldMapLayerCacheDocument {
    const layers: WorldMapLayerCacheDocument['layers'] = {}
    for (const [layer, bitmap] of this.layers) {
      layers[layer] = serializeLayerBitmap(bitmap)
    }
    return { schemaVersion: 1, layers }
  }
}

export function serializeLayerBitmap(bitmap: StoredLayerBitmap): SerializedMapLayerBitmap {
  const fills: Record<string, string> = {}
  for (const [id, color] of bitmap.fills) fills[id] = color
  return {
    cacheKey: bitmap.cacheKey,
    fills,
    provinceBorderIds: bitmap.provinceBorderIds
      ? [...bitmap.provinceBorderIds]
      : undefined,
    meta: bitmap.meta
  }
}

export function deserializeLayerBitmap(raw: SerializedMapLayerBitmap): StoredLayerBitmap {
  return {
    cacheKey: raw.cacheKey,
    fills: new Map(Object.entries(raw.fills)),
    provinceBorderIds: raw.provinceBorderIds
      ? new Set(raw.provinceBorderIds)
      : undefined,
    meta: raw.meta
  }
}
