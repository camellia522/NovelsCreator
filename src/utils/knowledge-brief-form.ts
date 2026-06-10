import type { KnowledgeCharacter, KnowledgeDocument } from '@/types/project'
import type { KnowledgeGenerationMode } from '@/types/api'
import { readWorldSettingFields } from '@/utils/world-setting-catalog'

export type { KnowledgeGenerationMode }

export interface KnowledgeBriefFormState {
  worldTitle: string
  genreEra: string
  magicSystem: string
  taboos: string
  protagonist: string
  coreConflict: string
  openingHook: string
  targetNations: number
  targetCharacters: number
  targetSecretFactions: number
  targetItems: number
  whitelistNations: string
  whitelistCharacters: string
  whitelistVillain: string
  whitelistFactions: string
  whitelistItems: string
  narrativeStyle: string
  politicalTone: string
  warfareStyle: string
}

export interface KnowledgeExistingStats {
  nationNames: string[]
  characterLines: string[]
  factionNames: string[]
  itemNames: string[]
  nationCount: number
  characterCount: number
  factionCount: number
  itemCount: number
}

const DEFAULT_TARGETS = {
  nations: 4,
  characters: 6,
  secretFactions: 2,
  items: 3
} as const

function trim(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function joinNames(items: string[]): string {
  return items.map((s) => s.trim()).filter(Boolean).join('、')
}

function findProtagonist(characters: KnowledgeCharacter[]): KnowledgeCharacter | undefined {
  return (
    characters.find((c) => /主角|主人公|protagonist/i.test(trim(c.role))) ??
    characters.find((c) => trim(c.name))
  )
}

function formatProtagonist(char: KnowledgeCharacter | undefined): string {
  if (!char?.name?.trim()) return ''
  const parts = [char.name.trim()]
  if (char.role?.trim()) parts.push(char.role.trim())
  if (char.notes?.trim()) parts.push(char.notes.trim())
  return parts.join('，')
}

function villainFromCharacters(characters: KnowledgeCharacter[]): string {
  const v = characters.find((c) =>
    /反派| antagonist|恶人|敌人|宿敌/i.test(`${c.role ?? ''} ${c.notes ?? ''}`)
  )
  return v?.name?.trim() ?? ''
}

function taboosFromWorld(doc: KnowledgeDocument): string {
  const world = doc.world
  const raw = world.contentTaboos
  if (Array.isArray(raw)) return joinNames(raw.map(String))
  const text = trim(raw)
  if (text) return text
  const rules = trim(world.rules)
  if (rules.length > 200) return ''
  return rules
}

export function collectKnowledgeExistingStats(doc: KnowledgeDocument): KnowledgeExistingStats {
  const nationNames = (doc.map?.nations ?? []).map((n) => trim(n.name)).filter(Boolean)
  const characterLines = (doc.characters ?? [])
    .filter((c) => trim(c.name))
    .map((c) => {
      const role = trim(c.role)
      return role ? `${c.name.trim()}（${role}）` : c.name.trim()
    })
  const factionNames = (doc.factions ?? []).map((f) => trim(f.name)).filter(Boolean)
  const itemNames = (doc.items ?? []).map((i) => trim(i.name)).filter(Boolean)

  return {
    nationNames,
    characterLines,
    factionNames,
    itemNames,
    nationCount: nationNames.length,
    characterCount: characterLines.length,
    factionCount: factionNames.length,
    itemCount: itemNames.length
  }
}

function defaultTargets(mode: KnowledgeGenerationMode, stats: KnowledgeExistingStats) {
  if (mode === 'bootstrap') {
    return {
      targetNations: Math.max(DEFAULT_TARGETS.nations, stats.nationCount),
      targetCharacters: Math.max(DEFAULT_TARGETS.characters, stats.characterCount),
      targetSecretFactions: Math.max(DEFAULT_TARGETS.secretFactions, stats.factionCount),
      targetItems: Math.max(DEFAULT_TARGETS.items, stats.itemCount)
    }
  }
  return {
    targetNations: Math.max(0, DEFAULT_TARGETS.nations - stats.nationCount),
    targetCharacters: Math.max(0, DEFAULT_TARGETS.characters - stats.characterCount),
    targetSecretFactions: Math.max(0, DEFAULT_TARGETS.secretFactions - stats.factionCount),
    targetItems: Math.max(0, DEFAULT_TARGETS.items - stats.itemCount)
  }
}

export function buildKnowledgeBriefForm(
  doc: KnowledgeDocument,
  mode: KnowledgeGenerationMode
): KnowledgeBriefFormState {
  const world = doc.world ?? { title: '', rules: '' }
  const fields = readWorldSettingFields(world, doc.map)
  const stats = collectKnowledgeExistingStats(doc)
  const hero = findProtagonist(doc.characters ?? [])
  const targets = defaultTargets(mode, stats)

  const genreEra = [fields.genre, fields.era].filter((s) => s && s !== '未指定').join(' · ')
  const magicSystem = [fields.magicConstraint, fields.techLevel].filter(Boolean).join('；')
  const supportingChars = (doc.characters ?? [])
    .filter((c) => c.id !== hero?.id && trim(c.name))
    .map((c) => (c.role?.trim() ? `${c.name.trim()}（${c.role.trim()}）` : c.name.trim()))

  return {
    worldTitle: trim(world.title) || '未命名世界',
    genreEra,
    magicSystem: magicSystem || trim(world.magicConstraint) || trim(world.settingConstraints).slice(0, 120),
    taboos: taboosFromWorld(doc),
    protagonist: formatProtagonist(hero),
    coreConflict: trim(world.conflictFocus) || trim(world.rules).slice(0, 160),
    openingHook: '',
    ...targets,
    whitelistNations: joinNames(stats.nationNames),
    whitelistCharacters: joinNames(supportingChars),
    whitelistVillain: villainFromCharacters(doc.characters ?? []),
    whitelistFactions: joinNames(stats.factionNames),
    whitelistItems: joinNames(stats.itemNames),
    narrativeStyle: trim(world.narrativeStyle),
    politicalTone: trim(world.politicalTone),
    warfareStyle: trim(world.warfareStyle)
  }
}

function countLine(label: string, target: number, existing: number, unit: string): string | null {
  if (target <= 0 && existing <= 0) return null
  if (target <= 0) {
    return `- 深化已有 ${existing} ${unit}${label}（仅文案，不写地图坐标）`
  }
  const prefix = existing > 0 ? `再增加 ${target} ${unit}（已有 ${existing} ${unit}）` : `${target} ${unit}`
  return `- ${prefix}${label}`
}

export function composeKnowledgeBrief(
  form: KnowledgeBriefFormState,
  mode: KnowledgeGenerationMode,
  stats: KnowledgeExistingStats
): string {
  const lines: string[] = []
  const title = form.worldTitle.trim() || '未命名世界'

  if (mode === 'expand' && (stats.characterCount || stats.factionCount || stats.itemCount)) {
    lines.push(
      `在现有知识库「${title}」基础上扩充（保留已有 id 与姓名，按 id 合并）。`,
      `当前已有：${stats.characterCount} 人物、${stats.factionCount} 势力、${stats.itemCount} 道具${
        stats.nationCount ? `；地图国家 ${joinNames(stats.nationNames)}` : ''
      }。`
    )
  } else {
    lines.push(`架空世界「${title}」知识库生成。`)
  }

  const hookParts: string[] = []
  if (form.protagonist.trim()) hookParts.push(`主角 ${form.protagonist.trim()}`)
  if (form.coreConflict.trim()) hookParts.push(form.coreConflict.trim())
  if (form.openingHook.trim()) hookParts.push(form.openingHook.trim())
  if (hookParts.length) lines.push(hookParts.join('。') + '。')

  const settingParts: string[] = []
  if (form.genreEra.trim()) settingParts.push(`题材/时代：${form.genreEra.trim()}`)
  if (form.magicSystem.trim()) settingParts.push(`力量体系：${form.magicSystem.trim()}`)
  if (form.taboos.trim()) settingParts.push(`叙事禁忌：${form.taboos.trim()}`)
  if (settingParts.length) lines.push(settingParts.join('。') + '。')

  lines.push('', '需生成：')
  const qtyLines = [
    countLine('国家/政权背景', form.targetNations, stats.nationCount, '个'),
    countLine('核心角色（含反派）', form.targetCharacters, stats.characterCount, '名'),
    countLine('秘密势力', form.targetSecretFactions, stats.factionCount, '个'),
    countLine('关键道具', form.targetItems, stats.itemCount, '件')
  ].filter(Boolean) as string[]
  lines.push(...(qtyLines.length ? qtyLines : ['- 按上述设定完善 world / characters / factions / items']))

  const whitelist: string[] = []
  if (form.whitelistNations.trim()) whitelist.push(`国家/政权：${form.whitelistNations.trim()}`)
  if (form.protagonist.trim()) {
    const heroName = form.protagonist.trim().split(/[，,]/)[0]
    if (heroName) whitelist.push(`主角：${heroName}`)
  }
  if (form.whitelistCharacters.trim()) whitelist.push(`主要配角：${form.whitelistCharacters.trim()}`)
  if (form.whitelistVillain.trim()) whitelist.push(`反派：${form.whitelistVillain.trim()}`)
  if (form.whitelistFactions.trim()) whitelist.push(`组织/势力：${form.whitelistFactions.trim()}`)
  if (form.whitelistItems.trim()) whitelist.push(`关键道具：${form.whitelistItems.trim()}`)
  if (whitelist.length) {
    lines.push('', '实体白名单：', ...whitelist.map((w) => `- ${w}`))
  }

  const styleParts = [form.narrativeStyle, form.politicalTone, form.warfareStyle]
    .map((s) => s.trim())
    .filter(Boolean)
  if (styleParts.length) {
    lines.push('', `风格：${styleParts.join('；')}。`)
  }

  lines.push('', '注意：不输出 map/locations/nations 坐标；国家背景可写入 factions 文案。')
  return lines.join('\n').trim()
}

export function validateKnowledgeBriefForm(form: KnowledgeBriefFormState): string | null {
  if (!form.worldTitle.trim() && !form.protagonist.trim()) {
    return '请填写世界名或主角'
  }
  const totalQty =
    form.targetNations + form.targetCharacters + form.targetSecretFactions + form.targetItems
  if (totalQty <= 0 && !form.coreConflict.trim() && !form.openingHook.trim()) {
    return '生成数量均为 0 时，请填写核心冲突或开篇悬念'
  }
  return null
}

export function fieldFilled(value: string | number | undefined): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0
  return Boolean(trim(value))
}
