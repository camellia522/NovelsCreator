import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface WizardCharacter {
  id: string
  name: string
  appearanceTags: string[]
  appearanceDesc: string
  personality: string
  worldview: string
  values: string
  speech: string
  chapterGoal: string
}

export interface WizardPromptMeta {
  chapterTitle?: string
  worldBrief?: string
  chapterLocation?: {
    id: string
    name: string
    type: string
    description: string
  } | null
}

export const useWizardStore = defineStore('wizard', () => {
  const chapterId = ref('ch-001')
  const step = ref(0)
  const era = ref('现代')
  const scene = ref('都市')
  const scenePlace = ref('')
  const atmosphere = ref<string[]>(['悬疑'])
  const envNote = ref('')
  const useProjectWorld = ref(true)
  const chapterLocationId = ref('')
  const characters = ref<WizardCharacter[]>([])
  const plotGoal = ref('')
  const conflict = ref('人 vs 人')
  const beats = ref<{ order: number; text: string }[]>([])
  const tone = ref('紧张')
  const syncKnowledge = ref(false)
  const openTabsAfter = ref(true)

  const steps = ['环境', '人物', '情节', '预览']

  const briefText = computed(() => {
    const charLines = characters.value
      .map(
        (c) =>
          `${c.name}：${c.personality}；三观${c.worldview}/${c.values}；目标${c.chapterGoal || '—'}`
      )
      .join('；')
    const beatLines = beats.value.map((b) => `${b.order}.${b.text}`).join(' ')
    const envParts = [
      `${era.value}·${scene.value}${scenePlace.value.trim() ? `·${scenePlace.value.trim()}` : ''}·${atmosphere.value.join('/')}`
    ]
    if (envNote.value.trim()) envParts.push(envNote.value.trim())
    if (useProjectWorld.value && worldBriefCache.value) {
      envParts.push(`世界观：${worldBriefCache.value.replace(/\n/g, '；')}`)
    }
    return [
      `【环境】${envParts.join('；')}`,
      `【人物】${charLines || '（未配置）'}`,
      `【情节】目标：${plotGoal.value}；冲突：${conflict.value}；节拍：${beatLines}；基调：${tone.value}`
    ].join('\n')
  })

  const worldBriefCache = ref('')

  function setWorldBrief(text: string): void {
    worldBriefCache.value = text
  }

  function reset(id: string): void {
    chapterId.value = id
    step.value = 0
    era.value = '现代'
    scene.value = '都市'
    scenePlace.value = ''
    atmosphere.value = ['悬疑']
    envNote.value = ''
    useProjectWorld.value = true
    chapterLocationId.value = ''
    worldBriefCache.value = ''
    characters.value = []
    plotGoal.value = ''
    conflict.value = '人 vs 人'
    beats.value = []
    tone.value = '紧张'
    syncKnowledge.value = false
    openTabsAfter.value = true
  }

  function generationPromptJson(meta?: WizardPromptMeta): string {
    return JSON.stringify(
      {
        version: '1.0',
        chapter: {
          id: chapterId.value,
          title: meta?.chapterTitle ?? chapterId.value
        },
        environment: {
          era: era.value,
          scene: scene.value,
          scenePlace: scenePlace.value.trim(),
          atmosphere: atmosphere.value,
          note: envNote.value,
          worldRulesRef: useProjectWorld.value,
          worldSummary: useProjectWorld.value ? meta?.worldBrief ?? worldBriefCache.value : '',
          chapterLocation: meta?.chapterLocation ?? null
        },
        characters: characters.value,
        plot: {
          chapterGoal: plotGoal.value,
          conflict: conflict.value,
          tone: tone.value,
          beats: beats.value
        },
        meta: {
          assembledAt: new Date().toISOString(),
          source: 'generation-wizard'
        }
      },
      null,
      0
    )
  }

  return {
    chapterId,
    step,
    steps,
    era,
    scene,
    scenePlace,
    atmosphere,
    envNote,
    useProjectWorld,
    chapterLocationId,
    characters,
    plotGoal,
    conflict,
    beats,
    tone,
    syncKnowledge,
    openTabsAfter,
    briefText,
    setWorldBrief,
    reset,
    generationPromptJson
  }
})
