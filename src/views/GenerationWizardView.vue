<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLayoutStore } from '@/stores/layout.store'
import { useOutlineStore } from '@/stores/outline.store'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useWizardStore, type WizardCharacter } from '@/stores/wizard.store'
import { useDifyStore } from '@/stores/dify.store'
import { useEditorStore } from '@/stores/editor.store'
import { useUiStore } from '@/stores/ui.store'
import GenerationConsole from '@/components/console/GenerationConsole.vue'
import NcIcon from '@/components/icons/NcIcon.vue'
import { humanizeDifyError } from '@/utils/dify-error-message'
import {
  buildWorldBriefForWizard,
  chapterLocationPrompt,
  syncEnvironmentFromKnowledge,
  WIZARD_ERA_OPTIONS,
  WIZARD_SCENE_OPTIONS,
  WIZARD_ATMOSPHERE_OPTIONS
} from '@/utils/chapter-wizard-knowledge'

const router = useRouter()
const layout = useLayoutStore()
const outline = useOutlineStore()
const knowledge = useKnowledgeStore()
const wizard = useWizardStore()
const dify = useDifyStore()
const editor = useEditorStore()
const ui = useUiStore()

const props = defineProps<{ chapterId: string }>()

const genError = ref('')

const conflictOptions = ['人 vs 人', '人 vs 环境', '人 vs 自我', '人 vs 命运', '无明确冲突']
const toneOptions = ['紧张', '舒缓', '反转', '铺垫', '高潮', '余韵']

const eraOptions = computed(() => {
  const base = [...WIZARD_ERA_OPTIONS]
  if (wizard.era && !base.includes(wizard.era as (typeof WIZARD_ERA_OPTIONS)[number])) {
    base.push(wizard.era as (typeof WIZARD_ERA_OPTIONS)[number])
  }
  return base
})
const sceneOptions = computed(() => {
  const base = [...WIZARD_SCENE_OPTIONS]
  if (wizard.scene && !base.includes(wizard.scene as (typeof WIZARD_SCENE_OPTIONS)[number])) {
    base.push(wizard.scene as (typeof WIZARD_SCENE_OPTIONS)[number])
  }
  return base
})
const atmosphereOptions = [...WIZARD_ATMOSPHERE_OPTIONS]

const locationTypeLabel: Record<string, string> = {
  capital: '都城',
  city: '城市',
  town: '城镇',
  village: '村落',
  fortress: '要塞',
  landmark: '地标'
}

const worldBrief = computed(() =>
  knowledge.doc ? buildWorldBriefForWizard(knowledge.doc) : ''
)
const hasWorldData = computed(
  () =>
    !!(
      knowledge.doc?.map?.nations?.length ||
      knowledge.doc?.locations?.length ||
      knowledge.doc?.world.rules?.trim()
    )
)
const sortedLocations = computed(() => {
  const locs = knowledge.doc?.locations ?? []
  const priority = (t: string) =>
    ({ capital: 0, city: 1, town: 2, fortress: 3, landmark: 4, village: 5 })[t] ?? 9
  return [...locs].sort(
    (a, b) => priority(a.type) - priority(b.type) || a.name.localeCompare(b.name, 'zh-CN')
  )
})

const activeCharId = ref('')
const knowledgeHint = ref('')

const chapter = computed(() => outline.getChapter(props.chapterId))
const activeChar = computed(() => wizard.characters.find((c) => c.id === activeCharId.value))

function mapKnowledgeCharacter(c: {
  id: string
  name: string
  traits?: string[]
  personality?: string
  appearance?: string
}): WizardCharacter {
  return {
    id: c.id,
    name: c.name,
    appearanceTags: [...(c.traits ?? [])],
    appearanceDesc: c.appearance ?? '',
    personality: c.personality || c.traits?.[0] || '冷静',
    worldview: '守护',
    values: '正义',
    speech: '简短',
    chapterGoal: ''
  }
}

function syncAllFromKnowledge(): void {
  if (!knowledge.doc?.characters.length) return
  for (const c of knowledge.doc.characters) {
    if (wizard.characters.some((x) => x.id === c.id)) continue
    wizard.characters.push(mapKnowledgeCharacter(c))
  }
  if (!activeCharId.value && wizard.characters.length) {
    activeCharId.value = wizard.characters[0].id
  }
}

function initFromProject(): void {
  wizard.reset(props.chapterId)
  wizard.beats = [...(chapter.value?.beats ?? [])]
  wizard.plotGoal = chapter.value?.title ? `推进「${chapter.value.title}」` : ''

  if (knowledge.doc) {
    const env = syncEnvironmentFromKnowledge(knowledge.doc.world, knowledge.doc.map)
    wizard.era = env.era
    wizard.scene = env.scene
    wizard.scenePlace = env.scenePlace
    wizard.atmosphere = env.atmosphere
    if (env.envNote) wizard.envNote = env.envNote
    wizard.useProjectWorld = hasWorldData.value
    wizard.setWorldBrief(buildWorldBriefForWizard(knowledge.doc))
    const capitals = knowledge.doc.locations.filter((l) => l.type === 'capital')
    if (capitals.length === 1) wizard.chapterLocationId = capitals[0].id
  }

  syncAllFromKnowledge()
}

function wizardPromptMeta() {
  const loc = wizard.chapterLocationId
    ? knowledge.getLocation(wizard.chapterLocationId)
    : undefined
  return {
    chapterTitle: chapter.value?.title ?? props.chapterId,
    worldBrief: wizard.useProjectWorld ? worldBrief.value : '',
    chapterLocation: chapterLocationPrompt(loc)
  }
}

onMounted(async () => {
  if (!outline.doc) await outline.load()
  await knowledge.loadIfEmpty()
  initFromProject()
})

watch(
  () => wizard.step,
  (step) => {
    if (step === 1) syncAllFromKnowledge()
  }
)

function toggleAtmosphere(tag: string): void {
  const i = wizard.atmosphere.indexOf(tag)
  if (i >= 0) wizard.atmosphere.splice(i, 1)
  else if (wizard.atmosphere.length < 3) wizard.atmosphere.push(tag)
}

function addFromKnowledge(): void {
  knowledgeHint.value = ''
  if (!knowledge.doc?.characters.length) {
    knowledgeHint.value = '知识库暂无人物，请先在左侧「设定 → 人物」中添加并保存，或点击下方「新建向导人物」。'
    return
  }
  for (const c of knowledge.doc.characters) {
    if (wizard.characters.some((x) => x.id === c.id)) continue
    wizard.characters.push(mapKnowledgeCharacter(c))
    activeCharId.value = c.id
    return
  }
  knowledgeHint.value = '知识库人物已全部加入向导。'
}

function addWizardCharacter(): void {
  knowledgeHint.value = ''
  const n = wizard.characters.length + 1
  const id = `wizard-${String(n).padStart(3, '0')}`
  wizard.characters.push({
    id,
    name: `人物${n}`,
    appearanceTags: [],
    appearanceDesc: '',
    personality: '冷静',
    worldview: '守护',
    values: '正义',
    speech: '简短',
    chapterGoal: ''
  })
  activeCharId.value = id
}

function addBeat(): void {
  wizard.beats.push({ order: wizard.beats.length + 1, text: '' })
}

async function generate(): Promise<void> {
  genError.value = ''

  if (!window.novelsCreator?.dify?.generateChapter) {
    genError.value = '请在 NovelsCreator 桌面应用中运行；浏览器预览模式无法调用章节生成。'
    return
  }

  try {
    if (wizard.syncKnowledge) {
      knowledge.applyWizardPatch({
      environment: {
        era: wizard.era,
        scene: wizard.scene,
        scenePlace: wizard.scenePlace,
        atmosphere: [...wizard.atmosphere],
        envNote: wizard.envNote
      },
        syncCharacters: true,
        characters: wizard.characters.map((c) => ({
          id: c.id,
          appearanceTags: [...c.appearanceTags],
          appearanceDesc: c.appearanceDesc,
          personality: c.personality
        }))
      })
    }

    layout.expandBottomPanel()
    const result = await dify.generateChapter({
      chapter_id: props.chapterId,
      use_outline_beats: wizard.beats.some((b) => b.text.trim()),
      generation_prompt: wizard.generationPromptJson(wizardPromptMeta()),
      generation_prompt_text: wizard.briefText
    })

    if (!result.ok) {
      genError.value = humanizeDifyError(result.error ?? dify.lastError ?? '生成请求失败')
      return
    }

    const status = result.outputs?.status
    if (status === 'circuit_break') {
      ui.showCircuitBreak(props.chapterId, result.outputs!)
      genError.value = '生成熔断：请按弹窗提示修改设定后重试'
      return
    }
    if (status !== 'success') {
      genError.value = `生成未完成（status=${status ?? 'unknown'}）`
      return
    }

    if (wizard.openTabsAfter) {
      await editor.openChapterTabs(props.chapterId, chapter.value?.title ?? props.chapterId)
    }
    await router.push({ name: 'workspace' })
  } catch (e) {
    genError.value = humanizeDifyError(e instanceof Error ? e.message : String(e))
  }
}

function close(): void {
  router.push({ name: 'workspace' })
}
</script>

<template>
  <div class="wizard-page">
    <MenuBar @close-project="close" />

    <header class="wizard-head">
      <h1>生成向导 · {{ chapter?.title ?? props.chapterId }}</h1>
      <button type="button" class="nc-btn close-bar" @click="close">
        <NcIcon name="close" :size="16" />
        关闭
      </button>
    </header>

    <nav class="steps">
      <span
        v-for="(label, i) in wizard.steps"
        :key="label"
        class="step"
        :class="{ active: wizard.step === i, done: wizard.step > i }"
      >
        <NcIcon
          v-if="wizard.step > i"
          name="circle-dot"
          :size="10"
          class="step-mark done-mark"
        />
        <NcIcon
          v-else-if="wizard.step === i"
          name="circle-dot"
          :size="10"
          class="step-mark active-mark"
        />
        <NcIcon v-else name="circle" :size="10" class="step-mark" />
        {{ label }}
      </span>
    </nav>

    <main class="wizard-body nc-card">
      <!-- Step 0 环境 -->
      <div v-show="wizard.step === 0" class="step-pane">
        <h3>环境</h3>
        <div class="tags">
          <span class="label">时代</span>
          <button
            v-for="o in eraOptions"
            :key="o"
            type="button"
            class="tag"
            :class="{ on: wizard.era === o }"
            @click="wizard.era = o"
          >
            {{ o }}
          </button>
        </div>
        <div class="tags">
          <span class="label">场景类型</span>
          <button
            v-for="o in sceneOptions"
            :key="o"
            type="button"
            class="tag"
            :class="{ on: wizard.scene === o }"
            @click="wizard.scene = o"
          >
            {{ o }}
          </button>
        </div>
        <label class="field">
          <span>场景名称（可选，如平京、青云宗；与知识库「主要场景」一致）</span>
          <input v-model="wizard.scenePlace" class="nc-input" placeholder="具体城市或地点名" />
        </label>
        <div class="tags">
          <span class="label">氛围（最多3）</span>
          <button
            v-for="o in atmosphereOptions"
            :key="o"
            type="button"
            class="tag"
            :class="{ on: wizard.atmosphere.includes(o) }"
            @click="toggleAtmosphere(o)"
          >
            {{ o }}
          </button>
        </div>
        <textarea v-model="wizard.envNote" class="nc-input area" rows="3" placeholder="环境补充…" />

        <div class="world-block">
          <template v-if="hasWorldData">
            <label class="check world-check">
              <input v-model="wizard.useProjectWorld" type="checkbox" />
              使用项目世界观（地图、国家、城市已写入知识库，生成时随 knowledge_snapshot 一并提交）
            </label>
            <pre v-if="wizard.useProjectWorld && worldBrief" class="world-brief">{{ worldBrief }}</pre>
            <label v-if="sortedLocations.length" class="field">
              <span>本章主要地点（可选）</span>
              <select v-model="wizard.chapterLocationId" class="nc-input">
                <option value="">— 未指定 —</option>
                <option v-for="loc in sortedLocations" :key="loc.id" :value="loc.id">
                  {{ loc.name }}（{{ locationTypeLabel[loc.type] ?? loc.type }}）
                </option>
              </select>
            </label>
          </template>
          <p v-else class="hint">
            尚未生成世界观。请先在「工具 → 世界观生成器」中创建地图与国家，完成后本章生成将自动带入国家与地点设定。
          </p>
        </div>
      </div>

      <!-- Step 1 人物 -->
      <div v-show="wizard.step === 1" class="step-pane">
        <div class="char-layout">
          <aside>
            <button type="button" class="nc-btn nc-btn-sm" @click="addFromKnowledge">从知识库添加</button>
            <button type="button" class="nc-btn nc-btn-sm" @click="addWizardCharacter">+ 新建向导人物</button>
            <button
              v-for="c in wizard.characters"
              :key="c.id"
              type="button"
              class="char-btn"
              :class="{ active: c.id === activeCharId }"
              @click="activeCharId = c.id"
            >
              {{ c.name }}
            </button>
            <p v-if="knowledgeHint" class="hint">{{ knowledgeHint }}</p>
            <p v-else-if="!wizard.characters.length" class="hint">
              暂无人物。请从知识库添加，或新建向导人物（仅用于本次生成 Brief）。
            </p>
          </aside>
          <section v-if="activeChar" class="char-form">
            <label class="field"><span>外貌描写</span><input v-model="activeChar.appearanceDesc" class="nc-input" /></label>
            <label class="field"><span>主性格</span><input v-model="activeChar.personality" class="nc-input" /></label>
            <label class="field"><span>人生观</span><input v-model="activeChar.worldview" class="nc-input" /></label>
            <label class="field"><span>价值观</span><input v-model="activeChar.values" class="nc-input" /></label>
            <label class="field"><span>本章目标</span><input v-model="activeChar.chapterGoal" class="nc-input" /></label>
          </section>
        </div>
      </div>

      <!-- Step 2 情节 -->
      <div v-show="wizard.step === 2" class="step-pane">
        <label class="field"><span>本章目标</span><input v-model="wizard.plotGoal" class="nc-input" /></label>
        <div class="tags">
          <span class="label">冲突</span>
          <button
            v-for="o in conflictOptions"
            :key="o"
            type="button"
            class="tag"
            :class="{ on: wizard.conflict === o }"
            @click="wizard.conflict = o"
          >
            {{ o }}
          </button>
        </div>
        <div class="beats">
          <div v-for="(b, i) in wizard.beats" :key="i" class="beat-row">
            <span>{{ i + 1 }}.</span>
            <input v-model="b.text" class="nc-input" />
          </div>
          <button type="button" class="nc-btn nc-btn-sm" @click="addBeat">+ 节拍</button>
        </div>
        <div class="tags">
          <span class="label">基调</span>
          <button
            v-for="o in toneOptions"
            :key="o"
            type="button"
            class="tag"
            :class="{ on: wizard.tone === o }"
            @click="wizard.tone = o"
          >
            {{ o }}
          </button>
        </div>
      </div>

      <!-- Step 3 预览 -->
      <div v-show="wizard.step === 3" class="step-pane">
        <pre class="preview">{{ wizard.briefText }}</pre>
        <label class="check"><input v-model="wizard.syncKnowledge" type="checkbox" /> 生成前同步环境与人物回知识库</label>
        <label class="check"><input v-model="wizard.openTabsAfter" type="checkbox" /> 生成后打开正文与视频稿</label>
      </div>
    </main>

    <footer class="wizard-foot">
      <div class="foot-status">
        <p v-if="dify.running" class="gen-status">正在生成，请稍候（通常需 1–5 分钟，复杂设定可能更久）…</p>
        <p v-else-if="genError" class="gen-error">{{ genError }}</p>
        <p v-else-if="dify.lastError" class="gen-error">{{ dify.lastError }}</p>
      </div>
      <button type="button" class="nc-btn" :disabled="wizard.step === 0 || dify.running" @click="wizard.step--">
        上一步
      </button>
      <div class="spacer" />
      <button v-if="wizard.step < 3" type="button" class="nc-btn nc-btn-primary" @click="wizard.step++">
        下一步
      </button>
      <button v-else type="button" class="nc-btn nc-btn-primary" :disabled="dify.running" @click="generate">
        {{ dify.running ? '生成中…' : '生成本章' }}
        <NcIcon v-if="!dify.running" name="arrow-right" :size="16" />
      </button>
    </footer>

    <GenerationConsole class="wizard-console" />
  </div>
</template>

<style scoped>
.wizard-page {
  height: 100vh;
  display: grid;
  grid-template-rows: auto auto auto 1fr auto auto;
}
.wizard-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
}
.wizard-head h1 {
  margin: 0;
  font-size: 18px;
}
.close-bar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.steps {
  display: flex;
  gap: 16px;
  padding: 0 16px 12px;
  font-size: 13px;
  color: var(--nc-text-muted);
}
.step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.step-mark {
  color: var(--nc-icon);
}
.active-mark {
  color: var(--nc-accent);
}
.done-mark {
  color: var(--nc-success);
}
.step.active {
  color: var(--nc-accent);
}
.step.done {
  color: var(--nc-success);
}
.wizard-body {
  margin: 0 16px;
  overflow: auto;
  min-height: 0;
}
.step-pane h3 {
  margin: 0 0 12px;
  font-size: 15px;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 12px;
}
.label {
  font-size: 12px;
  color: var(--nc-text-muted);
  margin-right: 6px;
}
.tag {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--nc-border);
  background: var(--nc-bg-base);
  color: var(--nc-text-muted);
  font-size: 12px;
  cursor: pointer;
}
.tag.on {
  border-color: var(--nc-accent);
  color: var(--nc-text-primary);
}
.area {
  width: 100%;
}
.char-layout {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 12px;
}
.char-btn {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px;
  text-align: left;
  border: 1px solid var(--nc-border);
  border-radius: 6px;
  background: var(--nc-bg-base);
  color: inherit;
  cursor: pointer;
}
.char-btn.active {
  border-color: var(--nc-accent);
}
.field {
  display: grid;
  gap: 4px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.beats {
  margin: 12px 0;
}
.beat-row {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 8px;
  margin-bottom: 6px;
  align-items: center;
}
.preview {
  white-space: pre-wrap;
  font-family: var(--nc-font-editor);
  font-size: 13px;
  background: var(--nc-bg-base);
  padding: 12px;
  border-radius: 6px;
}
.check {
  display: flex;
  gap: 8px;
  font-size: 13px;
  margin-top: 10px;
}
.hint {
  font-size: 11px;
  color: var(--nc-text-muted);
  margin-top: 8px;
  line-height: 1.4;
}
.world-block {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--nc-border);
}
.world-check {
  margin-bottom: 8px;
}
.world-brief {
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.5;
  color: var(--nc-text-muted);
  background: var(--nc-bg-base);
  padding: 10px;
  border-radius: 6px;
  margin: 0 0 10px;
  max-height: 160px;
  overflow: auto;
}
.wizard-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--nc-border);
}
.wizard-foot .nc-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.foot-status {
  flex: 1 1 100%;
  min-height: 0;
}
.gen-status {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--nc-accent);
}
.gen-error {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--nc-danger);
  line-height: 1.4;
}
.wizard-console {
  min-height: 0;
}
.spacer {
  flex: 1;
}
.nc-btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
</style>
