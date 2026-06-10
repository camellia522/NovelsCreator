import type { KnowledgeWorld, WorldMapDocument } from '@/types/project'
import type { PlaceNamingStyle, WorldClimateMode, WorldScale } from '@/types/world-gen'
import {
  climateLabel,
  mapScaleDesc,
  mapScaleLabel,
  normalizeMapScale,
  normalizePlaceNamingStyle,
  normalizeWorldClimate
} from '@/utils/world-settings-map-bridge'

export {
  MAP_SCALE_UI_OPTIONS,
  WORLD_CLIMATE_UI_OPTIONS,
  climateLabel,
  mapScaleDesc,
  mapScaleLabel,
  normalizeMapScale,
  normalizePlaceNamingStyle,
  normalizeWorldClimate,
  syncKnowledgeWorldAndMap,
  syncMapFromWorld,
  worldGenConfigFromKnowledge,
  applyWorldGenMetaToKnowledge
} from '@/utils/world-settings-map-bridge'

/** ── 时代 ── */
export const WIZARD_ERA_OPTIONS = [
  '史前',
  '青铜时代',
  '铁器时代',
  '古典',
  '中古',
  '启蒙',
  '近代',
  '工业',
  '现代',
  '近未来',
  '远未来',
  '架空',
  '多时代交织'
] as const

/** ── 题材 ── */
export const WORLD_GENRE_OPTIONS = [
  '历史',
  '王朝',
  '军事',
  '权谋',
  '史诗',
  '奇幻',
  '科幻',
  '硬科幻',
  '太空歌剧',
  '武侠',
  '仙侠',
  '悬疑',
  '推理',
  '言情',
  '现实主义',
  '生存',
  '谍战',
  '恐怖',
  '冒险',
  '公路',
  '种田',
  '赛博朋克',
  '蒸汽朋克',
  '反乌托邦',
  '寓言'
] as const

/** ── 主要场景类型 ── */
export const WIZARD_SCENE_OPTIONS = [
  '大陆',
  '帝国疆域',
  '王国',
  '城邦',
  '都市',
  '乡村',
  '江湖',
  '宗门',
  '校园',
  '海洋',
  '群岛',
  '沙漠',
  '雪山',
  '雨林',
  '太空',
  '废土',
  '宫廷',
  '边关',
  '战场',
  '商路',
  '港口',
  '遗迹',
  '行营',
  '矿场'
] as const

/** ── 社会结构 ── */
export const WORLD_SOCIAL_STRUCTURE_OPTIONS = [
  '封建帝国',
  '多国王朝',
  '城邦联盟',
  '部落氏族',
  '商业联邦',
  '神权国家',
  '军政独裁',
  '游牧汗国',
  '海洋霸权',
  '混合政体'
] as const

/** ── 政治基调 ── */
export const WORLD_POLITICAL_TONE_OPTIONS = [
  '中央集权',
  '藩镇割据',
  '议会博弈',
  '贵族共和',
  '双轨内阁',
  '宗教干政',
  '商人参政',
  '军阀混战',
  '改革维新'
] as const

/** ── 战争形态 ── */
export const WORLD_WARFARE_STYLE_OPTIONS = [
  '步骑会战',
  '城防攻坚',
  '水战争锋',
  '游击袭扰',
  '雇佣兵',
  '壕堑火炮',
  '空天战',
  '暂无大战'
] as const

/** ── 经济支柱 ── */
export const WORLD_ECONOMIC_BASE_OPTIONS = [
  '农业立国',
  '牧业游牧',
  '海上贸易',
  '矿产冶金',
  '手工业坊',
  '商业枢纽',
  '香料草药',
  '混合经济'
] as const

export const WORLD_TECH_OPTIONS = [
  '原始部落',
  '青铜',
  '铁器',
  '冷兵器',
  '弩与铠甲',
  '火药早期',
  '燧发枪',
  '工业革命',
  '一战',
  '二战',
  '现代',
  '信息时代',
  '近未来',
  '星际'
] as const

/** ── 力量体系（硬约束核心） ── */
export const WORLD_MAGIC_CONSTRAINT_OPTIONS = [
  '严格写实（无超自然）',
  '纯史诗（无魔法）',
  '历史神话（传说不可当真）',
  '低魔',
  '高魔',
  '修仙',
  '科幻异能',
  '都市异能'
] as const

/** ── 冲突主轴 ── */
export const WORLD_CONFLICT_OPTIONS = [
  '国家战争',
  '宫廷权谋',
  '宗族恩怨',
  '阶级革命',
  '个人成长',
  '悬疑解谜',
  '生存挣扎',
  '商业竞争',
  '谍战潜伏',
  '宗教纷争',
  '复仇追缉',
  '身份错位',
  '资源争夺',
  '理念对立'
] as const

/** ── 叙事风格 ── */
export const WORLD_NARRATIVE_STYLE_OPTIONS = [
  '史诗群像',
  '单线推进',
  '多线交织',
  '第一人称',
  '第三人称全知',
  '多 POV 轮换',
  '纪实',
  '诗意抒情',
  '冷峻白描',
  '章回体'
] as const

/** ── 叙事节奏 ── */
export const WORLD_PACING_OPTIONS = [
  '快节奏',
  '稳健推进',
  '慢热铺陈',
  '张弛交替',
  '卷末冲刺'
] as const

/** ── 文风 ── */
export const WORLD_PROSE_REGISTER_OPTIONS = [
  '史传笔法',
  '古典雅言',
  '白话流畅',
  '现代口语',
  '诗意意象',
  '冷峻纪实'
] as const

/** ── 创作禁忌（最多 4 个，写入硬性约束） ── */
export const WORLD_CONTENT_TABOO_OPTIONS = [
  '禁穿越',
  '禁重生',
  '禁系统',
  '禁修真',
  '禁魔教',
  '禁龙傲天',
  '禁后宫',
  '禁虐杀',
  '禁现代武器乱入',
  '禁外星人',
  '禁性描写',
  '禁猎奇'
] as const

/** ── 氛围（最多 3 个） ── */
export const WIZARD_ATMOSPHERE_OPTIONS = [
  '热血',
  '悬疑',
  '治愈',
  '黑暗',
  '轻松',
  '史诗',
  '悲壮',
  '诡谲',
  '浪漫',
  '硬核',
  '苍凉',
  '诙谐',
  '压抑',
  '希望',
  '江湖',
  '庙堂',
  '赛博',
  '克苏鲁'
] as const

export const WIZARD_CHARACTER_ROLE_OPTIONS = [
  '主角',
  '配角',
  '反派',
  '导师',
  '盟友',
  '竞争者',
  '弄臣',
  '龙套',
  '群像'
] as const

export type WizardSceneType = (typeof WIZARD_SCENE_OPTIONS)[number]
export type WorldMagicConstraint = (typeof WORLD_MAGIC_CONSTRAINT_OPTIONS)[number]

export interface MagicConstraintSpec {
  summary: string
  allowed: string
  forbidden: string
}

export const MAGIC_CONSTRAINT_SPECS: Record<WorldMagicConstraint, MagicConstraintSpec> = {
  '严格写实（无超自然）': {
    summary: '完全遵循现实物理与社会规律；民间迷信可存在但不得成真。',
    allowed: '现实武器、政治、经济、自然灾异（无超自然成因）；心理与阴谋。',
    forbidden:
      '魔法、法术、符咒、炼丹、灵气、修为、异能、妖怪、神灵真实干预、预言灵验、复活、灵魂出窍、封印裂缝、能量觉醒、星盘预知、古神、浮空岛、异世界穿越、灵兽通神。'
  },
  '纯史诗（无魔法）': {
    summary: '架空历史/史诗大陆；可引用神话传说但不得成真，无系统性超自然。',
    allowed: '冷兵器战争、帝国割据、权谋、民俗祭祀（仅文化层面）、史诗修辞。',
    forbidden:
      '修仙、魔教、灵力、丹道、宗门秘法、法宝、妖兽、渡劫、内功、真气、法术、符咒、阵法、诅咒、附魔、亡灵、召唤、任何可验证的超自然现象：发光灵石、狐狸化身、神灵降世、浮空岛、空间裂缝、能量觉醒、星盘、古神意识、复活、预言必中、系统面板、穿越、重生。'
  },
  '历史神话（传说不可当真）': {
    summary: '允许神话叙事口吻，但情节中不得出现可被证实为真的奇迹。',
    allowed: '口头传说、祭祀仪式、象征性异象（须可解释为自然或人为）。',
    forbidden: '角色可施法、可修炼、可召唤、可复活；具名神魔直接参战；系统性魔法学院/宗门设定。'
  },
  '低魔': {
    summary: '极少量奇迹，须稀少、代价高、不可量产；无完整魔法工业。',
    allowed: '偶发预言、圣物异象、禁术（每卷≤1 次且须付出代价）。',
    forbidden: '大规模法师军团、随意瞬移、复活成常态、修仙境界体系、现代都市异能组织。'
  },
  '高魔': {
    summary: '完整魔法或异能体系，须与 knowledge 中 factions/items 一致。',
    allowed: '法术、魔法物品、异族、结界等（须事先在设定中登记）。',
    forbidden: '无代价全能魔法；与已登记 power 体系矛盾的随意新能力。'
  },
  修仙: {
    summary: '境界、灵力、宗门体系；须与 world.rules 及 knowledge 一致。',
    allowed: '修炼、法宝、丹药、妖兽、阵法（须符合已登记设定）。',
    forbidden: '无境界限制的瞬杀；与已登记宗门/境界体系冲突的随意升级。'
  },
  科幻异能: {
    summary: '科技或基因/信息场解释的超能力；须有技术或组织背景。',
    allowed: '基因改造、义体、AI、星际航行（须符合 techLevel）。',
    forbidden: '无法解释的玄学修仙；与 techLevel 矛盾的魔法道具。'
  },
  都市异能: {
    summary: '现代/近未来都市背景下的有限异能；须低调或组织化。',
    allowed: '都市中的异能者、秘密组织、现代武器与异能并存。',
    forbidden: '大规模公开魔法战争（除非 rules 明确）；古代修仙宗门整套搬入现代。'
  }
}

const ALL_OPTION_SETS: Record<string, readonly string[]> = {
  era: WIZARD_ERA_OPTIONS,
  genre: WORLD_GENRE_OPTIONS,
  scene: WIZARD_SCENE_OPTIONS,
  socialStructure: WORLD_SOCIAL_STRUCTURE_OPTIONS,
  politicalTone: WORLD_POLITICAL_TONE_OPTIONS,
  warfareStyle: WORLD_WARFARE_STYLE_OPTIONS,
  economicBase: WORLD_ECONOMIC_BASE_OPTIONS,
  techLevel: WORLD_TECH_OPTIONS,
  magicConstraint: WORLD_MAGIC_CONSTRAINT_OPTIONS,
  conflictFocus: WORLD_CONFLICT_OPTIONS,
  narrativeStyle: WORLD_NARRATIVE_STYLE_OPTIONS,
  pacing: WORLD_PACING_OPTIONS,
  proseRegister: WORLD_PROSE_REGISTER_OPTIONS,
  contentTaboo: WORLD_CONTENT_TABOO_OPTIONS,
  atmosphere: WIZARD_ATMOSPHERE_OPTIONS,
  role: WIZARD_CHARACTER_ROLE_OPTIONS
}

export function pickFromOptions(
  raw: string | undefined,
  key: keyof typeof ALL_OPTION_SETS,
  fallback: string
): string {
  const trimmed = raw?.trim()
  const options = ALL_OPTION_SETS[key]
  if (trimmed && options.includes(trimmed)) return trimmed
  return fallback
}

export function isWizardSceneType(value: string | undefined): value is WizardSceneType {
  return !!value && (WIZARD_SCENE_OPTIONS as readonly string[]).includes(value)
}

export function parseAtmosphereTags(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[、,，/|/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function formatAtmosphereTags(tags: string[]): string {
  return tags
    .filter(Boolean)
    .filter((t) => (WIZARD_ATMOSPHERE_OPTIONS as readonly string[]).includes(t))
    .slice(0, 3)
    .join('、')
}

export function readAtmosphereTagsFromWorld(world: KnowledgeWorld): string[] {
  return parseAtmosphereTags(world.atmosphere)
    .filter((a) => (WIZARD_ATMOSPHERE_OPTIONS as readonly string[]).includes(a))
    .slice(0, 3)
}

export function parseContentTaboos(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[、,，/|/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function formatContentTaboos(tags: string[]): string {
  return tags
    .filter(Boolean)
    .filter((t) => (WORLD_CONTENT_TABOO_OPTIONS as readonly string[]).includes(t))
    .slice(0, 4)
    .join('、')
}

export function readContentTaboosFromWorld(world: KnowledgeWorld): string[] {
  return parseContentTaboos(world.contentTaboos)
    .filter((t) => (WORLD_CONTENT_TABOO_OPTIONS as readonly string[]).includes(t))
    .slice(0, 4)
}

export function pickMagicConstraint(raw: string | undefined): WorldMagicConstraint {
  const trimmed = raw?.trim()
  if (trimmed && (WORLD_MAGIC_CONSTRAINT_OPTIONS as readonly string[]).includes(trimmed)) {
    return trimmed as WorldMagicConstraint
  }
  return '纯史诗（无魔法）'
}

export function getMagicConstraintSpec(constraint: string | undefined): MagicConstraintSpec {
  const key = pickMagicConstraint(constraint)
  return MAGIC_CONSTRAINT_SPECS[key]
}

/** 结构化世界设定（与 world.json 字段一一对应） */
export interface WorldSettingFields {
  era: string
  genre: string
  scene: string
  scenePlace: string
  mapScale: WorldScale
  climate: WorldClimateMode
  placeNamingStyle: PlaceNamingStyle
  socialStructure: string
  politicalTone: string
  warfareStyle: string
  economicBase: string
  techLevel: string
  magicConstraint: string
  conflictFocus: string
  narrativeStyle: string
  pacing: string
  proseRegister: string
  contentTaboos: string[]
  atmosphere: string[]
}

export const WORLD_SETTING_DEFAULTS: WorldSettingFields = {
  era: '架空',
  genre: '史诗',
  scene: '大陆',
  scenePlace: '',
  mapScale: 'continent',
  climate: 'mixed',
  placeNamingStyle: 'chinese',
  socialStructure: '封建帝国',
  politicalTone: '中央集权',
  warfareStyle: '步骑会战',
  economicBase: '混合经济',
  techLevel: '冷兵器',
  magicConstraint: '纯史诗（无魔法）',
  conflictFocus: '国家战争',
  narrativeStyle: '史诗群像',
  pacing: '稳健推进',
  proseRegister: '白话流畅',
  contentTaboos: ['禁修真', '禁魔教', '禁穿越'],
  atmosphere: ['史诗']
}

export function readWorldSettingFields(
  world: KnowledgeWorld,
  map?: WorldMapDocument | null
): WorldSettingFields {
  const atmosphere = readAtmosphereTagsFromWorld(world)
  const contentTaboos = readContentTaboosFromWorld(world)
  const mapScale = normalizeMapScale(world.mapScale ?? world.worldScale, map)
  return {
    era: pickFromOptions(world.era, 'era', WORLD_SETTING_DEFAULTS.era),
    genre: pickFromOptions(world.genre, 'genre', WORLD_SETTING_DEFAULTS.genre),
    scene: pickFromOptions(world.scene, 'scene', WORLD_SETTING_DEFAULTS.scene),
    scenePlace: world.scenePlace?.trim() ?? '',
    mapScale,
    climate: normalizeWorldClimate(world.climate, map),
    placeNamingStyle: normalizePlaceNamingStyle(world.placeNamingStyle ?? map?.placeNamingStyle),
    socialStructure: pickFromOptions(
      world.socialStructure,
      'socialStructure',
      WORLD_SETTING_DEFAULTS.socialStructure
    ),
    politicalTone: pickFromOptions(world.politicalTone, 'politicalTone', WORLD_SETTING_DEFAULTS.politicalTone),
    warfareStyle: pickFromOptions(world.warfareStyle, 'warfareStyle', WORLD_SETTING_DEFAULTS.warfareStyle),
    economicBase: pickFromOptions(world.economicBase, 'economicBase', WORLD_SETTING_DEFAULTS.economicBase),
    techLevel: pickFromOptions(world.techLevel, 'techLevel', WORLD_SETTING_DEFAULTS.techLevel),
    magicConstraint: pickMagicConstraint(world.magicConstraint),
    conflictFocus: pickFromOptions(world.conflictFocus, 'conflictFocus', WORLD_SETTING_DEFAULTS.conflictFocus),
    narrativeStyle: pickFromOptions(
      world.narrativeStyle,
      'narrativeStyle',
      WORLD_SETTING_DEFAULTS.narrativeStyle
    ),
    pacing: pickFromOptions(world.pacing, 'pacing', WORLD_SETTING_DEFAULTS.pacing),
    proseRegister: pickFromOptions(world.proseRegister, 'proseRegister', WORLD_SETTING_DEFAULTS.proseRegister),
    contentTaboos: contentTaboos.length ? contentTaboos : [...WORLD_SETTING_DEFAULTS.contentTaboos],
    atmosphere: atmosphere.length ? atmosphere : [...WORLD_SETTING_DEFAULTS.atmosphere]
  }
}

export function applyWorldSettingFields(
  world: KnowledgeWorld,
  fields: Partial<WorldSettingFields>
): void {
  if (fields.era != null) world.era = fields.era
  if (fields.genre != null) world.genre = fields.genre
  if (fields.scene != null) world.scene = fields.scene
  if (fields.scenePlace != null) world.scenePlace = fields.scenePlace.trim()
  if (fields.mapScale != null) {
    world.mapScale = fields.mapScale
    world.worldScale = fields.mapScale
  }
  if (fields.climate != null) world.climate = fields.climate
  if (fields.placeNamingStyle != null) world.placeNamingStyle = fields.placeNamingStyle
  if (fields.socialStructure != null) world.socialStructure = fields.socialStructure
  if (fields.politicalTone != null) world.politicalTone = fields.politicalTone
  if (fields.warfareStyle != null) world.warfareStyle = fields.warfareStyle
  if (fields.economicBase != null) world.economicBase = fields.economicBase
  if (fields.techLevel != null) world.techLevel = fields.techLevel
  if (fields.magicConstraint != null) world.magicConstraint = fields.magicConstraint
  if (fields.conflictFocus != null) world.conflictFocus = fields.conflictFocus
  if (fields.narrativeStyle != null) world.narrativeStyle = fields.narrativeStyle
  if (fields.pacing != null) world.pacing = fields.pacing
  if (fields.proseRegister != null) world.proseRegister = fields.proseRegister
  if (fields.contentTaboos != null) world.contentTaboos = formatContentTaboos(fields.contentTaboos)
  if (fields.atmosphere != null) world.atmosphere = formatAtmosphereTags(fields.atmosphere)
}

/** 根据选项生成注入 O1/O2 的硬性约束全文（写入 world.settingConstraints） */
export function buildCompiledSettingConstraints(
  world: KnowledgeWorld,
  map?: WorldMapDocument | null
): string {
  const s = readWorldSettingFields(world, map)
  const magic = getMagicConstraintSpec(s.magicConstraint)
  const atmosphere = formatAtmosphereTags(s.atmosphere)
  const taboos = formatContentTaboos(s.contentTaboos)
  const scaleText = `${mapScaleLabel(s.mapScale)}（${mapScaleDesc(s.mapScale)}）`

  const lines = [
    '【硬性设定 · 选项生成 · 不得违背】',
    `1. 时代：${s.era}；题材：${s.genre}；叙事：${s.narrativeStyle}；节奏：${s.pacing}；文风：${s.proseRegister}。`,
    `2. 地图尺度：${scaleText}；场景类型：${s.scene}${s.scenePlace ? `；主舞台：${s.scenePlace}` : ''}。`,
    `3. 社会：${s.socialStructure}；政治：${s.politicalTone}；战争：${s.warfareStyle}；经济：${s.economicBase}。`,
    `4. 气候：${climateLabel(s.climate)}；科技：${s.techLevel}；冲突主轴：${s.conflictFocus}；氛围：${atmosphere || '未指定'}。`,
    `5. 力量体系：${s.magicConstraint}。${magic.summary}`,
    `6. 允许：${magic.allowed}`,
    `7. 严禁：${magic.forbidden}`,
    taboos ? `8. 创作禁忌（额外硬约束）：${taboos}` : '',
    '9. beats/summary 须使用 knowledge 已登记的国家/势力/人物/地点全名；禁止 silent retcon；禁止替换主角；禁止自造与 knowledge 冲突的具名重要实体。',
    '10. plot_memory 与 existing_volume_outline 冲突时，以 existing_volume_outline 为准；新章须因果承接最后一章 beats。',
    '11. 禁止把史诗大陆/历史题材写成现代都市玄幻；禁止与力量体系矛盾的任何超自然/修仙/魔教情节。'
  ].filter(Boolean)

  const noMagic =
    s.magicConstraint === '严格写实（无超自然）' ||
    s.magicConstraint === '纯史诗（无魔法）' ||
    s.magicConstraint === '历史神话（传说不可当真）'

  if (noMagic && (s.genre === '仙侠' || s.genre === '奇幻' || atmosphere.includes('江湖'))) {
    lines.push(
      '12. 题材/氛围可含江湖或奇幻美学，但不得出现修炼、法术、灵气、魔教、宗门异能等可验证超自然。'
    )
  }

  if (s.scene === '都市' && (s.genre === '史诗' || s.mapScale === 'continent' || s.mapScale === 'world')) {
    lines.push('12. 场景「都市」与大陆尺度并存：按 knowledge 地图写架空历史城邦，非现代都市。')
  }

  return lines.join('\n')
}

/** 选项变更时刷新 world.settingConstraints */
export function refreshWorldSettingConstraints(
  world: KnowledgeWorld,
  map?: WorldMapDocument | null
): void {
  world.settingConstraints = buildCompiledSettingConstraints(world, map)
}
