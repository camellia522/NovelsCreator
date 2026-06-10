import type { KnowledgeDocument } from '@/types/project'
import {
  formatAtmosphereTags,
  readWorldSettingFields,
  refreshWorldSettingConstraints
} from '@/utils/world-setting-catalog'
import { syncKnowledgeWorldAndMap } from '@/utils/world-settings-map-bridge'

export interface OutlinePreflightResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/** 落盘/送 Dify 前刷新 settingConstraints 并与 map 对齐 */
export function prepareKnowledgeForOutline(knowledge: KnowledgeDocument): void {
  syncKnowledgeWorldAndMap(knowledge)
  refreshWorldSettingConstraints(knowledge.world, knowledge.map)
}

export function validateKnowledgeForOutline(knowledge: KnowledgeDocument): OutlinePreflightResult {
  const errors: string[] = []
  const warnings: string[] = []

  prepareKnowledgeForOutline(knowledge)

  const chars = knowledge.characters ?? []
  const protagonist = chars.find((c) => c.role === '主角' || c.role === 'protagonist')
  if (!protagonist?.name?.trim()) {
    errors.push('请在「设定 → 人物」中登记一名主角并填写姓名（如周衍）')
  }

  const nations = knowledge.map?.nations ?? []
  const locations = knowledge.locations ?? []
  if (!nations.length) {
    errors.push('地图中须至少有 1 个国家（请在地图编辑中保存领土）')
  }
  if (!locations.length) {
    errors.push('须至少有 1 个地点（都城/城市，请保存 locations）')
  }

  const fields = readWorldSettingFields(knowledge.world, knowledge.map)
  if (fields.magicConstraint.includes('无魔法') || fields.magicConstraint.includes('无超自然')) {
    const rules = `${knowledge.world.rules ?? ''} ${knowledge.world.title ?? ''}`
    if (/创业|商战|都市白领|现代公司|互联网|融资|上市/.test(rules)) {
      warnings.push(
        '「补充设定」含现代创业/商战用语，与「无魔法史诗」易冲突；建议改为架空权谋/边关/帝国题材描述'
      )
    }
  }

  if (fields.scene === '都市' && (fields.genre === '史诗' || fields.mapScale === 'continent')) {
    warnings.push('场景为「都市」但题材/尺度为史诗大陆；建议改为「大陆」或「帝国疆域」')
  }

  const constraints = knowledge.world.settingConstraints?.trim()
  if (!constraints || constraints.length < 120) {
    warnings.push('硬性设定过短：请在「设定 → 世界」点选分类后保存')
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function resolveOutlineGenreTone(
  knowledge: KnowledgeDocument,
  options?: { genre?: string; tone?: string }
): { genre: string; tone: string; era: string } {
  const fields = readWorldSettingFields(knowledge.world, knowledge.map)
  return {
    genre: options?.genre?.trim() || fields.genre,
    tone: options?.tone?.trim() || formatAtmosphereTags(fields.atmosphere),
    era: fields.era
  }
}

/** 构建送入 Dify 的 genre 字段（含时代，避免 O1 误判为现代） */
export function formatOutlineGenreForDify(knowledge: KnowledgeDocument, genreOverride?: string): string {
  const { genre, era } = resolveOutlineGenreTone(knowledge, { genre: genreOverride })
  return `${genre}（${era}）`
}
