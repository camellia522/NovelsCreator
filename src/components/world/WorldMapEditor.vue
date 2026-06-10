<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, toRef, watch } from 'vue'
import type {
  MapHexCell,
  WorldLocation,
  WorldMapDocument,
  WorldMapLayerCacheDocument,
  WorldNation
} from '@/types/project'
import type { PlaceNamingStyle } from '@/types/world-gen'
import MapEditorSidebar from '@/components/world/MapEditorSidebar.vue'
import WorldLocationDetail from '@/components/world/WorldLocationDetail.vue'
import {
  BRUSH_RADIUS_DEFAULT,
  CELLS_PER_PROVINCE_DEFAULT,
  type MapOverlayMode,
  type NationListMode,
  type TerritoryPaintMode
} from '@/components/world/map-editor-types'
import {
  createHexLayout,
  countHexCenterDrift,
  ensureMapHexGrid,
  floodFillHexCells,
  hexCellCenter,
  hexesInBrush,
  hexesInRect,
  percentToHex
} from '@/utils/world-hex-grid'
import {
  buildProvinceLayerBitmap,
  buildClimateLayerFills,
  buildTerritoryLayerBitmap,
  buildHexGeometry,
  climateLayerCacheKey,
  provinceLayerCacheKey,
  territoryLayerCacheKey,
  WorldMapLayerStore,
  type ComposedHexPaint,
  type HexPaintRenderMode
} from '@/utils/world-map-layer-cache'
import {
  buildProvinceOverlayData,
  computeProvincePreviews,
  computeProvincePreviewsForNation
} from '@/utils/world-admin-divisions'
import { hexClimateAlreadySynced, hexDevelopmentAlreadySynced, syncHexClimateFromTerrain, syncHexDevelopmentFromTerrain } from '@/utils/world-hex-climate'
import {
  scoreHexForCity,
  snapLocationToLand,
  summarizeTerritories,
  hasPaintedTerritory
} from '@/utils/world-territory-society'
import {
  applyTerritoryRecognition,
  canPaintCellForNation
} from '@/utils/world-territory-recognition'
import { nationColor } from '@/utils/world-map-territory'
import { useMapViewport } from '@/composables/useMapViewport'
import { useDisplayMapUrl } from '@/utils/world-map-display-url'
import {
  isMarkerLabelVisibleAtZoom,
  locationMarkerClass,
  locationMarkerRadius,
  locationPickRadiusPx,
  mapMarkersForDisplay
} from '@/utils/world-location-marker'
import { placeNameForMapLabel } from '@/utils/world-place-name-zh'
import { buildTerritoryViewPaints, buildProvinceViewPaints } from '@/utils/world-map-territory-view'
import { auditLocationCoords, reconcileMapLayers } from '@/utils/world-location-coords'
import { mapDisplayDimensions } from '@/utils/world-map-aspect'
import { loadMapImage } from '@/utils/world-map-raster-sample'
import { alignTerritoryWithTerrainMap } from '@/utils/world-territory-land-align'

const props = defineProps<{
  map: WorldMapDocument
  locations: WorldLocation[]
  imageUrl?: string | null
  /** 本地 map.png 绝对路径，优先经 IPC 读取缓存贴图 */
  imageFilePath?: string | null
  /** 国家列表点击行为：地图编辑用 paint，世界观生成后用 edit */
  nationListMode?: NationListMode
  /** 行省预览占位名风格（与世界观生成器 config 一致） */
  placeNamingStyle?: PlaceNamingStyle
  /** 已持久化的图层缓存（打开时注入，保存时覆写） */
  layerCache?: WorldMapLayerCacheDocument | null
}>()

const emit = defineEmits<{
  dirty: []
  'layer-cache': [WorldMapLayerCacheDocument]
}>()

let layerCacheEmitTimer = 0
let lastLayerCacheJson = ''

function emitLayerCacheSoon(): void {
  window.clearTimeout(layerCacheEmitTimer)
  layerCacheEmitTimer = window.setTimeout(() => {
    const doc = layerStore.exportToDocument()
    const json = JSON.stringify(doc)
    if (json === lastLayerCacheJson) return
    lastLayerCacheJson = json
    emit('layer-cache', doc)
  }, 600)
}

const overlay = ref<MapOverlayMode>('terrain')
const territoryPaintMode = ref<TerritoryPaintMode>('select')
const brushRadius = ref(BRUSH_RADIUS_DEFAULT)
/** 笔刷半径实时值（滑块拖动时更新，不触发整图重绘） */
let brushRadiusLive = BRUSH_RADIUS_DEFAULT
const paintNeedsSync = ref(false)
const selectedHexIds = ref<Set<string>>(new Set())
const selectedNationId = ref<string | null>(null)
const selectedLocationId = ref<string | null>(null)
const boxSelect = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
const isDraggingBox = ref(false)
const isTerritoryPainting = ref(false)
const lastPaintHexId = ref<string | null>(null)
const draggingLocationId = ref<string | null>(null)
const isPanning = ref(false)
let pendingPanClick: MouseEvent | null = null
const PAN_DRAG_PX = 5
let panPointerId: number | null = null
let panStartX = 0
let panStartY = 0
let panOriginX = 0
let panOriginY = 0
const mapRef = ref<HTMLElement | null>(null)
const mapFrameRef = ref<HTMLElement | null>(null)
const mapViewportRef = ref<HTMLElement | null>(null)
const { zoom, panX, panY, canPan, onWheel, viewportStyle, zoomLabel, resetViewport, pointerToMapPercent } =
  useMapViewport()

const mapImgEl = ref<HTMLImageElement | null>(null)
const mapLayerAligning = ref(false)
const mapAspect = ref({ w: 2, h: 1 })
const mapFrameStyle = ref<{ width: string; height: string }>({ width: '100%', height: '100%' })

function syncMapAspectFromDoc(): void {
  mapAspect.value = mapDisplayDimensions()
}

/** 在 map-stage 内按真实地图比例 fit，避免 flex 把容器拉变形导致贴图与 SVG 图层错位 */
function fitMapFrame(): void {
  const stage = mapRef.value
  if (!stage) return
  const sw = stage.clientWidth
  const sh = stage.clientHeight
  if (sw <= 0 || sh <= 0) return
  const ar = mapAspect.value.w / mapAspect.value.h
  if (!Number.isFinite(ar) || ar <= 0) return
  let w = sw
  let h = w / ar
  if (h > sh) {
    h = sh
    w = h * ar
  }
  mapFrameStyle.value = {
    width: `${Math.max(1, Math.floor(w))}px`,
    height: `${Math.max(1, Math.floor(h))}px`
  }
}

function onMapImageLoad(e: Event): void {
  mapImgEl.value = e.target as HTMLImageElement
  const img = mapImgEl.value
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    const rw = props.map.renderWidth ?? 0
    const rh = props.map.renderHeight ?? 0
    if (rw !== img.naturalWidth || rh !== img.naturalHeight) {
      props.map.renderWidth = img.naturalWidth
      props.map.renderHeight = img.naturalHeight
      markDirty()
    }
  }
  fitMapFrame()
}

let stageResizeObserver: ResizeObserver | null = null
const { displayUrl: mapDisplayUrl, loadError: mapImageError } = useDisplayMapUrl(
  toRef(props, 'imageUrl'),
  toRef(props, 'imageFilePath')
)

const nations = computed(() => props.map.nations ?? [])
const layout = computed(() => {
  ensureMapHexGrid(props.map)
  const g = props.map.hexGrid!
  return createHexLayout(g.cols, g.rows)
})
const hexCells = computed(() => {
  ensureMapHexGrid(props.map)
  return props.map.hexGrid!.cells
})

const hexCellIndex = computed(() => {
  const index = new Map<string, MapHexCell>()
  for (const c of hexCells.value) index.set(`${c.q},${c.r}`, c)
  return index
})

const selectedHexes = computed(() =>
  hexCells.value.filter((c) => selectedHexIds.value.has(c.id))
)

const selectedLocation = computed(() =>
  props.locations.find((l) => l.id === selectedLocationId.value) ?? null
)

function pickLocationAtPointer(e: MouseEvent | PointerEvent): WorldLocation | null {
  const frame = mapFrameRef.value
  if (!frame) return null
  const rect = frame.getBoundingClientRect()
  const p = clientToPercent(e)
  let best: WorldLocation | null = null
  let bestD = Infinity
  for (const loc of props.locations) {
    const d = Math.hypot(loc.x - p.x, loc.y - p.y)
    const pickPct = (locationPickRadiusPx(loc, rect.width) / rect.width) * 100
    if (d < pickPct && d < bestD) {
      bestD = d
      best = loc
    }
  }
  return best
}

const cellsPerProvinceTarget = computed(() =>
  props.map.cellsPerProvinceTarget ?? CELLS_PER_PROVINCE_DEFAULT
)

const territoryRevision = ref(0)
const provinceOverlayLoading = ref(false)
const provincePreviewCount = ref(0)
const layerStore = new WorldMapLayerStore()
const hexPaints = shallowRef<ComposedHexPaint[]>([])
let provinceBuildToken = 0
let layerWarmToken = 0
let territoryLiveRaf = 0
let paintPointerId: number | null = null

const mapMarkers = computed(() =>
  mapMarkersForDisplay(props.locations, selectedLocationId.value, zoom.value, true)
)

const labeledMarkers = computed(() =>
  mapMarkers.value.filter((l) =>
    isMarkerLabelVisibleAtZoom(l, zoom.value, selectedLocationId.value, true)
  )
)

function runWhenIdle(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 900 })
  } else {
    setTimeout(fn, 0)
  }
}

function hexPaintRenderMode(): HexPaintRenderMode {
  if (overlay.value === 'provinces') return 'sparse-painted'
  if (overlay.value === 'terrain') return 'sparse-selection'
  return 'full'
}

function flushDisplayPaints(): void {
  syncLayerGeometry()
  if (overlay.value === 'territory') {
    hexPaints.value = buildTerritoryViewPaints(
      hexCells.value,
      layout.value,
      nations.value,
      selectedHexIds.value
    )
    return
  }
  if (overlay.value === 'provinces') {
    const grid = props.map.hexGrid
    const direct = grid
      ? buildProvinceViewPaints(
          hexCells.value,
          layout.value,
          nations.value,
          grid.cols,
          grid.rows,
          selectedHexIds.value
        )
      : []
    if (direct.length) {
      hexPaints.value = direct
      provinceOverlayLoading.value = false
      return
    }
  }
  ensureActiveOverlayLayerSync()
  hexPaints.value = layerStore.getDisplayPaints(
    selectedHexIds.value,
    overlayCacheKey(overlay.value) ?? '',
    hexPaintRenderMode()
  )
}

function overlayCacheKey(layer: MapOverlayMode): string | undefined {
  if (layer === 'terrain') return undefined
  if (layer === 'territory') {
    return territoryLayerCacheKey(territoryRevision.value, nations.value)
  }
  if (layer === 'provinces') {
    return provinceLayerCacheKey(
      territoryRevision.value,
      selectedNationId.value,
      cellsPerProvinceTarget.value,
      props.map.seed,
      props.placeNamingStyle
    )
  }
  return climateLayerCacheKey(hexCells.value, layer)
}

function ensureActiveOverlayLayerSync(): void {
  const layer = overlay.value
  const token = layerWarmToken
  if (layer === 'territory') {
    ensureTerritoryLayer(token)
  } else if (layer === 'provinces') {
    ensureProvincesLayer(token)
  } else if (
    layer === 'temperature' ||
    layer === 'humidity' ||
    layer === 'monsoon' ||
    layer === 'development'
  ) {
    ensureClimateLayer(layer, token)
  }
}

function pruneLayerCacheToGrid(): void {
  syncLayerGeometry()
  layerStore.pruneLayersNotMatchingGeometry(buildHexGeometry(hexCells.value, layout.value))
}

function ensureHexClimateForEditor(): void {
  if (!hexClimateAlreadySynced(props.map)) {
    syncHexClimateFromTerrain(props.map)
    for (const layer of ['temperature', 'humidity', 'monsoon', 'development'] as const) {
      layerStore.invalidateLayer(layer)
    }
    return
  }
  if (!hexDevelopmentAlreadySynced(props.map)) {
    syncHexDevelopmentFromTerrain(props.map)
    layerStore.invalidateLayer('development')
  }
}

function syncLayerGeometry(): void {
  layerStore.ensureGeometry(hexCells.value, layout.value)
}

function ensureClimateLayer(
  layer: 'temperature' | 'humidity' | 'monsoon' | 'development',
  token: number
): boolean {
  if (token !== layerWarmToken) return false
  const cells = hexCells.value
  const key = climateLayerCacheKey(cells, layer)
  if (layerStore.getLayerIfValid(layer, key)) return false
  layerStore.putLayer(layer, {
    cacheKey: key,
    fills: buildClimateLayerFills(cells, layer)
  })
  return true
}

function warmClimateLayers(token: number): void {
  const changed =
    ensureClimateLayer('temperature', token) ||
    ensureClimateLayer('humidity', token) ||
    ensureClimateLayer('monsoon', token) ||
    ensureClimateLayer('development', token)
  if (changed) emitLayerCacheSoon()
}

function ensureTerritoryLayer(token: number): void {
  if (token !== layerWarmToken) return
  const key = territoryLayerCacheKey(territoryRevision.value, nations.value)
  layerStore.putLayer(
    'territory',
    buildTerritoryLayerBitmap(hexCells.value, nations.value, key)
  )
  emitLayerCacheSoon()
}

function ensureProvincesLayer(token: number): boolean {
  if (token !== layerWarmToken) return false
  const provKey = provinceLayerCacheKey(
    territoryRevision.value,
    selectedNationId.value,
    cellsPerProvinceTarget.value,
    props.map.seed,
    props.placeNamingStyle
  )
  if (!layerStore.getLayerIfValid('provinces', provKey)) return false
  provincePreviewCount.value =
    layerStore.getLayer('provinces')?.meta?.provinceCount ?? provincePreviewCount.value
  provinceOverlayLoading.value = false
  return true
}

function runProvinceLayerBuild(token: number): void {
  if (token !== provinceBuildToken) return
  ensureMapHexGrid(props.map)
  const { cols, rows } = props.map.hexGrid!
  const nationId = selectedNationId.value
  const target = cellsPerProvinceTarget.value
  const seed = props.map.seed
  const provKey = provinceLayerCacheKey(
    territoryRevision.value,
    nationId,
    target,
    seed,
    props.placeNamingStyle
  )
  if (layerStore.getLayerIfValid('provinces', provKey)) {
    provincePreviewCount.value =
      layerStore.getLayer('provinces')?.meta?.provinceCount ?? provincePreviewCount.value
    provinceOverlayLoading.value = false
    if (overlay.value === 'provinces') flushDisplayPaints()
    return
  }
  provincePreviewCount.value = 0
  const summaries = summarizeTerritories(props.map, nations.value)
  const namingConfig = props.placeNamingStyle
    ? { placeNamingStyle: props.placeNamingStyle }
    : undefined
  const previews = nationId
    ? computeProvincePreviewsForNation(
        props.map,
        nationId,
        nations.value,
        summaries,
        scoreHexForCity,
        seed,
        target,
        namingConfig
      )
    : computeProvincePreviews(
        props.map,
        nations.value,
        summaries,
        scoreHexForCity,
        seed,
        target,
        namingConfig
      )
  if (token !== provinceBuildToken) return
  provincePreviewCount.value = previews.length
  const provinceData = buildProvinceOverlayData(previews, nations.value, cols, rows)
  layerStore.putLayer('provinces', {
    ...buildProvinceLayerBitmap(provinceData, provKey),
    meta: { provinceCount: previews.length }
  })
  provinceOverlayLoading.value = false
  if (overlay.value === 'provinces') flushDisplayPaints()
  emitLayerCacheSoon()
}

function scheduleProvinceLayerBuild(): void {
  provinceOverlayLoading.value = true
  const token = ++provinceBuildToken
  runWhenIdle(() => runProvinceLayerBuild(token))
}

function warmMapLayers(): void {
  const token = ++layerWarmToken
  syncLayerGeometry()
  runWhenIdle(() => {
    warmClimateLayers(token)
    ensureTerritoryLayer(token)
  })
}

function onOverlayChange(next: MapOverlayMode): void {
  overlay.value = next
  layerStore.setActiveLayer(next)
  if (next !== 'terrain') {
    ensureHexClimateForEditor()
  }
  syncLayerGeometry()
  if (next === 'provinces') {
    const provKey = provinceLayerCacheKey(
      territoryRevision.value,
      selectedNationId.value,
      cellsPerProvinceTarget.value,
      props.map.seed,
      props.placeNamingStyle
    )
    const cached = layerStore.getLayerIfValid('provinces', provKey)
    provinceOverlayLoading.value = !cached
    if (cached) {
      provincePreviewCount.value =
        layerStore.getLayer('provinces')?.meta?.provinceCount ?? provincePreviewCount.value
    } else {
      scheduleProvinceLayerBuild()
    }
  } else {
    provinceOverlayLoading.value = false
  }
  flushDisplayPaints()
}

function invalidateTerritoryDependentLayers(): void {
  layerStore.invalidateLayer('territory')
  layerStore.invalidateLayer('provinces')
}

function rebuildTerritoryDependentOverlays(): void {
  layerStore.invalidateLayer('provinces')
  ensureTerritoryLayer(layerWarmToken)
  flushDisplayPaints()
}

watch(
  () => nations.value.map((n) => `${n.id}:${n.color}`),
  () => {
    invalidateTerritoryDependentLayers()
    warmMapLayers()
    if (overlay.value === 'provinces') scheduleProvinceLayerBuild()
    else if (overlay.value === 'territory') flushDisplayPaints()
  },
  { flush: 'post' }
)

watch(
  () => [
    selectedNationId.value,
    cellsPerProvinceTarget.value,
    props.map.seed,
    props.placeNamingStyle
  ],
  () => {
    layerStore.invalidateLayer('provinces')
    if (overlay.value === 'provinces') scheduleProvinceLayerBuild()
  },
  { flush: 'post' }
)

watch(
  () => [...selectedHexIds.value],
  () => {
    if (overlay.value === 'terrain' && territoryPaintMode.value === 'select') {
      flushDisplayPaints()
    }
  },
  { flush: 'post' }
)

watch(
  () => {
    ensureMapHexGrid(props.map)
    const g = props.map.hexGrid!
    return `${g.cols}:${g.rows}:${g.cells.length}:${g.layoutVersion ?? 0}`
  },
  () => {
    pruneLayerCacheToGrid()
    layerStore.invalidateAllLayers()
    warmMapLayers()
    flushDisplayPaints()
  },
  { flush: 'post' }
)

function onCellsPerProvinceTargetChange(v: number): void {
  props.map.cellsPerProvinceTarget = v
  markDirty()
}

onMounted(() => {
  syncMapAspectFromDoc()
  ensureMapHexGrid(props.map)
  if (props.map.nations) {
    props.map.nations.forEach((n, i) => {
      if (!n.color) n.color = nationColor(i)
    })
  }
  if (hasPaintedTerritory(props.map)) {
    overlay.value = 'territory'
  }
  const cached = props.layerCache ?? props.map.layerCache
  layerStore.hydrateFromDocument(cached)
  if (cached) lastLayerCacheJson = JSON.stringify(cached)
  ensureHexClimateForEditor()
  pruneLayerCacheToGrid()
  layerStore.setActiveLayer(overlay.value)
  warmMapLayers()
  flushDisplayPaints()
  fitMapFrame()
  void nextTick(() => fitMapFrame())

  if (typeof ResizeObserver !== 'undefined' && mapRef.value) {
    stageResizeObserver = new ResizeObserver(() => {
      fitMapFrame()
      if (Math.abs(zoom.value - 1) > 0.02 || panX.value !== 0 || panY.value !== 0) {
        resetViewport()
      }
    })
    stageResizeObserver.observe(mapRef.value)
  }
})

onUnmounted(() => {
  stageResizeObserver?.disconnect()
  stageResizeObserver = null
})

watch(
  () => [props.map.renderWidth, props.map.renderHeight] as const,
  () => {
    syncMapAspectFromDoc()
    fitMapFrame()
  }
)

watch(mapDisplayUrl, () => {
  syncMapAspectFromDoc()
  void nextTick(() => fitMapFrame())
})

watch(
  () => props.map.terrainCells,
  () => {
    if (!hexClimateAlreadySynced(props.map)) syncHexClimateFromTerrain(props.map)
    for (const layer of ['temperature', 'humidity', 'monsoon', 'development'] as const) {
      layerStore.invalidateLayer(layer)
    }
    warmMapLayers()
  },
  { deep: true }
)

function markDirty(territoryChanged = false): void {
  if (territoryChanged) {
    territoryRevision.value++
    rebuildTerritoryDependentOverlays()
  }
  emit('dirty')
}

function syncTerritoryAfterPaint(nationIds?: string[]): void {
  applyTerritoryRecognition(props.map, nations.value, nationIds)
  territoryRevision.value++
  rebuildTerritoryDependentOverlays()
  markDirty()
}

function refreshTerritoryOverlayLive(): void {
  if (overlay.value !== 'territory') return
  hexPaints.value = buildTerritoryViewPaints(
    hexCells.value,
    layout.value,
    nations.value,
    selectedHexIds.value
  )
}

function scheduleTerritoryLiveRefresh(): void {
  if (overlay.value !== 'territory') return
  if (territoryLiveRaf) return
  territoryLiveRaf = requestAnimationFrame(() => {
    territoryLiveRaf = 0
    refreshTerritoryOverlayLive()
  })
}

function activePaintNation(): WorldNation | undefined {
  const id = selectedNationId.value
  return id ? nations.value.find((n) => n.id === id) : undefined
}

function clientToPercent(e: MouseEvent | PointerEvent): { x: number; y: number } {
  const frame = mapFrameRef.value
  if (!frame) return { x: 0, y: 0 }
  return pointerToMapPercent(e.clientX, e.clientY, frame.getBoundingClientRect())
}

function clampMapPct(n: number): number {
  return Math.max(0, Math.min(100, n))
}

/** 拖动城市时吸附到指针下六边形格心，并同步 terrain / 归属格 */
function locationPatchAtPointer(
  loc: WorldLocation,
  e: MouseEvent | PointerEvent
): Partial<WorldLocation> {
  const p = clientToPercent(e)
  const x = clampMapPct(p.x)
  const y = clampMapPct(p.y)
  const axial = percentToHex(x, y, layout.value)
  if (!axial) return { x, y }
  const cell = hexCellIndex.value.get(`${axial.q},${axial.r}`)
  if (!cell) return { x, y }
  const center = hexCellCenter(cell, layout.value)
  return {
    x: center.x,
    y: center.y,
    terrain: cell.terrain,
    nationId: cell.nationId ?? loc.nationId,
    regionId: cell.regionId ?? loc.regionId
  }
}

function selectHex(cell: MapHexCell, additive: boolean): void {
  if (!additive) selectedHexIds.value = new Set()
  const next = new Set(selectedHexIds.value)
  if (next.has(cell.id) && additive) next.delete(cell.id)
  else next.add(cell.id)
  selectedHexIds.value = next
  markDirty()
}

function startBoxSelection(e: PointerEvent): void {
  const p = clientToPercent(e)
  isDraggingBox.value = true
  boxSelect.value = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
  paintPointerId = e.pointerId
  try {
    mapRef.value?.setPointerCapture(e.pointerId)
  } catch {
    paintPointerId = null
  }
}

function onHexClick(cell: MapHexCell, e: MouseEvent): void {
  if (territoryPaintMode.value !== 'select') return
  selectHex(cell, e.shiftKey || e.ctrlKey)
}

function isBoxPaintMode(): boolean {
  return territoryPaintMode.value === 'box-fill' || territoryPaintMode.value === 'box-erase'
}

function handleMapSelectClick(e: MouseEvent): void {
  const cell = cellAtPointer(e)
  if (cell) {
    onHexClick(cell, e)
    return
  }
  const hitLoc = pickLocationAtPointer(e)
  if (hitLoc) {
    selectedLocationId.value = hitLoc.id
    return
  }
  isDraggingBox.value = true
  boxSelect.value = {
    x0: clientToPercent(e).x,
    y0: clientToPercent(e).y,
    x1: clientToPercent(e).x,
    y1: clientToPercent(e).y
  }
  if (!e.shiftKey) selectedHexIds.value = new Set()
}

function onMapPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  const cell = cellAtPointer(e)

  if (territoryPaintMode.value === 'fill') {
    if (cell) fillTerritoryAt(cell)
    return
  }

  if (isBoxPaintMode()) {
    startBoxSelection(e)
    return
  }

  if (territoryPaintMode.value === 'paint' || territoryPaintMode.value === 'erase') {
    if (!cell) return
    isTerritoryPainting.value = true
    lastPaintHexId.value = null
    paintPointerId = e.pointerId
    try {
      mapRef.value?.setPointerCapture(e.pointerId)
    } catch {
      paintPointerId = null
    }
    strokePaintCell(cell)
    return
  }

  if (canPan.value && territoryPaintMode.value === 'select') {
    pendingPanClick = e
    panPointerId = e.pointerId
    panStartX = e.clientX
    panStartY = e.clientY
    panOriginX = panX.value
    panOriginY = panY.value
    mapRef.value?.setPointerCapture(e.pointerId)
    return
  }

  handleMapSelectClick(e)
}

function onMapPointerMove(e: PointerEvent): void {
  if (pendingPanClick && !isPanning.value) {
    const dx = e.clientX - panStartX
    const dy = e.clientY - panStartY
    if (Math.hypot(dx, dy) >= PAN_DRAG_PX) {
      pendingPanClick = null
      isPanning.value = true
    }
  }
  if (isPanning.value) {
    panX.value = panOriginX + (e.clientX - panStartX)
    panY.value = panOriginY + (e.clientY - panStartY)
    return
  }
  if (draggingLocationId.value) {
    const loc = props.locations.find((l) => l.id === draggingLocationId.value)
    if (loc) Object.assign(loc, locationPatchAtPointer(loc, e))
    return
  }
  if (isTerritoryPainting.value) {
    const cell = cellAtPointer(e)
    if (cell) strokePaintCell(cell)
    return
  }
  if (!isDraggingBox.value || !boxSelect.value) return
  const p = clientToPercent(e)
  boxSelect.value = { ...boxSelect.value, x1: p.x, y1: p.y }
}

function finishBoxDrag(): void {
  if (!isDraggingBox.value || !boxSelect.value) return
  const b = boxSelect.value
  const cells = hexesInRect(props.map, b.x0, b.y0, b.x1, b.y1)

  if (territoryPaintMode.value === 'box-fill') {
    const nation = activePaintNation()
    if (nation) {
      for (const c of cells) paintNationOnCell(c)
      syncTerritoryAfterPaint([nation.id])
    }
  } else if (territoryPaintMode.value === 'box-erase') {
    const touched = new Set<string>()
    for (const c of cells) {
      if (c.nationId) touched.add(c.nationId)
      eraseNationOnCell(c)
    }
    if (touched.size) syncTerritoryAfterPaint([...touched])
    else markDirty(true)
  } else {
    const next = new Set(selectedHexIds.value)
    for (const c of cells) next.add(c.id)
    selectedHexIds.value = next
    markDirty()
  }

  isDraggingBox.value = false
  boxSelect.value = null
}

function finishLocationDrag(e?: PointerEvent): void {
  const id = draggingLocationId.value
  if (!id) return
  draggingLocationId.value = null
  if (e) {
    try {
      mapRef.value?.releasePointerCapture(e.pointerId)
    } catch {
      /* 未捕获时忽略 */
    }
  }
  const loc = props.locations.find((l) => l.id === id)
  if (loc) patchLocation(id, e ? locationPatchAtPointer(loc, e) : {})
}

function finishPan(e?: PointerEvent): void {
  if (!isPanning.value && !pendingPanClick) return
  isPanning.value = false
  pendingPanClick = null
  if (e && panPointerId != null) {
    try {
      mapRef.value?.releasePointerCapture(panPointerId)
    } catch {
      /* 未捕获时忽略 */
    }
  }
  panPointerId = null
}

function onMapPointerUp(e?: PointerEvent): void {
  if (isPanning.value) {
    finishPan(e)
    return
  }
  if (pendingPanClick) {
    handleMapSelectClick(pendingPanClick)
    finishPan(e)
    return
  }
  if (draggingLocationId.value) {
    finishLocationDrag(e)
    return
  }
  if (isTerritoryPainting.value) {
    isTerritoryPainting.value = false
    lastPaintHexId.value = null
    if (e && paintPointerId != null) {
      try {
        mapRef.value?.releasePointerCapture(paintPointerId)
      } catch {
        /* 未捕获时忽略 */
      }
    }
    paintPointerId = null
    if (paintNeedsSync.value) {
      paintNeedsSync.value = false
      const nation = activePaintNation()
      if (nation) syncTerritoryAfterPaint([nation.id])
      else if (territoryPaintMode.value === 'erase') syncTerritoryAfterPaint()
      else markDirty(true)
    }
    return
  }
  if (isDraggingBox.value) {
    if (e && paintPointerId != null) {
      try {
        mapRef.value?.releasePointerCapture(paintPointerId)
      } catch {
        /* 未捕获时忽略 */
      }
    }
    paintPointerId = null
    finishBoxDrag()
    return
  }
  finishBoxDrag()
}

function patchHexes(partial: Partial<MapHexCell>): void {
  const touchedNations = new Set<string>()
  for (const id of selectedHexIds.value) {
    const cell = hexCells.value.find((c) => c.id === id)
    if (!cell) continue
    if (cell.nationId) touchedNations.add(cell.nationId)
    if (partial.nationId) {
      const nation = nations.value.find((n) => n.id === partial.nationId)
      if (nation && !canPaintCellForNation(cell, nation)) continue
    }
    Object.assign(cell, partial)
    if (cell.nationId) touchedNations.add(cell.nationId)
  }
  if ('nationId' in partial && touchedNations.size) {
    syncTerritoryAfterPaint([...touchedNations])
  } else {
    markDirty('nationId' in partial)
  }
}

function patchNation(id: string, partial: Partial<WorldNation>): void {
  const n = nations.value.find((x) => x.id === id)
  if (!n || !props.map.nations) return
  Object.assign(n, partial)
  if ('allowOceanTerritory' in partial) syncTerritoryAfterPaint([id])
  else markDirty()
}

function patchLocation(id: string, partial: Partial<WorldLocation>): void {
  const loc = props.locations.find((l) => l.id === id)
  if (!loc) return
  Object.assign(loc, partial)
  const snapped = snapLocationToLand(loc, props.map)
  Object.assign(loc, snapped)
  markDirty()
}

function addNation(): void {
  if (!props.map.nations) props.map.nations = []
  const id = `nation-${String(props.map.nations.length + 1).padStart(3, '0')}`
  props.map.nations.push({
    id,
    name: `国家${props.map.nations.length + 1}`,
    regionIds: [],
    government: '',
    culture: '',
    description: '',
    color: nationColor(props.map.nations.length),
    authorSettings: ''
  })
  selectedNationId.value = id
  markDirty()
}

function flushMapLayerDisplay(territoryChanged = true): void {
  layerStore.invalidateAllLayers()
  pruneLayerCacheToGrid()
  syncLayerGeometry()
  flushDisplayPaints()
  markDirty(territoryChanged)
}

async function resolveMapImageForAlign(): Promise<HTMLImageElement | null> {
  if (mapImgEl.value?.naturalWidth) return mapImgEl.value
  const url = mapDisplayUrl.value
  if (!url) return null
  try {
    const img = await loadMapImage(url)
    mapImgEl.value = img
    return img
  } catch {
    return null
  }
}

async function alignTerritoryToLandTerrain(): Promise<void> {
  if (mapLayerAligning.value) return
  mapLayerAligning.value = true
  try {
    const img = await resolveMapImageForAlign()
    if (!img) return
    alignTerritoryWithTerrainMap(props.map, nations.value, img)
    const locResult = reconcileMapLayers(props.map, props.locations)
    if (locResult.locationsFixed > 0) {
      for (let i = 0; i < locResult.locations.length; i++) {
        Object.assign(props.locations[i], locResult.locations[i])
      }
    }
    flushMapLayerDisplay(true)
  } finally {
    mapLayerAligning.value = false
  }
}

async function reconcileAllLocationCoords(): Promise<void> {
  await alignTerritoryToLandTerrain()
}

const locationCoordAudit = computed(() => auditLocationCoords(props.map, props.locations))
const hexCenterDrift = computed(() => countHexCenterDrift(props.map))

function addLocation(): void {
  const id = `loc-${Date.now()}`
  const center = selectedHexes.value[0] ?? hexCells.value.find((c) => c.terrain !== 'ocean')
  const draft: WorldLocation = {
    id,
    name: '新城市',
    type: 'city',
    x: center?.x ?? 50,
    y: center?.y ?? 50,
    terrain: center?.terrain ?? 'plain',
    climate: '温带',
    description: '',
    development: 30,
    authorSettings: '',
    nationId: center?.nationId,
    regionId: center?.regionId
  }
  props.locations.push(snapLocationToLand(draft, props.map))
  selectedLocationId.value = id
  markDirty()
}

function onLocationPointerDown(loc: WorldLocation, e: PointerEvent): void {
  if (e.button !== 0) return
  e.stopPropagation()
  e.preventDefault()
  selectedLocationId.value = loc.id
  draggingLocationId.value = loc.id
  mapRef.value?.setPointerCapture(e.pointerId)
}

const boxRect = computed(() => {
  if (!boxSelect.value) return null
  const b = boxSelect.value
  return {
    x: Math.min(b.x0, b.x1),
    y: Math.min(b.y0, b.y1),
    w: Math.abs(b.x1 - b.x0),
    h: Math.abs(b.y1 - b.y0)
  }
})

const mapTip = computed(() => {
  if (hexCenterDrift.value > 0) {
    return `检测到 ${hexCenterDrift.value} 个 hex 格心坐标漂移 · 侧栏点击「校准地图图层」`
  }
  const audit = locationCoordAudit.value
  if (audit.onOceanCount > 0 && audit.onOceanRatio >= 0.25) {
    return `检测到 ${audit.onOceanCount}/${audit.total} 个城市坐标在海上 · 侧栏点击「校准地图图层」`
  }
  if (overlay.value === 'provinces') {
    if (provinceOverlayLoading.value) {
      return selectedNationId.value
        ? '正在计算该国行省…'
        : '正在计算行省（选中国家可更快）…'
    }
    const n = provincePreviewCount.value
    const scope = selectedNationId.value ? '当前国家' : '全部国家'
    return `行省预览 · ${scope} · ${n} 省 · 目标 ${cellsPerProvinceTarget.value} 格/省`
  }
  if (overlay.value === 'territory') {
    const painted =
      hexCells.value.filter((c) => c.nationId && c.terrain !== 'ocean').length
    if (!painted) {
      return '国家领土 · 请先用下方「快速领土绘画」涂抹归属，或选格后批量归入国家'
    }
    return `国家领土 · 已归属 ${painted} 陆格 · 单击选格 · 可切换画笔涂抹`
  }
  switch (territoryPaintMode.value) {
    case 'paint':
      return selectedNationId.value
        ? '画笔：按住拖动涂抹 · 侧栏可调笔刷大小'
        : '请先在侧栏选择国家'
    case 'erase':
      return '擦除：按住拖动 · 侧栏可调笔刷大小'
    case 'fill':
      return selectedNationId.value
        ? '填充：单击同地形连通区域'
        : '请先在侧栏选择国家'
    case 'box-fill':
      return selectedNationId.value
        ? '框选填：拖拽矩形批量归入当前国家'
        : '请先在侧栏选择国家'
    case 'box-erase':
      return '框选擦：拖拽矩形批量清除归属'
    default:
      return canPan.value
        ? '单击选格 · 放大后按住拖动平移 · 点击/拖动城市圆点'
        : '单击选格 · 框选 · Ctrl+滚轮放大后可拖动平移 · 点击/拖动城市圆点'
  }
})

const mapStageClass = computed(() => ({
  'paint-brush': territoryPaintMode.value === 'paint',
  'paint-erase': territoryPaintMode.value === 'erase',
  'paint-fill': territoryPaintMode.value === 'fill',
  'paint-box': isBoxPaintMode(),
  'drag-location': !!draggingLocationId.value,
  'map-panning': isPanning.value,
  'map-pannable': canPan.value && territoryPaintMode.value === 'select',
  'hex-hit-map': territoryPaintMode.value !== 'select'
}))

function cellAtPointer(e: MouseEvent): MapHexCell | null {
  const p = clientToPercent(e)
  const axial = percentToHex(p.x, p.y, layout.value)
  if (!axial) return null
  return hexCellIndex.value.get(`${axial.q},${axial.r}`) ?? null
}

function paintNationOnCell(cell: MapHexCell): void {
  const nation = activePaintNation()
  if (!nation) return
  if (!canPaintCellForNation(cell, nation)) return
  cell.nationId = nation.id
}

function eraseNationOnCell(cell: MapHexCell): void {
  cell.nationId = undefined
}

function strokePaintCell(cell: MapHexCell): void {
  if (cell.id === lastPaintHexId.value) return
  lastPaintHexId.value = cell.id
  const targets = hexesInBrush(props.map, cell, brushRadiusLive)
  for (const target of targets) {
    if (territoryPaintMode.value === 'paint') paintNationOnCell(target)
    else if (territoryPaintMode.value === 'erase') eraseNationOnCell(target)
  }
  paintNeedsSync.value = true
  scheduleTerritoryLiveRefresh()
}

function fillTerritoryAt(cell: MapHexCell): void {
  const nation = activePaintNation()
  if (!nation) return
  const terrain = cell.terrain
  const cells = floodFillHexCells(props.map, cell, (c) => c.terrain === terrain)
  for (const c of cells) {
    if (canPaintCellForNation(c, nation)) c.nationId = nation.id
  }
  syncTerritoryAfterPaint([nation.id])
}

function applyNationToSelection(): void {
  const nation = activePaintNation()
  if (!nation) return
  patchHexes({ nationId: nation.id })
}

function clearNationFromSelection(): void {
  patchHexes({ nationId: undefined })
}

function onBrushRadiusChange(v: number): void {
  brushRadiusLive = v
}
</script>

<template>
  <div class="map-editor">
    <div class="map-main">
    <div
      ref="mapRef"
      class="map-stage"
      :class="mapStageClass"
      @wheel="onWheel"
      @pointerdown="onMapPointerDown"
      @pointermove="onMapPointerMove"
      @pointerup="onMapPointerUp"
      @pointerleave="onMapPointerUp"
    >
      <div ref="mapFrameRef" class="map-frame" :style="mapFrameStyle">
        <div ref="mapViewportRef" class="map-viewport" :style="viewportStyle">
      <img
        v-if="mapDisplayUrl"
        class="map-img"
        :src="mapDisplayUrl"
        alt="世界地图"
        draggable="false"
        @load="onMapImageLoad"
      />
      <p v-else-if="imageFilePath || imageUrl" class="map-img-placeholder">
        {{ mapImageError ?? '贴图加载中…' }}
      </p>
      <svg class="hex-layer hex-layer-passive" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon
          v-for="h in hexPaints"
          :key="h.id"
          :points="h.points"
          :fill="h.fill"
          :stroke="h.stroke"
          :stroke-width="h.strokeWidth"
          vector-effect="non-scaling-stroke"
          class="hex"
        />
        <rect
          v-if="boxRect"
          :x="boxRect.x"
          :y="boxRect.y"
          :width="boxRect.w"
          :height="boxRect.h"
          class="box-sel"
        />
      </svg>
      <svg class="marker-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
        <circle
          v-for="loc in mapMarkers"
          :key="loc.id"
          :cx="loc.x"
          :cy="loc.y"
          :r="locationMarkerRadius(loc)"
          class="marker"
          :class="[locationMarkerClass(loc), { active: loc.id === selectedLocationId, dragging: loc.id === draggingLocationId }]"
          @pointerdown.stop="onLocationPointerDown(loc, $event)"
        />
        <text
          v-for="loc in labeledMarkers"
          :key="`lb-${loc.id}`"
          :x="loc.x"
          :y="loc.y - locationMarkerRadius(loc) - 0.35"
          class="marker-label"
          text-anchor="middle"
          pointer-events="none"
        >
          {{ placeNameForMapLabel(loc.name) }}
        </text>
      </svg>
        </div>
      </div>
      <p class="map-tip">
        {{ mapTip }}
        <span v-if="zoomLabel" class="zoom-tag"> · {{ zoomLabel }}</span>
        <span class="zoom-hint"> · Ctrl+滚轮缩放{{ canPan ? ' · 拖动平移' : '' }}</span>
      </p>
    </div>
    <WorldLocationDetail :location="selectedLocation" :nations="nations" :map="map" />
    </div>

    <MapEditorSidebar
      :map="map"
      :locations="locations"
      :nations="nations"
      :overlay="overlay"
      :nation-list-mode="nationListMode"
      :territory-paint-mode="territoryPaintMode"
      :brush-radius="brushRadius"
      :selected-hexes="selectedHexes"
      :selected-nation-id="selectedNationId"
      :selected-location-id="selectedLocationId"
      :cells-per-province-target="cellsPerProvinceTarget"
      :hex-center-drift="hexCenterDrift"
      @update:overlay="onOverlayChange"
      @update:cells-per-province-target="onCellsPerProvinceTargetChange"
      @update:territory-paint-mode="territoryPaintMode = $event"
      @update:brush-radius="onBrushRadiusChange"
      @update:selected-nation-id="selectedNationId = $event"
      @update:selected-location-id="selectedLocationId = $event"
      @patch-hexes="patchHexes"
      @patch-nation="patchNation"
      @patch-location="patchLocation"
      @add-nation="addNation"
      @add-location="addLocation"
      @reconcile-locations="reconcileAllLocationCoords"
      @align-territory-land="alignTerritoryToLandTerrain"
      @apply-nation-to-selection="applyNationToSelection"
      @clear-nation-from-selection="clearNationFromSelection"
    />
  </div>
</template>

<style scoped>
.map-editor {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
  gap: 0;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  overflow: hidden;
  background: #0a1420;
}
.map-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.map-stage {
  position: relative;
  width: 100%;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 120px;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: crosshair;
  overflow: hidden;
}
.map-frame {
  position: relative;
  flex-shrink: 0;
}
.map-viewport {
  position: absolute;
  inset: 0;
  transform-origin: center center;
}
.map-stage.paint-brush {
  cursor: cell;
}
.map-stage.paint-erase {
  cursor: not-allowed;
}
.map-stage.paint-fill {
  cursor: copy;
}
.map-stage.paint-box {
  cursor: crosshair;
}
.map-stage.drag-location,
.map-stage.map-panning {
  cursor: grabbing;
}
.map-stage.map-pannable:not(.map-panning):not(.drag-location) {
  cursor: grab;
}
.map-img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}
.map-img-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  font-size: 12px;
  color: var(--nc-text-muted);
  pointer-events: none;
}
.hex-layer,
.marker-layer {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.hex-layer {
  z-index: 1;
}
.hex-layer-passive {
  pointer-events: none;
}
.marker-layer {
  z-index: 2;
}
.hex {
  pointer-events: none;
}
.hex:hover {
  stroke: rgba(232, 197, 71, 0.6);
}
.box-sel {
  fill: rgba(110, 181, 255, 0.12);
  stroke: #6eb5ff;
  stroke-width: 0.2;
  pointer-events: none;
}
.marker {
  stroke: #1a1a1a;
  stroke-width: 0.08;
  pointer-events: all;
  cursor: pointer;
}
.marker-tier-capital {
  fill: #e85a9a;
  stroke: #fff;
  stroke-width: 0.1;
}
.marker-tier-provincial {
  fill: #5eb8ff;
  stroke: #e8f4ff;
  stroke-width: 0.09;
}
.marker-tier-prefecture {
  fill: #e8a045;
  stroke: #3d2810;
  stroke-width: 0.07;
}
.marker-tier-county {
  fill: #8fd4a0;
}
.marker-tier-village {
  fill: #a8b0b8;
}
.marker-tier-fortress {
  fill: #c96a6a;
}
.marker-tier-landmark {
  fill: #b88cff;
}
.marker-tier-other {
  fill: #c8b890;
}
.marker-label {
  font-size: 1.85px;
  fill: #eef2f7;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.8);
  stroke-width: 0.22;
}
.marker.active {
  fill: #fff;
  stroke: #e8c547;
  stroke-width: 0.14;
}
.marker.dragging {
  stroke: #fff;
  stroke-width: 0.16;
  filter: drop-shadow(0 0 0.25px rgba(255, 255, 255, 0.9));
}
.zoom-hint,
.zoom-tag {
  color: rgba(255, 255, 255, 0.45);
}
.map-tip {
  position: absolute;
  bottom: 4px;
  left: 8px;
  margin: 0;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
}
</style>
