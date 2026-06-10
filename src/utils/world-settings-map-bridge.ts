import type { KnowledgeDocument, KnowledgeWorld, WorldMapDocument } from '@/types/project'
import type { PlaceNamingStyle, WorldClimateMode, WorldGenConfig, WorldScale } from '@/types/world-gen'
import { PLACE_NAMING_STYLE_OPTIONS } from '@/utils/world-place-naming'
import {
  WORLDENGINE_SCALE_PRESETS,
  worldEnginePreset
} from '../../shared/world-engine-official'

/** 设定面板 / 大纲生成：与地图生成器同一套尺度选项 */
export const MAP_SCALE_UI_OPTIONS = WORLDENGINE_SCALE_PRESETS.map((p) => ({
  value: p.id,
  label: p.label,
  desc: p.desc
}))

export const WORLD_CLIMATE_UI_OPTIONS: { value: WorldClimateMode; label: string }[] = [
  { value: 'mixed', label: '混合气候带' },
  { value: 'temperate', label: '温带为主' },
  { value: 'cold', label: '寒带/北境' },
  { value: 'tropical', label: '热带/南方' }
]

const VALID_SCALES = new Set<WorldScale>(
  WORLDENGINE_SCALE_PRESETS.map((p) => p.id)
)

/** 旧版中文世界规模 → 地图尺度 */
const LEGACY_WORLD_SCALE: Record<string, WorldScale> = {
  单一城市: 'kingdom',
  区域王国: 'kingdom',
  王国: 'kingdom',
  大陆: 'continent',
  多大陆: 'world',
  星球: 'planet',
  星域: 'planet',
  群岛: 'archipelago'
}

const VALID_CLIMATES = new Set<WorldClimateMode>(['mixed', 'temperate', 'cold', 'tropical'])
const VALID_NAMING = new Set<PlaceNamingStyle>(
  PLACE_NAMING_STYLE_OPTIONS.map((o) => o.id)
)

export function isWorldScale(value: string | undefined): value is WorldScale {
  return !!value && VALID_SCALES.has(value as WorldScale)
}

export function normalizeMapScale(
  raw: string | undefined,
  map?: WorldMapDocument | null
): WorldScale {
  const trimmed = raw?.trim()
  if (trimmed && isWorldScale(trimmed)) return trimmed
  if (trimmed && LEGACY_WORLD_SCALE[trimmed]) return LEGACY_WORLD_SCALE[trimmed]
  const fromMap = map ? inferMapScaleFromMap(map) : null
  return fromMap ?? 'continent'
}

export function mapScaleLabel(scale: WorldScale): string {
  return worldEnginePreset(scale).label
}

export function mapScaleDesc(scale: WorldScale): string {
  return worldEnginePreset(scale).desc
}

/** 从 map.json 推断尺度（优先 map.scale，否则按 render 分辨率） */
export function inferMapScaleFromMap(map: WorldMapDocument): WorldScale | null {
  if (map.scale && isWorldScale(map.scale)) return map.scale

  const w = map.renderWidth
  const h = map.renderHeight
  if (!w || !h) return null

  const exact = WORLDENGINE_SCALE_PRESETS.find((p) => p.width === w && p.height === h)
  if (exact) return exact.id

  let best: WorldScale | null = null
  let bestDist = Infinity
  for (const p of WORLDENGINE_SCALE_PRESETS) {
    const dist = Math.abs(p.width - w) + Math.abs(p.height - h)
    if (dist < bestDist) {
      bestDist = dist
      best = p.id
    }
  }
  return best
}

export function normalizeWorldClimate(raw: string | undefined, map?: WorldMapDocument | null): WorldClimateMode {
  const trimmed = raw?.trim() as WorldClimateMode | undefined
  if (trimmed && VALID_CLIMATES.has(trimmed)) return trimmed
  if (map?.climate && VALID_CLIMATES.has(map.climate)) return map.climate
  return 'mixed'
}

export function normalizePlaceNamingStyle(raw: string | undefined): PlaceNamingStyle {
  const trimmed = raw?.trim() as PlaceNamingStyle | undefined
  if (trimmed && VALID_NAMING.has(trimmed)) return trimmed
  return 'chinese'
}

export function climateLabel(mode: WorldClimateMode): string {
  return WORLD_CLIMATE_UI_OPTIONS.find((o) => o.value === mode)?.label ?? mode
}

export function placeNamingLabel(style: PlaceNamingStyle): string {
  return PLACE_NAMING_STYLE_OPTIONS.find((o) => o.id === style)?.label ?? style
}

/** 将 map 上的生成参数写回 world（加载项目时） */
export function syncWorldFromMap(world: KnowledgeWorld, map: WorldMapDocument | null): boolean {
  let changed = false
  const scale = normalizeMapScale(world.mapScale ?? world.worldScale, map)
  if (world.mapScale !== scale) {
    world.mapScale = scale
    changed = true
  }
  if (world.worldScale !== scale) {
    world.worldScale = scale
    changed = true
  }

  const climate = normalizeWorldClimate(world.climate, map)
  if (world.climate !== climate) {
    world.climate = climate
    changed = true
  }

  if (map?.placeNamingStyle) {
    const naming = normalizePlaceNamingStyle(map.placeNamingStyle)
    if (world.placeNamingStyle !== naming) {
      world.placeNamingStyle = naming
      changed = true
    }
  }

  return changed
}

/** 设定变更写回 map.json（已有地图时保持参数一致） */
export function syncMapFromWorld(world: KnowledgeWorld, map: WorldMapDocument | null): boolean {
  if (!map) return false
  let changed = false

  const scale = normalizeMapScale(world.mapScale ?? world.worldScale, map)
  if (map.scale !== scale) {
    map.scale = scale
    changed = true
  }

  const climate = normalizeWorldClimate(world.climate, map)
  if (map.climate !== climate) {
    map.climate = climate
    changed = true
  }

  const naming = normalizePlaceNamingStyle(world.placeNamingStyle)
  if (map.placeNamingStyle !== naming) {
    map.placeNamingStyle = naming
    changed = true
  }

  return changed
}

export function syncKnowledgeWorldAndMap(doc: KnowledgeDocument): boolean {
  if (!doc.world) return false
  const a = syncWorldFromMap(doc.world, doc.map)
  const b = syncMapFromWorld(doc.world, doc.map)
  return a || b
}

/** 新建/再生成地图时写入 map 元数据 */
export function stampMapGenerationMeta(
  map: WorldMapDocument,
  config: Pick<WorldGenConfig, 'scale' | 'climate' | 'placeNamingStyle'>
): void {
  map.scale = config.scale
  map.climate = config.climate
  map.placeNamingStyle = normalizePlaceNamingStyle(config.placeNamingStyle)
}

/** 世界观生成器 ← knowledge 设定 */
export function worldGenConfigFromKnowledge(doc: KnowledgeDocument): Partial<WorldGenConfig> {
  const world = doc.world ?? { title: '', rules: '' }
  const map = doc.map
  const scale = normalizeMapScale(world.mapScale ?? world.worldScale, map)

  return {
    worldName: world.title?.trim() || map?.name || '新世界',
    era: world.era?.trim() || '架空',
    scene: world.scene?.trim() || '大陆',
    scenePlace: world.scenePlace?.trim() || '',
    atmosphere: world.atmosphere
      ? world.atmosphere.split(/[、,，/|/\s]+/).filter(Boolean).slice(0, 3)
      : ['史诗'],
    scale,
    climate: normalizeWorldClimate(world.climate, map),
    placeNamingStyle: normalizePlaceNamingStyle(world.placeNamingStyle ?? map?.placeNamingStyle),
    seed: world.mapSeed
  }
}

/** 生成器 / 应用地图 → 回写 world 设定（不含 rules 正文） */
export function applyWorldGenMetaToKnowledge(
  world: KnowledgeWorld,
  config: Pick<
    WorldGenConfig,
    'worldName' | 'era' | 'scene' | 'scenePlace' | 'atmosphere' | 'scale' | 'climate' | 'placeNamingStyle' | 'seed'
  >
): void {
  if (config.worldName?.trim()) world.title = config.worldName.trim()
  if (config.era) world.era = config.era
  if (config.scene) world.scene = config.scene
  if (config.scenePlace != null) world.scenePlace = config.scenePlace.trim()
  if (config.atmosphere?.length) {
    world.atmosphere = config.atmosphere.slice(0, 3).join('、')
  }
  world.mapScale = config.scale
  world.worldScale = config.scale
  world.climate = config.climate
  world.placeNamingStyle = normalizePlaceNamingStyle(config.placeNamingStyle)
  if (config.seed != null) world.mapSeed = config.seed
}

export interface MapLinkedWorldPatch {
  mapScale?: WorldScale
  climate?: WorldClimateMode
  placeNamingStyle?: PlaceNamingStyle
}

export function applyMapLinkedWorldPatch(world: KnowledgeWorld, patch: MapLinkedWorldPatch): void {
  if (patch.mapScale != null) {
    world.mapScale = patch.mapScale
    world.worldScale = patch.mapScale
  }
  if (patch.climate != null) world.climate = patch.climate
  if (patch.placeNamingStyle != null) {
    world.placeNamingStyle = normalizePlaceNamingStyle(patch.placeNamingStyle)
  }
}
