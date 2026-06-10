<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MapHexCell, WorldLocation, WorldMapDocument, WorldNation } from '@/types/project'
import {
  BRUSH_RADIUS_MAX,
  BRUSH_RADIUS_MIN,
  CELLS_PER_PROVINCE_MAX,
  CELLS_PER_PROVINCE_MIN,
  brushSizeLabel,
  type MapOverlayMode,
  type NationListMode,
  type TerritoryPaintMode
} from '@/components/world/map-editor-types'
import { nationColor } from '@/utils/world-map-territory'
import { estimateProvinceCount, resolveLocationDescription } from '@/utils/world-admin-divisions'
import { ensureMapHexGrid } from '@/utils/world-hex-grid'
import { locationTierLabel } from '@/utils/world-location-marker'
import { auditLocationCoords } from '@/utils/world-location-coords'

const props = defineProps<{
  map: WorldMapDocument
  locations: WorldLocation[]
  nations: WorldNation[]
  overlay: MapOverlayMode
  territoryPaintMode: TerritoryPaintMode
  brushRadius: number
  nationListMode?: NationListMode
  selectedHexes: MapHexCell[]
  selectedNationId: string | null
  selectedLocationId: string | null
  cellsPerProvinceTarget: number
  hexCenterDrift?: number
}>()

const emit = defineEmits<{
  'update:overlay': [MapOverlayMode]
  'update:territoryPaintMode': [TerritoryPaintMode]
  'update:brushRadius': [number]
  'update:cellsPerProvinceTarget': [number]
  'update:selectedNationId': [string | null]
  'update:selectedLocationId': [string | null]
  'patch-hexes': [partial: Partial<MapHexCell>]
  'patch-nation': [id: string, partial: Partial<WorldNation>]
  'patch-location': [id: string, partial: Partial<WorldLocation>]
  'add-nation': []
  'add-location': []
  'reconcile-locations': []
  'align-territory-land': []
  'apply-nation-to-selection': []
  'clear-nation-from-selection': []
}>()

const overlayOptions: { id: MapOverlayMode; label: string }[] = [
  { id: 'terrain', label: '地势' },
  { id: 'temperature', label: '温度' },
  { id: 'humidity', label: '湿度' },
  { id: 'monsoon', label: '季风带' },
  { id: 'territory', label: '国家领土' },
  { id: 'provinces', label: '行省' },
  { id: 'development', label: '发展程度' }
]

const paintModeOptions: { id: TerritoryPaintMode; label: string; title: string }[] = [
  { id: 'select', label: '选格', title: '单击/框选，侧栏批量设归属' },
  { id: 'paint', label: '画笔', title: '按住拖动涂抹当前国家' },
  { id: 'erase', label: '擦除', title: '按住拖动清除归属' },
  { id: 'fill', label: '填充', title: '单击填充同地形连通区域' },
  { id: 'box-fill', label: '框选填', title: '拖拽矩形框，批量归入当前国家' },
  { id: 'box-erase', label: '框选擦', title: '拖拽矩形框，批量清除归属' }
]

function setPaintMode(mode: TerritoryPaintMode): void {
  emit('update:territoryPaintMode', mode)
  if (mode !== 'select') emit('update:overlay', 'territory')
}

function pickNation(id: string): void {
  emit('update:selectedNationId', id)
  if (props.nationListMode === 'paint' && props.territoryPaintMode === 'select') {
    emit('update:territoryPaintMode', 'paint')
    emit('update:overlay', 'territory')
  }
}

const paintNeedsNation = computed(
  () =>
    (props.territoryPaintMode === 'paint' ||
      props.territoryPaintMode === 'fill' ||
      props.territoryPaintMode === 'box-fill') &&
    !props.selectedNationId
)

const usesBrush = computed(
  () => props.territoryPaintMode === 'paint' || props.territoryPaintMode === 'erase'
)

/** 滑块拖动时只更新侧栏，松手后再同步到地图，避免整张 hex 层重绘卡顿 */
const localBrushRadius = ref(props.brushRadius)
watch(
  () => props.brushRadius,
  (v) => {
    localBrushRadius.value = v
  }
)

function onBrushInput(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  localBrushRadius.value = v
  emit('update:brushRadius', v)
}

function onBrushChange(e: Event): void {
  onBrushInput(e)
}

const nationListMode = computed(() => props.nationListMode ?? 'paint')

const activePaintNation = computed(() =>
  props.nations.find((n) => n.id === props.selectedNationId)
)

const selectedNation = activePaintNation

const selectedLocation = computed(() =>
  props.locations.find((l) => l.id === props.selectedLocationId)
)

const locationSettingText = computed(() => {
  const loc = selectedLocation.value
  if (!loc) return ''
  const custom = loc.authorSettings?.trim()
  if (custom) return custom
  const nationName = props.nations.find((n) => n.id === loc.nationId)?.name
  return resolveLocationDescription(loc, props.map, nationName)
})

const selectionStats = computed(() => {
  const cells = props.selectedHexes
  if (!cells.length) return null
  let heat = 0
  let wet = 0
  let dev = 0
  let monsoon = 0
  for (const c of cells) {
    heat += c.heat ?? 0.5
    wet += c.wet ?? 0.5
    dev += c.development ?? 0
    if (c.monsoon) monsoon++
  }
  const n = cells.length
  return {
    count: n,
    heat: Math.round((heat / n) * 100),
    wet: Math.round((wet / n) * 100),
    dev: Math.round(dev / n),
    monsoonPct: Math.round((monsoon / n) * 100)
  }
})

const hexNotes = computed({
  get: () => props.selectedHexes[0]?.authorNotes ?? '',
  set: (v: string) => emit('patch-hexes', { authorNotes: v })
})

const hexDev = computed({
  get: () => props.selectedHexes[0]?.development ?? 0,
  set: (v: number) => emit('patch-hexes', { development: v })
})

const hexNationId = computed({
  get: () => props.selectedHexes[0]?.nationId ?? '',
  set: (v: string) => emit('patch-hexes', { nationId: v || undefined })
})

const localCellsPerProvince = ref(props.cellsPerProvinceTarget)
watch(
  () => props.cellsPerProvinceTarget,
  (v) => {
    localCellsPerProvince.value = v
  }
)

function onProvinceTargetInput(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  localCellsPerProvince.value = v
  emit('update:cellsPerProvinceTarget', v)
}

const selectedNationLandHexCount = computed(() => {
  if (!props.selectedNationId) return 0
  ensureMapHexGrid(props.map)
  return (
    props.map.hexGrid?.cells.filter(
      (c) => c.nationId === props.selectedNationId && c.terrain !== 'ocean'
    ).length ?? 0
  )
})

const selectedNationProvinceEstimate = computed(() =>
  estimateProvinceCount(selectedNationLandHexCount.value, localCellsPerProvince.value)
)

const totalNationLandHexCount = computed(() => {
  ensureMapHexGrid(props.map)
  return props.map.hexGrid?.cells.filter((c) => c.nationId && c.terrain !== 'ocean').length ?? 0
})

const locationCoordAudit = computed(() => auditLocationCoords(props.map, props.locations))
</script>

<template>
  <aside class="sidebar">
    <section class="block layer-block">
      <h4>图层</h4>
      <div class="chip-row">
        <button
          v-for="o in overlayOptions"
          :key="o.id"
          type="button"
          class="chip"
          :class="{ active: overlay === o.id }"
          @click="emit('update:overlay', o.id)"
        >
          {{ o.label }}
        </button>
      </div>
      <p class="hint">切换图层查看地势/气候/领土；选项固定在本栏顶部，下方内容可滚动。</p>
      <p v-if="(hexCenterDrift ?? 0) > 0" class="hint warn">
        {{ hexCenterDrift }} 个 hex 格心与布局不一致，领土层可能偏移
      </p>
      <button
        type="button"
        class="nc-btn nc-btn-sm reconcile-btn"
        @click="emit('align-territory-land')"
      >
        领土对齐陆地
      </button>
      <p class="hint">按地势 PNG 重判陆海，清除海上领土并校准城市坐标</p>
      <button
        v-if="(hexCenterDrift ?? 0) > 0 || locationCoordAudit.onOceanCount > 0"
        type="button"
        class="nc-btn nc-btn-sm reconcile-btn"
        @click="emit('reconcile-locations')"
      >
        一键校准全部
      </button>
    </section>

    <div class="sidebar-scroll">

    <section class="block">
      <h4>行省划分</h4>
      <label class="field brush-field">
        <span>目标格/省 · {{ localCellsPerProvince }} 格</span>
        <input
          type="range"
          :min="CELLS_PER_PROVINCE_MIN"
          :max="CELLS_PER_PROVINCE_MAX"
          :value="localCellsPerProvince"
          @input="onProvinceTargetInput"
        />
      </label>
      <p v-if="selectedNationId && selectedNationLandHexCount > 0" class="hint">
        <strong>{{ selectedNation?.name }}</strong> 约 {{ selectedNationLandHexCount }} 陆格 → 预估
        <strong>{{ selectedNationProvinceEstimate }}</strong> 行省（含地形拆分，生成时可能略多）
      </p>
      <p v-else-if="totalNationLandHexCount > 0" class="hint">
        已绘领土共 {{ totalNationLandHexCount }} 陆格；选中国家可查看该国预估行省数。
      </p>
      <p v-else class="hint">涂抹国家领土后，可调目标格/省；先选中国家再点「行省」图层可加快预览。</p>
      <button
        type="button"
        class="chip"
        :class="{ active: overlay === 'provinces' }"
        @click="emit('update:overlay', 'provinces')"
      >
        预览行省边界
      </button>
    </section>

    <section class="block territory-paint">
      <h4>快速领土绘画</h4>
      <div class="chip-row">
        <button
          v-for="o in paintModeOptions"
          :key="o.id"
          type="button"
          class="chip"
          :class="{ active: territoryPaintMode === o.id }"
          :title="o.title"
          @click="setPaintMode(o.id)"
        >
          {{ o.label }}
        </button>
      </div>
      <p v-if="paintNeedsNation" class="hint warn">请先在下方选择或新建国家</p>
      <p v-else-if="territoryPaintMode === 'paint' && activePaintNation" class="hint">
        画笔：<span class="paint-nation">{{ activePaintNation.name }}</span>
      </p>
      <p v-else-if="territoryPaintMode === 'fill' && activePaintNation" class="hint">
        填充：{{ activePaintNation.name }}（同地形连通区域）
      </p>
      <p v-else-if="territoryPaintMode === 'erase'" class="hint">擦除：拖动清除格子归属</p>
      <p v-else-if="territoryPaintMode === 'box-fill' && activePaintNation" class="hint">
        框选填：拖拽矩形 → {{ activePaintNation.name }}
      </p>
      <p v-else-if="territoryPaintMode === 'box-erase'" class="hint">框选擦：拖拽矩形批量清除归属</p>
      <label v-if="usesBrush" class="field brush-field">
        <span>笔刷大小 · {{ brushSizeLabel(localBrushRadius) }}</span>
        <input
          type="range"
          :min="BRUSH_RADIUS_MIN"
          :max="BRUSH_RADIUS_MAX"
          :value="localBrushRadius"
          @input="onBrushInput"
          @change="onBrushChange"
        />
      </label>
      <div v-if="selectedHexes.length && territoryPaintMode === 'select'" class="paint-actions">
        <button
          type="button"
          class="nc-btn nc-btn-sm"
          :disabled="!selectedNationId"
          @click="emit('apply-nation-to-selection')"
        >
          选区归入当前国
        </button>
        <button type="button" class="nc-btn nc-btn-sm" @click="emit('clear-nation-from-selection')">
          清空选区归属
        </button>
      </div>
    </section>

    <section v-if="selectionStats && territoryPaintMode === 'select'" class="block">
      <h4>选中 {{ selectionStats.count }} 格</h4>
      <ul class="stats">
        <li>均温 {{ selectionStats.heat }}%</li>
        <li>均湿 {{ selectionStats.wet }}%</li>
        <li>发展 {{ selectionStats.dev }}</li>
        <li>季风 {{ selectionStats.monsoonPct }}%</li>
      </ul>
      <label class="field">
        <span>发展程度</span>
        <input v-model.number="hexDev" type="range" min="0" max="100" />
        <span class="num">{{ hexDev }}</span>
      </label>
      <label class="field">
        <span>归属国家</span>
        <select v-model="hexNationId" class="nc-input">
          <option value="">— 无 —</option>
          <option v-for="n in nations" :key="n.id" :value="n.id">{{ n.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>地区设定</span>
        <textarea v-model="hexNotes" class="nc-input area" rows="3" placeholder="剧情、资源、势力…" />
      </label>
    </section>
    <p v-else-if="territoryPaintMode === 'select'" class="hint">点击或框选六边形进行编辑</p>
    <p v-else class="hint">在地图上拖动或单击使用当前绘画工具</p>

    <section class="block">
      <div class="head-row">
        <h4>国家（{{ nations.length }}）</h4>
        <button type="button" class="nc-btn nc-btn-sm" @click="emit('add-nation')">+</button>
      </div>
      <button
        v-for="(n, i) in nations"
        :key="n.id"
        type="button"
        class="list-btn"
        :class="{ active: selectedNationId === n.id }"
        @click="pickNation(n.id)"
      >
        <span class="swatch" :style="{ background: n.color ?? nationColor(i) }" />
        <span class="list-label">{{ n.name }}</span>
      </button>
      <p v-if="nationListMode === 'edit'" class="hint">点击国家名称可在下方文本框修改国名、政体与文化。</p>
      <template v-if="selectedNation">
        <label class="field nation-name-field">
          <span>国名（可改）</span>
          <input
            :value="selectedNation.name"
            class="nc-input nation-name-input"
            placeholder="输入国家名称"
            @click.stop
            @input="
              emit('patch-nation', selectedNation!.id, {
                name: ($event.target as HTMLInputElement).value
              })
            "
          />
        </label>
        <label class="field">
          <span>政体</span>
          <input
            :value="selectedNation.government"
            class="nc-input"
            placeholder="政体"
            @click.stop
            @input="
              emit('patch-nation', selectedNation!.id, {
                government: ($event.target as HTMLInputElement).value
              })
            "
          />
        </label>
        <label class="field">
          <span>文化</span>
          <input
            :value="selectedNation.culture"
            class="nc-input"
            placeholder="文化倾向"
            @click.stop
            @input="
              emit('patch-nation', selectedNation!.id, {
                culture: ($event.target as HTMLInputElement).value
              })
            "
          />
        </label>
        <label class="field checkbox-field">
          <input
            type="checkbox"
            :checked="selectedNation.allowOceanTerritory === true"
            @click.stop
            @change="
              emit('patch-nation', selectedNation!.id, {
                allowOceanTerritory: ($event.target as HTMLInputElement).checked
              })
            "
          />
          <span>允许海洋为领土</span>
        </label>
        <p class="hint">
          默认关闭：涂抹结束后自动识别为<strong>陆地 + 向外一格领海</strong>；画笔不能直接涂深海。开启后可把远洋格划入本国。
        </p>
        <label class="field">
          <span>设定</span>
          <textarea
            :value="selectedNation.authorSettings ?? selectedNation.description"
            class="nc-input area"
            rows="3"
            @input="
              emit('patch-nation', selectedNation!.id, {
                authorSettings: ($event.target as HTMLTextAreaElement).value
              })
            "
          />
        </label>
      </template>
    </section>

    <section class="block">
      <div class="head-row">
        <h4>城市（{{ locations.length }}）</h4>
        <button type="button" class="nc-btn nc-btn-sm" @click="emit('add-location')">+</button>
      </div>
      <p v-if="locationCoordAudit.onOceanCount > 0" class="hint warn">
        {{ locationCoordAudit.onOceanCount }} 个城市坐标在海上
        <span v-if="locationCoordAudit.looksLikeUnitScale">（疑似 0–1 尺度）</span>
        <span v-else-if="locationCoordAudit.looksLikePixelScale">（疑似像素坐标）</span>
      </p>
      <div class="list-scroll">
      <button
        v-for="loc in locations"
        :key="loc.id"
        type="button"
        class="list-btn"
        :class="{ active: selectedLocationId === loc.id }"
        @click="emit('update:selectedLocationId', loc.id)"
      >
        {{ loc.name }}（{{ locationTierLabel(loc) }}）
      </button>
      </div>
      <template v-if="selectedLocation">
        <p class="hint">在地图上<strong>拖动</strong>该城市圆点可改位置（自动吸附陆格，不落海上）。</p>
        <label class="field">
          <span>城市名称（可改）</span>
          <input
            :value="selectedLocation.name"
            class="nc-input"
            placeholder="输入城市名称"
            @click.stop
            @input="
              emit('patch-location', selectedLocation!.id, {
                name: ($event.target as HTMLInputElement).value
              })
            "
          />
        </label>
        <label class="field">
          <span>发展程度</span>
          <input
            :value="selectedLocation.development ?? 0"
            type="number"
            min="0"
            max="100"
            class="nc-input"
            @input="
              emit('patch-location', selectedLocation!.id, {
                development: Number(($event.target as HTMLInputElement).value)
              })
            "
          />
        </label>
        <label class="field">
          <span>设定</span>
          <textarea
            :value="locationSettingText"
            class="nc-input area"
            rows="3"
            @input="
              emit('patch-location', selectedLocation!.id, {
                authorSettings: ($event.target as HTMLTextAreaElement).value
              })
            "
          />
        </label>
      </template>
    </section>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 260px;
  flex-shrink: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding: 0;
  border-left: 1px solid var(--nc-border);
  background: var(--nc-bg-elevated);
  font-size: 12px;
}
.layer-block {
  flex-shrink: 0;
  padding: 8px 8px 6px;
  border-bottom: 1px solid var(--nc-border);
  background: var(--nc-bg-elevated);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.sidebar-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.block h4 {
  margin: 0;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  padding: 3px 8px;
  border: 1px solid var(--nc-border);
  border-radius: 4px;
  background: var(--nc-bg-base);
  color: var(--nc-text);
  font-size: 11px;
  cursor: pointer;
}
.chip:hover {
  border-color: var(--nc-accent);
}
.chip.active {
  border-color: var(--nc-accent);
  color: var(--nc-accent);
  background: rgba(110, 181, 255, 0.1);
}
.list-scroll {
  max-height: 140px;
  overflow-y: auto;
  margin-bottom: 4px;
  border: 1px solid var(--nc-border);
  border-radius: 4px;
  padding: 2px;
}
.territory-paint {
  padding-bottom: 4px;
  border-bottom: 1px solid var(--nc-border);
}
.paint-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.paint-nation {
  color: var(--nc-accent);
}
.hint.warn {
  color: #e8a060;
}
.hint {
  margin: 0;
  font-size: 11px;
  color: var(--nc-text-muted);
  line-height: 1.4;
}
.stats {
  margin: 0;
  padding-left: 1.2em;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.field .num {
  font-size: 11px;
  color: var(--nc-text-muted);
}
.list-btn {
  text-align: left;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.list-btn.active {
  border-color: var(--nc-accent);
  background: rgba(110, 181, 255, 0.08);
}
.list-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reconcile-btn {
  width: 100%;
  margin-bottom: 6px;
}
.nation-name-field .nation-name-input {
  border-color: var(--nc-accent);
}
.swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
</style>
