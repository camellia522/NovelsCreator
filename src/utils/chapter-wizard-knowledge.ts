import type { KnowledgeDocument, KnowledgeWorld, WorldLocation, WorldMapDocument } from '@/types/project'
import {
  WIZARD_ERA_OPTIONS,
  WIZARD_SCENE_OPTIONS,
  WIZARD_ATMOSPHERE_OPTIONS,
  WIZARD_CHARACTER_ROLE_OPTIONS,
  WORLD_MAGIC_CONSTRAINT_OPTIONS,
  WORLD_GENRE_OPTIONS,
  WORLD_TECH_OPTIONS,
  WORLD_CONFLICT_OPTIONS,
  WORLD_NARRATIVE_STYLE_OPTIONS,
  WORLD_SOCIAL_STRUCTURE_OPTIONS,
  WORLD_POLITICAL_TONE_OPTIONS,
  WORLD_WARFARE_STYLE_OPTIONS,
  WORLD_ECONOMIC_BASE_OPTIONS,
  WORLD_PACING_OPTIONS,
  WORLD_PROSE_REGISTER_OPTIONS,
  WORLD_CONTENT_TABOO_OPTIONS,
  WORLD_SETTING_DEFAULTS,
  MAP_SCALE_UI_OPTIONS,
  WORLD_CLIMATE_UI_OPTIONS,
  applyWorldSettingFields,
  buildCompiledSettingConstraints,
  formatAtmosphereTags,
  formatContentTaboos,
  readContentTaboosFromWorld,
  isWizardSceneType,
  mapScaleLabel,
  climateLabel,
  parseAtmosphereTags,
  pickMagicConstraint,
  readAtmosphereTagsFromWorld,
  readWorldSettingFields,
  refreshWorldSettingConstraints,
  syncMapFromWorld,
  type WorldSettingFields
} from '@/utils/world-setting-catalog'

export {
  WIZARD_ERA_OPTIONS,
  WIZARD_SCENE_OPTIONS,
  WIZARD_ATMOSPHERE_OPTIONS,
  WIZARD_CHARACTER_ROLE_OPTIONS,
  WORLD_MAGIC_CONSTRAINT_OPTIONS,
  WORLD_GENRE_OPTIONS,
  WORLD_TECH_OPTIONS,
  WORLD_CONFLICT_OPTIONS,
  WORLD_NARRATIVE_STYLE_OPTIONS,
  WORLD_SOCIAL_STRUCTURE_OPTIONS,
  WORLD_POLITICAL_TONE_OPTIONS,
  WORLD_WARFARE_STYLE_OPTIONS,
  WORLD_ECONOMIC_BASE_OPTIONS,
  WORLD_PACING_OPTIONS,
  WORLD_PROSE_REGISTER_OPTIONS,
  WORLD_CONTENT_TABOO_OPTIONS,
  WORLD_SETTING_DEFAULTS,
  MAP_SCALE_UI_OPTIONS,
  WORLD_CLIMATE_UI_OPTIONS,
  buildCompiledSettingConstraints,
  formatAtmosphereTags,
  formatContentTaboos,
  readContentTaboosFromWorld,
  isWizardSceneType,
  mapScaleLabel,
  climateLabel,
  parseAtmosphereTags,
  pickMagicConstraint,
  readAtmosphereTagsFromWorld,
  readWorldSettingFields,
  refreshWorldSettingConstraints,
  syncKnowledgeWorldAndMap,
  syncMapFromWorld,
  worldGenConfigFromKnowledge,
  applyWorldGenMetaToKnowledge,
  type WorldSettingFields
} from '@/utils/world-setting-catalog'

export {
  prepareKnowledgeForOutline,
  validateKnowledgeForOutline,
  resolveOutlineGenreTone,
  formatOutlineGenreForDify
} from '@/utils/outline-preflight'

export type { WizardSceneType, WorldMagicConstraint } from '@/utils/world-setting-catalog'

export interface OutlineWorldSettings extends WorldSettingFields {
  tone: string
}

/** 从 knowledge/world 预填大纲生成 / 设定面板 */
export function syncOutlineSettingsFromKnowledge(
  world: KnowledgeWorld,
  map?: WorldMapDocument | null
): OutlineWorldSettings {
  normalizeWorldSceneFields(world)
  const fields = readWorldSettingFields(world, map)
  return {
    ...fields,
    tone: formatAtmosphereTags(fields.atmosphere)
  }
}

export function applyOutlineSettingsToWorld(
  world: KnowledgeWorld,
  settings: Partial<WorldSettingFields>,
  map?: WorldMapDocument | null
): void {
  applyWorldSettingFields(world, settings)
  refreshWorldSettingConstraints(world, map)
  if (map) syncMapFromWorld(world, map)
}

function pickPresetOrFallback(
  value: string | undefined,
  presets: readonly string[],
  fallback: string
): { value: string; extraNote?: string } {
  const trimmed = value?.trim()
  if (!trimmed) return { value: fallback }
  if (presets.includes(trimmed)) return { value: trimmed }
  return { value: fallback, extraNote: trimmed }
}

export interface ResolvedWorldScene {
  sceneType: string
  scenePlace: string
}

/** 解析 world.scene / world.scenePlace；兼容旧档把地名写在 scene 字段 */
export function resolveWorldSceneFields(world: KnowledgeWorld): ResolvedWorldScene {
  const rawScene = world.scene?.trim() ?? ''
  const rawPlace = world.scenePlace?.trim() ?? ''

  if (isWizardSceneType(rawScene)) {
    return { sceneType: rawScene, scenePlace: rawPlace }
  }

  if (rawScene && !isWizardSceneType(rawScene)) {
    return {
      sceneType: '大陆',
      scenePlace: rawPlace || rawScene
    }
  }

  return { sceneType: '大陆', scenePlace: rawPlace }
}

/** 加载/保存前规范化：scene 只存类型标签，地名进 scenePlace */
export function normalizeWorldSceneFields(world: KnowledgeWorld): boolean {
  const before = `${world.scene ?? ''}|${world.scenePlace ?? ''}`
  const resolved = resolveWorldSceneFields(world)
  world.scene = resolved.sceneType
  world.scenePlace = resolved.scenePlace
  const after = `${world.scene}|${world.scenePlace ?? ''}`
  return before !== after
}

/** 从 knowledge/world 预填向导环境步 */
export function syncEnvironmentFromKnowledge(
  world: KnowledgeWorld,
  map?: WorldMapDocument | null
): {
  era: string
  scene: string
  scenePlace: string
  atmosphere: string[]
  envNote: string
} {
  normalizeWorldSceneFields(world)
  const fields = readWorldSettingFields(world, map)
  const eraPick = pickPresetOrFallback(world.era, WIZARD_ERA_OPTIONS, fields.era)
  const notes: string[] = []
  if (eraPick.extraNote) notes.push(`时代设定：${eraPick.extraNote}`)

  return {
    era: eraPick.value,
    scene: fields.scene,
    scenePlace: fields.scenePlace,
    atmosphere: fields.atmosphere,
    envNote: notes.join('；')
  }
}

/** 可读世界观摘要（向导 UI + generation_prompt） */
export function buildWorldBriefForWizard(doc: KnowledgeDocument): string {
  const parts: string[] = []
  const w = doc.world
  const fields = readWorldSettingFields(w, doc.map)

  if (w.title?.trim()) parts.push(`世界：${w.title.trim()}`)
  parts.push(
    `时代：${fields.era}；题材：${fields.genre}；地图尺度：${mapScaleLabel(fields.mapScale)}`
  )
  parts.push(`场景类型：${fields.scene}${fields.scenePlace ? `（${fields.scenePlace}）` : ''}`)
  parts.push(
    `社会：${fields.socialStructure} · 政治：${fields.politicalTone} · 战争：${fields.warfareStyle} · 经济：${fields.economicBase}`
  )
  parts.push(
    `气候：${climateLabel(fields.climate)}；科技：${fields.techLevel}；冲突：${fields.conflictFocus}；节奏：${fields.pacing}；文风：${fields.proseRegister}`
  )
  if (fields.atmosphere.length) parts.push(`氛围：${formatAtmosphereTags(fields.atmosphere)}`)
  parts.push(`力量体系：${fields.magicConstraint}`)

  const constraints = w.settingConstraints?.trim() || buildCompiledSettingConstraints(w, doc.map)
  if (constraints) {
    const excerpt = constraints.length > 480 ? `${constraints.slice(0, 480)}…` : constraints
    parts.push(excerpt)
  }

  if (w.rules?.trim()) {
    const rules = w.rules.trim()
    parts.push(`补充设定：${rules.length > 240 ? `${rules.slice(0, 240)}…` : rules}`)
  }

  const nations = doc.map?.nations ?? []
  if (nations.length) {
    parts.push(`国家：${nations.map((n) => n.name).join('、')}`)
  }

  const locs = doc.locations ?? []
  if (locs.length) {
    const priority = (t: WorldLocation['type']) =>
      ({ capital: 0, city: 1, town: 2, fortress: 3, landmark: 4, village: 5 })[t] ?? 9
    const named = [...locs]
      .sort((a, b) => priority(a.type) - priority(b.type) || a.name.localeCompare(b.name, 'zh-CN'))
      .slice(0, 10)
      .map((l) => l.name)
    parts.push(`地点：${[...new Set(named)].join('、')}`)
  }

  return parts.join('\n')
}

export function chapterLocationPrompt(loc: WorldLocation | undefined): {
  id: string
  name: string
  type: string
  description: string
} | null {
  if (!loc) return null
  return {
    id: loc.id,
    name: loc.name,
    type: loc.type,
    description: loc.description?.trim() ?? ''
  }
}

export interface WizardEnvironmentPatch {
  era: string
  scene: string
  scenePlace: string
  atmosphere: string[]
  envNote: string
}

export interface WizardCharacterPatch {
  id: string
  appearanceTags: string[]
  appearanceDesc: string
  personality: string
}

/** 向导环境回写 knowledge/world（不覆盖 world.rules） */
export function applyWizardEnvironmentToWorld(
  world: KnowledgeWorld,
  patch: WizardEnvironmentPatch,
  map?: WorldMapDocument | null
): void {
  world.era = patch.era
  world.scene = patch.scene
  world.scenePlace = patch.scenePlace.trim()
  world.atmosphere = formatAtmosphereTags(patch.atmosphere)
  refreshWorldSettingConstraints(world, map)
}
