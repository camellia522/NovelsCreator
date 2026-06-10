<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import type { WorldLocation, WorldMapDocument } from '@/types/project'
import { createHexLayout, ensureMapHexGrid } from '@/utils/world-hex-grid'
import { buildTerritoryViewPaints } from '@/utils/world-map-territory-view'
import { LAKE_FILL, RIVER_STROKE, RIVER_STROKE_MAIN, sanitizeRiverPoints } from '@/utils/world-map-rivers'
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
import { mapDisplayDimensions } from '@/utils/world-map-aspect'

const riverStroke = RIVER_STROKE
const riverStrokeMain = RIVER_STROKE_MAIN
const lakeFill = LAKE_FILL

const props = withDefaults(
  defineProps<{
    map: WorldMapDocument | null
    locations?: WorldLocation[]
    selectedLocationId?: string | null
    imageUrl?: string | null
    imageFilePath?: string | null
    interactive?: boolean
    /** 界面角标「北极/南极」，非地图内容 */
    showPoleLabels?: boolean
    /** 叠加 hex 国家领土（只读） */
    showTerritory?: boolean
  }>(),
  {
    locations: () => [],
    selectedLocationId: null,
    imageUrl: null,
    imageFilePath: null,
    interactive: false,
    showPoleLabels: false,
    showTerritory: true
  }
)

const emit = defineEmits<{ select: [locationId: string] }>()

const wrapRef = ref<HTMLElement | null>(null)
const viewportRef = ref<HTMLElement | null>(null)
const { zoom, canPan, onWheel, viewportStyle, zoomLabel, pointerToMapPercent } = useMapViewport()
const { displayUrl: displayImageUrl } = useDisplayMapUrl(
  toRef(props, 'imageUrl'),
  toRef(props, 'imageFilePath')
)

const aspectStyle = computed(() => {
  const { w, h } = mapDisplayDimensions()
  return { aspectRatio: `${w} / ${h}` }
})

const mapMarkers = computed(() =>
  mapMarkersForDisplay(props.locations, props.selectedLocationId, zoom.value)
)

const labeledMarkers = computed(() =>
  mapMarkers.value.filter((l) =>
    isMarkerLabelVisibleAtZoom(l, zoom.value, props.selectedLocationId)
  )
)

const territoryPaints = computed(() => {
  if (!props.showTerritory || !props.map?.nations?.length) return []
  ensureMapHexGrid(props.map)
  const g = props.map.hexGrid!
  if (!g.cells.some((c) => c.nationId)) return []
  const hexLayout = createHexLayout(g.cols, g.rows)
  return buildTerritoryViewPaints(g.cells, hexLayout, props.map.nations)
})

function onClick(e: MouseEvent): void {
  if (!props.interactive || !wrapRef.value || !props.locations.length) return
  const rect = wrapRef.value.getBoundingClientRect()
  const p = pointerToMapPercent(e.clientX, e.clientY, rect)
  const xPct = p.x
  const yPct = p.y
  let best: WorldLocation | null = null
  let bestD = Infinity
  for (const loc of props.locations) {
    const d = Math.hypot(loc.x - xPct, loc.y - yPct)
    const pick = (locationPickRadiusPx(loc, rect.width) / rect.width) * 100
    if (d < pick && d < bestD) {
      bestD = d
      best = loc
    }
  }
  if (best) emit('select', best.id)
}

function lakePath(polygon: [number, number][]): string {
  if (polygon.length < 3) return ''
  const [x0, y0] = polygon[0]
  const parts = [`M ${x0} ${y0}`]
  for (let i = 1; i < polygon.length; i++) {
    const [x, y] = polygon[i]
    parts.push(`L ${x} ${y}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

function riverPath(points: [number, number][]): string {
  const pts = sanitizeRiverPoints(points)
  if (pts.length < 2) return ''
  const parts: string[] = []
  const [x0, y0] = pts[0]
  parts.push(`M ${x0} ${y0}`)
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i]
    const [xp] = pts[i - 1]
    if (Math.abs(x - xp) > 42) parts.push(`M ${x} ${y}`)
    else parts.push(`L ${x} ${y}`)
  }
  return parts.join(' ')
}
</script>

<template>
  <div ref="wrapRef" class="flat-wrap" :style="aspectStyle" @wheel="onWheel" @click="onClick">
    <div ref="viewportRef" class="flat-viewport" :style="viewportStyle">
    <img
      v-if="displayImageUrl"
      class="map-img"
      :src="displayImageUrl"
      alt="世界地图"
      draggable="false"
    />
    <div v-else class="empty">无贴图</div>

    <svg v-if="map" class="overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon
        v-for="h in territoryPaints"
        :key="`t-${h.id}`"
        :points="h.points"
        :fill="h.fill"
        :stroke="h.stroke"
        :stroke-width="h.strokeWidth"
        vector-effect="non-scaling-stroke"
        class="territory-hex"
      />
      <path
        v-for="lake in (map.lakes ?? []).filter((l) => (l.polygon?.length ?? 0) >= 3)"
        :key="lake.id"
        :d="lakePath(lake.polygon!)"
        class="lake"
      />
      <circle
        v-for="lake in (map.lakes ?? []).filter((l) => (l.polygon?.length ?? 0) < 3)"
        :key="`c-${lake.id}`"
        :cx="lake.cx"
        :cy="lake.cy"
        :r="lake.radius"
        class="lake"
      />
      <path
        v-for="r in map.rivers"
        :key="r.id"
        :d="riverPath(r.points)"
        class="river"
        :class="{ main: (r.order ?? 1) >= 3 }"
        fill="none"
        vector-effect="non-scaling-stroke"
      />
      <circle
        v-for="loc in mapMarkers"
        :key="loc.id"
        :cx="loc.x"
        :cy="loc.y"
        :r="locationMarkerRadius(loc)"
        class="marker"
        :class="[locationMarkerClass(loc), { selected: loc.id === selectedLocationId }]"
      />
      <text
        v-for="loc in labeledMarkers"
        :key="`lb-${loc.id}`"
        :x="loc.x"
        :y="loc.y - locationMarkerRadius(loc) - 0.35"
        class="label"
        text-anchor="middle"
      >
        {{ placeNameForMapLabel(loc.name) }}
      </text>
    </svg>
    </div>

    <span v-if="zoomLabel" class="zoom-badge">{{ zoomLabel }}</span>
    <span class="zoom-hint">Ctrl+滚轮缩放{{ canPan ? ' · 放大后可拖移' : '' }}</span>
    <span v-if="showPoleLabels" class="pole-tag north">北极</span>
    <span v-if="showPoleLabels" class="pole-tag south">南极</span>
    <span v-if="map?.renderWidth" class="badge">{{ map.renderWidth }}×{{ map.renderHeight }}</span>
  </div>
</template>

<style scoped>
.flat-wrap {
  position: relative;
  width: 100%;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  overflow: auto;
  background: #0a1420;
  cursor: default;
}
.flat-viewport {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.flat-wrap:has(.map-img) {
  cursor: crosshair;
}
.map-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.territory-hex {
  pointer-events: none;
}
.lake {
  fill: v-bind(lakeFill);
  stroke: none;
}
.river {
  stroke: v-bind(riverStroke);
  stroke-width: 0.4;
}
.river.main {
  stroke: v-bind(riverStrokeMain);
  stroke-width: 0.45;
}
.marker {
  stroke: rgba(0, 0, 0, 0.65);
  stroke-width: 0.15;
}
.marker-tier-capital {
  fill: #e85a9a;
  stroke: #fff;
  stroke-width: 0.18;
}
.marker-tier-provincial {
  fill: #5eb8ff;
  stroke: #e8f4ff;
  stroke-width: 0.12;
}
.marker-tier-prefecture {
  fill: #e8a045;
  stroke: #3d2810;
  stroke-width: 0.1;
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
.zoom-hint {
  position: absolute;
  bottom: 4px;
  right: 8px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
  pointer-events: none;
}
.zoom-badge {
  position: absolute;
  bottom: 4px;
  right: 108px;
  font-size: 10px;
  color: #e8c547;
  pointer-events: none;
}
.marker.selected {
  stroke: #fff;
  stroke-width: 0.25;
}
.label {
  font-size: 1.8px;
  fill: #eef2f7;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.75);
  stroke-width: 0.25;
}
.pole-tag {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: #c8d8f0;
  padding: 2px 8px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 4px;
  pointer-events: none;
  z-index: 2;
}
.pole-tag.north {
  top: 4px;
}
.pole-tag.south {
  bottom: 4px;
}
.badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  color: var(--nc-text-muted);
  background: rgba(0, 0, 0, 0.45);
  padding: 2px 6px;
  border-radius: 4px;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
</style>
