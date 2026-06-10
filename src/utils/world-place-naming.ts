/**
 * 地名 / 国名命名风格（本地占位 + 社会层大模型润色约束）
 */

import type { WorldGenConfig } from '@/types/world-gen'
import { seededRandom } from '@/utils/world-noise'

export type PlaceNamingStyle = 'chinese' | 'western' | 'japanese' | 'fantasy' | 'mixed'

export interface PlaceNamingStyleOption {
  id: PlaceNamingStyle
  label: string
  desc: string
}

export const PLACE_NAMING_STYLE_OPTIONS: PlaceNamingStyleOption[] = [
  { id: 'chinese', label: '中式', desc: '行省、府县、京镇等汉式区划名' },
  { id: 'western', label: '西式', desc: 'Province、shire、City 等欧洲式地名' },
  { id: 'japanese', label: '日式', desc: '国、藩、郡、京等和风区划' },
  { id: 'fantasy', label: '奇幻', desc: '架空语感专名，弱化现实语种' },
  { id: 'mixed', label: '混合', desc: '各国采用不同风格（按国家序号轮换）' }
]

export interface PlaceNamingProfile {
  style: PlaceNamingStyle
  provinceStems: string[]
  prefectureStems: string[]
  countyPrefixes: string[]
  prefectureQualifiers: string[]
  nationStems: string[]
  nationSuffixes: string[]
  seatStems: string[]
}

const CHINESE: PlaceNamingProfile = {
  style: 'chinese',
  provinceStems: ['澜', '岳', '江', '河', '云', '岚', '青', '玄', '赤', '白', '金', '苍'],
  prefectureStems: ['安', '平', '宁', '远', '新', '昌', '文', '武', '清', '河', '云', '岚'],
  countyPrefixes: ['安', '平', '宁', '远', '新', '昌', '文', '武', '清', '河', '云', '岚'],
  prefectureQualifiers: ['上', '下', '内', '外', '左', '右', '前', '后'],
  nationStems: ['青', '玄', '赤', '白', '金', '苍', '曜', '澜', '岳', '衡', '辰', '羲'],
  nationSuffixes: ['王国', '帝国', '联邦', '共和国', '公国', '合众国'],
  seatStems: ['安', '平', '宁', '远', '新', '昌', '文', '武', '清', '河', '云', '岚']
}

const WESTERN: PlaceNamingProfile = {
  style: 'western',
  provinceStems: ['Valen', 'Arden', 'Mere', 'Thorn', 'Ashford', 'Glenmere', 'Riven', 'Stormhold', 'Elden', 'Westmarch'],
  prefectureStems: ['Oak', 'Fair', 'Stone', 'Grey', 'High', 'Low', 'Green', 'Red', 'Silver', 'Iron'],
  countyPrefixes: ['Oak', 'Fair', 'Stone', 'Mill', 'Bridge', 'Ford', 'Hill', 'Lake', 'Bay', 'Field'],
  prefectureQualifiers: ['Upper', 'Lower', 'Inner', 'Outer', 'North', 'South', 'East', 'West'],
  nationStems: ['Valen', 'Arden', 'Mere', 'Thorn', 'Elden', 'Riven', 'Ashford', 'Glenmere', 'Storm', 'Westmarch'],
  nationSuffixes: ['Kingdom', 'Empire', 'Republic', 'Confederation', 'Duchy', 'Union'],
  seatStems: ['Oak', 'Fair', 'Stone', 'Mill', 'Bridge', 'Ford', 'Hill', 'Lake', 'Bay', 'Field']
}

const JAPANESE: PlaceNamingProfile = {
  style: 'japanese',
  provinceStems: ['青葉', '駿河', '越後', '近江', '武蔵', '出羽', '安芸', '肥前', '日向', '陆奥'],
  prefectureStems: ['安', '平', '宁', '远', '新', '昌', '文', '武', '清', '河'],
  countyPrefixes: ['安', '平', '宁', '远', '新', '昌', '文', '武', '清', '河'],
  prefectureQualifiers: ['上', '下', '内', '外', '东', '西', '南', '北'],
  nationStems: ['青葉', '骏河', '越后', '近江', '武蔵', '出羽', '安艺', '肥前', '日向', '陆奥'],
  nationSuffixes: ['幕府', '王国', '公国', '联邦', '共和国', '帝国'],
  seatStems: ['安', '平', '宁', '远', '新', '昌', '文', '武', '清', '河']
}

const FANTASY: PlaceNamingProfile = {
  style: 'fantasy',
  provinceStems: ['Valdris', 'Elyndor', 'Korath', 'Myrrhan', 'Sylvara', 'Drakmere', 'Aurelion', 'Nethis'],
  prefectureStems: ['Kael', 'Vorn', 'Thal', 'Ryn', 'Ash', 'Morn', 'Dusk', 'Lorn'],
  countyPrefixes: ['Kael', 'Vorn', 'Thal', 'Ryn', 'Ash', 'Morn', 'Dusk', 'Lorn'],
  prefectureQualifiers: ['High', 'Low', 'Deep', 'Outer', 'Inner', 'Far', 'Near', 'Old'],
  nationStems: ['Valdris', 'Elyndor', 'Korath', 'Myrrhan', 'Sylvara', 'Drakmere', 'Aurelion', 'Nethis'],
  nationSuffixes: ['Realm', 'Dominion', 'Covenant', 'March', 'League', 'Ascendancy'],
  seatStems: ['Kael', 'Vorn', 'Thal', 'Ryn', 'Ash', 'Morn', 'Dusk', 'Lorn']
}

const PROFILES: Record<Exclude<PlaceNamingStyle, 'mixed'>, PlaceNamingProfile> = {
  chinese: CHINESE,
  western: WESTERN,
  japanese: JAPANESE,
  fantasy: FANTASY
}

const MIXED_ROTATION: Exclude<PlaceNamingStyle, 'mixed'>[] = [
  'chinese',
  'western',
  'japanese',
  'fantasy'
]

export function normalizePlaceNamingStyle(
  style?: PlaceNamingStyle | string | null
): PlaceNamingStyle {
  if (style && style in PROFILES) return style as Exclude<PlaceNamingStyle, 'mixed'>
  if (style === 'mixed') return 'mixed'
  return 'chinese'
}

export function placeNamingStyleLabel(style: PlaceNamingStyle): string {
  return PLACE_NAMING_STYLE_OPTIONS.find((o) => o.id === style)?.label ?? style
}

/** 混合模式下按国家序号选定单一风格，避免一国混用多种语种 */
export function namingProfileForNation(
  config: WorldGenConfig,
  nationIndex: number
): PlaceNamingProfile {
  const style = normalizePlaceNamingStyle(config.placeNamingStyle)
  if (style !== 'mixed') return PROFILES[style]
  const pick = MIXED_ROTATION[nationIndex % MIXED_ROTATION.length]
  return PROFILES[pick]
}

export function namingStyleBriefLine(config: WorldGenConfig): string {
  const style = normalizePlaceNamingStyle(config.placeNamingStyle)
  const label = placeNamingStyleLabel(style)
  if (style === 'mixed') {
    return `命名风格：混合（各国在 ${MIXED_ROTATION.map(placeNamingStyleLabel).join(' / ')} 中择一，同国城市语种一致；聚落专名宜 2–5 字）`
  }
  return `命名风格：${label}（placeNamingStyle=${style}；聚落专名宜 2–5 字，国名≤8 字，避免音译堆砌）`
}

export function generateAutoNationName(
  profile: PlaceNamingProfile,
  index: number,
  rand: () => number
): string {
  const stem = profile.nationStems[index % profile.nationStems.length]
  const suffix = profile.nationSuffixes[Math.floor(rand() * profile.nationSuffixes.length)]
  if (profile.style === 'western') return `${stem} ${suffix}`
  if (profile.style === 'fantasy') return `${stem} ${suffix}`
  return `${stem}${suffix}`
}

export function formatProvinceAdminName(
  profile: PlaceNamingProfile,
  stem: string,
  nationShort: string,
  dirPrefix: string
): string {
  const d = dirPrefix
  switch (profile.style) {
    case 'western':
      return `${d}${stem} Province`.replace(/\s+/g, ' ').trim()
    case 'japanese':
      return `${d}${stem}${nationShort}国`
    case 'fantasy':
      return `${d}${stem} Marches`.replace(/\s+/g, ' ').trim()
    case 'chinese':
    default:
      return `${d}${stem}${nationShort}行省`
  }
}

export function formatPrefectureAdminName(
  profile: PlaceNamingProfile,
  stem: string,
  qualifier: string,
  dirPrefix: string
): string {
  const d = dirPrefix
  switch (profile.style) {
    case 'western': {
      const q = qualifier.toLowerCase()
      if (['upper', 'lower', 'inner', 'outer'].includes(q)) return `${d}${q} ${stem}`.trim()
      return `${d}${stem}shire`.trim()
    }
    case 'japanese':
      return `${d}${stem}${qualifier}府`
    case 'fantasy':
      return `${d}${qualifier} ${stem} Hold`.replace(/\s+/g, ' ').trim()
    case 'chinese':
    default:
      return `${d}${stem}${qualifier}府`
  }
}

export function formatCountyAdminName(
  profile: PlaceNamingProfile,
  prefix: string
): string {
  switch (profile.style) {
    case 'western':
      return `${prefix} County`
    case 'japanese':
      return `${prefix}郡`
    case 'fantasy':
      return `${prefix} Vale`
    case 'chinese':
    default:
      return `${prefix}县`
  }
}

export function formatProvincialSeatName(profile: PlaceNamingProfile, adminName: string): string {
  const { dir, core } = extractSeatStem(adminName, profile)
  switch (profile.style) {
    case 'western':
      return `${dir}${dir ? ' ' : ''}${core}burg`.trim()
    case 'japanese':
      return `${dir}${core}城`
    case 'fantasy':
      return `${dir}${dir ? ' ' : ''}${core} Keep`.trim()
    case 'chinese':
    default:
      return `${dir}${core}城`
  }
}

export function formatPrefectureSeatName(profile: PlaceNamingProfile, adminName: string): string {
  const { dir, core } = extractSeatStem(adminName, profile)
  switch (profile.style) {
    case 'western':
      return `${dir}${dir ? ' ' : ''}${core}ton`.trim()
    case 'japanese':
      return `${dir}${core}府`
    case 'fantasy':
      return `${dir}${dir ? ' ' : ''}${core} Hold`.trim()
    case 'chinese':
    default:
      return `${dir}${core}府`
  }
}

export function formatCountySeatName(profile: PlaceNamingProfile, adminName: string): string {
  const { dir, core } = extractSeatStem(adminName, profile)
  switch (profile.style) {
    case 'western':
      return `${dir}${dir ? ' ' : ''}${core}ton`.trim()
    case 'japanese':
      return `${dir}${core}町`
    case 'fantasy':
      return `${dir}${dir ? ' ' : ''}${core} Vale`.trim()
    case 'chinese':
    default:
      return `${dir}${core}镇`
  }
}

const CHINESE_DIR_PREFIX = /^(东北|西北|东南|西南|东|西|南|北)/
const ADMIN_SUFFIX_RE =
  /\s+(Province|Marches|County|Hold|Vale|shire|Realm|Citadel|Keep|Court|burg|ton|Haven|Crown)$/i

/** 从行省/府县名提取短专名，避免治所名整段复制区划全称 */
export function extractSeatStem(
  adminName: string,
  profile: PlaceNamingProfile
): { dir: string; core: string } {
  let s = adminName.trim()
  let dir = ''

  if (profile.style === 'western' || profile.style === 'fantasy') {
    for (const d of WESTERN_LEADING_DIRECTIONS) {
      if (s.toLowerCase().startsWith(`${d.toLowerCase()} `)) {
        dir = d
        s = s.slice(d.length).trim()
        break
      }
    }
  } else {
    const m = s.match(CHINESE_DIR_PREFIX)
    if (m) {
      dir = m[1]
      s = s.slice(dir.length)
    }
  }

  s = s.replace(ADMIN_SUFFIX_RE, '').replace(/(行省|府城|府|县|郡|国|城|镇|町)$/, '')
  const firstWord = s.split(/\s+/).filter(Boolean)[0] ?? s

  if (profile.style === 'chinese' || profile.style === 'japanese') {
    const chars = [...firstWord.replace(/\s/g, '')]
    return { dir, core: chars.slice(0, 2).join('') || firstWord.slice(0, 2) }
  }

  return { dir, core: firstWord.slice(0, 6) || s.slice(0, 6) }
}

export function formatCapitalName(profile: PlaceNamingProfile, rand: () => number): string {
  const stem = profile.seatStems[Math.floor(rand() * profile.seatStems.length)]
  switch (profile.style) {
    case 'western':
      return `${stem}burg`
    case 'japanese':
      return `${stem}京`
    case 'fantasy':
      return `${stem} Crown`
    case 'chinese':
    default:
      return `${stem}京`
  }
}

export function formatTownName(profile: PlaceNamingProfile, rand: () => number): string {
  const stem = profile.seatStems[Math.floor(rand() * profile.seatStems.length)]
  switch (profile.style) {
    case 'western':
      return `${stem}ton`
    case 'japanese':
      return `${stem}町`
    case 'fantasy':
      return `${stem} Haven`
    case 'chinese':
    default:
      return `${stem}镇`
  }
}

/** 西式方位前缀（仅当名称已含方向时使用校正） */
export const WESTERN_LEADING_DIRECTIONS = [
  'Northeast',
  'Northwest',
  'Southeast',
  'Southwest',
  'North',
  'South',
  'East',
  'West'
] as const

const GEO_TO_WESTERN: Record<string, string> = {
  东北: 'Northeast',
  西北: 'Northwest',
  东南: 'Southeast',
  西南: 'Southwest',
  北: 'North',
  南: 'South',
  东: 'East',
  西: 'West'
}

export function westernDirectionPrefix(geo: string): string {
  return GEO_TO_WESTERN[geo] ?? ''
}

export function isDefaultNationName(name: string): boolean {
  return /^国家\d+$/.test(name.trim())
}

/** 是否建议大模型润色国名（占位名或仍为默认「国家N」） */
export function nationNameNeedsPolish(name: string, profile: PlaceNamingProfile): boolean {
  const t = name.trim()
  if (!t || isDefaultNationName(t)) return true
  if (profile.style === 'western') {
    return profile.nationStems.some((s) => t.startsWith(s))
  }
  if (profile.style === 'chinese' || profile.style === 'japanese') {
    return profile.nationStems.some((s) => t.startsWith(s))
  }
  return profile.nationStems.some((s) => t.startsWith(s))
}

export function pickNamingRand(config: WorldGenConfig, seed: number, salt: number): () => number {
  return seededRandom((seed + salt) % 65536)
}
