import type {

  ChapterSummaryEntry,

  KnowledgeDocument,

  OutlineDocument,

  PlotMemoryDocument

} from '@/types/project'

import {

  buildCompiledSettingConstraints,

  formatContentTaboos,

  getMagicConstraintSpec,

  readWorldSettingFields,

  mapScaleLabel,

  climateLabel

} from '@/utils/world-setting-catalog'
import { buildGlobalSummaryFromChapterSummaries } from '@/utils/plot-memory-global'



function chapterNumericId(chapterId: string): number | null {

  const m = /^ch-(\d{3})$/.exec(chapterId.trim())

  if (!m) return null

  return parseInt(m[1], 10)

}



const EMPTY_MEMORY: PlotMemoryDocument = {

  version: 1,

  globalSummary: '',

  chapterSummaries: [],

  foreshadowing: []

}



/**

 * 大纲串行生成用：只传递「已写入 outline 且序号小于 next_chapter_id」的章摘要，

 * 避免正文记忆与新建大纲节拍互相「吃书」。

 */

export function filterPlotMemoryForOutline(

  memory: PlotMemoryDocument,

  nextChapterId: string,

  outlineChapterIds: string[],

  usePlotMemory: boolean

): PlotMemoryDocument {

  if (!usePlotMemory) return { ...EMPTY_MEMORY, foreshadowing: memory.foreshadowing ?? [] }



  const nextNum = chapterNumericId(nextChapterId)

  const idSet = new Set(outlineChapterIds)

  const outlineHasChapters = idSet.size > 0



  if (!outlineHasChapters && nextNum === 1) {

    return { ...EMPTY_MEMORY, foreshadowing: memory.foreshadowing ?? [] }

  }



  const summaries = (memory.chapterSummaries ?? []).filter((entry) => {

    const num = chapterNumericId(entry.chapterId)

    if (num == null) return false

    if (nextNum != null && num >= nextNum) return false

    if (outlineHasChapters && !idSet.has(entry.chapterId)) return false

    return Boolean(entry.summary?.trim() || entry.keyEvents?.length)

  })



  let globalSummary = memory.globalSummary?.trim() ?? ''

  if (!summaries.length && nextNum === 1) {

    globalSummary = ''

  }



  return {

    version: memory.version ?? 1,

    globalSummary,

    chapterSummaries: summaries,

    foreshadowing: memory.foreshadowing ?? []

  }

}



/**

 * 用 outline.json 中已落盘章节的 beats 覆盖剧情记忆摘要，

 * 避免正文生成留下的旧摘要（如不同主角名）导致 O2 吃书熔断。

 */

export function syncPlotMemoryFromOutlineBeats(

  memory: PlotMemoryDocument,

  outline: OutlineDocument,

  nextChapterId: string

): PlotMemoryDocument {

  const nextNum = chapterNumericId(nextChapterId)

  const prevById = new Map(

    (memory.chapterSummaries ?? []).map((s) => [s.chapterId, s] as const)

  )

  const synced: ChapterSummaryEntry[] = []



  for (const vol of outline.volumes ?? []) {

    for (const ch of vol.chapters ?? []) {

      const num = chapterNumericId(ch.id)

      if (num == null || (nextNum != null && num >= nextNum)) continue



      const beats = (ch.beats ?? []).map((b) => b.text.trim()).filter(Boolean)

      const prev = prevById.get(ch.id)

      if (!beats.length) {

        if (prev) synced.push(prev)

        continue

      }



      synced.push({

        chapterId: ch.id,

        title: ch.title,

        summary: beats.join('；'),

        keyEvents: beats.slice(0, 8),

        characterStates: prev?.characterStates ?? [],

        openThreads: prev?.openThreads ?? [],

        updatedAt: new Date().toISOString()

      })

    }

  }



  synced.sort((a, b) => a.chapterId.localeCompare(b.chapterId))



  const globalSummary = buildGlobalSummaryFromChapterSummaries(synced)



  return {

    version: memory.version ?? 1,

    globalSummary,

    chapterSummaries: synced,

    foreshadowing: memory.foreshadowing ?? []

  }

}



/** 注入 brief 顶部，约束 O1 使用 knowledge 已有实体 */

export function buildKnowledgeAnchorBrief(knowledge: KnowledgeDocument): string {

  const world = knowledge.world ?? { title: '', rules: '' }

  const fields = readWorldSettingFields(world, knowledge.map)

  const magicSpec = getMagicConstraintSpec(fields.magicConstraint)

  const rules = world.rules?.trim() ?? ''

  const characters = knowledge.characters ?? []

  const charNames = characters.map((c) => c.name).filter(Boolean)

  const factionNames = (knowledge.factions ?? []).map((f) => f.name).filter(Boolean)

  const nationNames = (knowledge.map?.nations ?? []).map((n) => n.name).filter(Boolean)

  const locationNames = (knowledge.locations ?? []).slice(0, 24).map((l) => l.name).filter(Boolean)



  const protagonist =

    characters.find((c) => c.role === '主角' || c.role === 'protagonist')?.name?.trim() || charNames[0]



  const capitals = (knowledge.locations ?? []).filter((l) => l.type === 'capital').map((l) => l.name)

  const mustUsePlaces = [

    ...new Set([fields.scenePlace, ...capitals, ...locationNames.slice(0, 8)].filter(Boolean))

  ]



  const mustUseEntities = [...new Set([...nationNames, ...factionNames, ...charNames, ...mustUsePlaces])].slice(

    0,

    36

  )



  const compiled =

    world.settingConstraints?.trim() || buildCompiledSettingConstraints(world, knowledge.map)



  const rulesExcerpt = rules.length > 480 ? `${rules.slice(0, 480)}…` : rules

  const taboos = formatContentTaboos(fields.contentTaboos)



  const lines = [

    '【设定锚点 · 硬性 · O1/O2 必须遵守】',

    compiled,

    `- 时代 ${fields.era} · 题材 ${fields.genre} · 场景 ${fields.scene}${fields.scenePlace ? `（${fields.scenePlace}）` : ''}`,

    `- 地图尺度 ${mapScaleLabel(fields.mapScale)} · 气候 ${climateLabel(fields.climate)} · 科技 ${fields.techLevel}`,

    `- 力量体系：${fields.magicConstraint}。严禁：${magicSpec.forbidden}`,

    taboos ? `- 创作禁忌：${taboos}` : '',

    rulesExcerpt ? `- 作者补充设定：${rulesExcerpt}` : '',

    '',

    '【实体白名单 · beats 须使用以下已登记名称，禁止自造替代】',

    protagonist ? `- 主角（必须出现姓名）：${protagonist}` : '- 主角：见 knowledge_snapshot.characters',

    nationNames.length ? `- 国家：${nationNames.join('、')}` : '',

    mustUsePlaces.length ? `- 地点/都城（至少出现 1 个）：${mustUsePlaces.join('、')}` : '',

    factionNames.length ? `- 势力：${factionNames.join('、')}` : '',

    charNames.length ? `- 人物：${charNames.join('、')}` : '',

    mustUseEntities.length

      ? `- 综合白名单：${mustUseEntities.join('、')}`

      : '- 须使用 knowledge 已有实体，禁止自造重要国名/城名/主角名',

    '',

    '【执行纪律】',

    '- 禁止修仙/魔教/灵力/丹道/宗门秘法/法术/穿越/系统（除非力量体系明确允许）',

    '- 禁止替换主角、禁止 silent retcon',

    '- plot_memory 与 existing_volume_outline 冲突时，以 existing_volume_outline 为准',

    '- 新章须因果承接 existing_volume_outline 最后一章 beats，不得吃书'

  ].filter(Boolean)



  return lines.join('\n')

}



export function mergeOutlineBriefWithAnchor(userBrief: string, anchor: string): string {

  const brief = userBrief.trim()

  if (brief.includes('【设定锚点')) return brief

  return brief ? `${anchor}\n\n${brief}` : anchor

}


