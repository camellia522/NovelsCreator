<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import SettingTagGroup from '@/components/forms/SettingTagGroup.vue'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useOutlineStore } from '@/stores/outline.store'
import { useMemoryStore } from '@/stores/memory.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useDifyStore } from '@/stores/dify.store'
import { useUiStore } from '@/stores/ui.store'
import { humanizeDifyError } from '@/utils/dify-error-message'
import { formatOutlineValidationIssues } from '@/utils/outline-validation-report'
import {
  applyOutlineSettingsToWorld,
  formatAtmosphereTags,
  syncOutlineSettingsFromKnowledge,
  validateKnowledgeForOutline,
  prepareKnowledgeForOutline,
  WIZARD_ATMOSPHERE_OPTIONS,
  WIZARD_ERA_OPTIONS,
  WIZARD_SCENE_OPTIONS,
  WORLD_MAGIC_CONSTRAINT_OPTIONS,
  WORLD_GENRE_OPTIONS,
  WORLD_TECH_OPTIONS,
  WORLD_CONFLICT_OPTIONS,
  WORLD_NARRATIVE_STYLE_OPTIONS,
  MAP_SCALE_UI_OPTIONS,
  WORLD_CLIMATE_UI_OPTIONS,
  WORLD_SETTING_DEFAULTS
} from '@/utils/chapter-wizard-knowledge'
import type { WorldClimateMode, WorldScale } from '@/types/world-gen'

const emit = defineEmits<{ close: [] }>()

const knowledge = useKnowledgeStore()
const outline = useOutlineStore()
const memory = useMemoryStore()
const layout = useLayoutStore()
const dify = useDifyStore()
const ui = useUiStore()

const volumeId = ref('vol-01')
const showNewVolume = ref(false)
const newVolumeId = ref('vol-02')
const newVolumeTitle = ref('')
const chaptersToGenerate = ref(3)
const outlineBrief = ref('')
const era = ref('架空')
const genre = ref('史诗')
const scene = ref('大陆')
const scenePlace = ref('')
const worldScale = ref<WorldScale>(WORLD_SETTING_DEFAULTS.mapScale)
const climate = ref<WorldClimateMode>(WORLD_SETTING_DEFAULTS.climate)
const techLevel = ref('冷兵器')
const conflictFocus = ref('国家战争')
const narrativeStyle = ref('史诗群像')
const atmosphere = ref<string[]>(['史诗'])
const magicConstraint = ref<string>(WORLD_SETTING_DEFAULTS.magicConstraint)
const usePlotMemory = ref(true)

const protagonistName = computed(() => {
  const chars = knowledge.doc?.characters ?? []
  return chars.find((c) => c.role === '主角')?.name?.trim() || ''
})

const preflightResult = computed(() =>
  knowledge.doc
    ? validateKnowledgeForOutline(knowledge.doc)
    : { ok: false, errors: ['设定未加载'], warnings: [] as string[] }
)

const preflightHint = computed(() => {
  const r = preflightResult.value
  if (!r.ok) return r.errors.join('；')
  if (r.warnings.length) return r.warnings.join('；')
  return protagonistName.value
    ? `主角：${protagonistName.value} · 生成前将自动保存设定并注入实体白名单`
    : ''
})
const genError = ref('')
const genIssues = ref('')

const volumes = computed(() => outline.doc?.volumes ?? [])

const effectiveVolumeId = computed(() =>
  showNewVolume.value ? newVolumeId.value.trim() || 'vol-02' : volumeId.value
)

const selectedVolume = computed(() =>
  volumes.value.find((v) => v.id === effectiveVolumeId.value)
)

const volumeChapterCount = computed(() => selectedVolume.value?.chapters?.length ?? 0)

const characterCount = computed(() => knowledge.doc?.characters?.length ?? 0)

const worldTitle = computed(() => knowledge.doc?.world?.title?.trim() || '未命名世界')

const hasMemory = computed(() => Boolean(memory.doc?.globalSummary?.trim()))

const locationNameOptions = computed(() => {
  const names = (knowledge.doc?.locations ?? []).map((l) => l.name).filter(Boolean)
  return [...new Set(names)].slice(0, 40)
})

const progressLabel = computed(() => {
  const p = dify.outlineProgress
  if (!p) return ''
  if (p.phase === 'chapter_start') return `正在生成 ${p.chapterId ?? ''}（${p.index}/${p.total}）…`
  if (p.phase === 'chapter_done') return `已写入 ${p.chapterTitle ?? p.chapterId}，更新记忆库…`
  if (p.phase === 'memory_saved') return `第 ${p.index}/${p.total} 章完成，继续下一章…`
  return p.message ?? ''
})

const contextHint = computed(() => {
  const parts = [`世界「${worldTitle.value}」`, `${characterCount.value} 个角色`]
  if (hasMemory.value) parts.push('含剧情记忆')
  parts.push(`本卷已有 ${volumeChapterCount.value} 章`)
  return parts.join(' · ')
})

function loadSettingsFromKnowledge(): void {
  const world = knowledge.doc?.world
  if (!world) return
  const s = syncOutlineSettingsFromKnowledge(world, knowledge.doc?.map)
  era.value = s.era
  genre.value = s.genre
  scene.value = s.scene
  scenePlace.value = s.scenePlace
  worldScale.value = s.mapScale
  climate.value = s.climate
  techLevel.value = s.techLevel
  conflictFocus.value = s.conflictFocus
  narrativeStyle.value = s.narrativeStyle
  atmosphere.value = s.atmosphere
  magicConstraint.value = s.magicConstraint
}

onMounted(async () => {
  if (!outline.doc) await outline.load()
  await knowledge.loadIfEmpty()
  if (!memory.doc) await memory.load()

  if (volumes.value.length) {
    volumeId.value = volumes.value[0].id
    const nums = volumes.value
      .map((v) => /^vol-(\d+)$/.exec(v.id)?.[1])
      .filter(Boolean)
      .map((n) => parseInt(n!, 10))
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    newVolumeId.value = `vol-${String(next).padStart(2, '0')}`
  }

  loadSettingsFromKnowledge()
  // brief 由 buildKnowledgeAnchorBrief 注入，勿用 world.rules 预填（易带现代/创业措辞误导 O1）
})

function ensureVolumeExists(): void {
  if (!outline.doc) return
  const id = effectiveVolumeId.value
  if (outline.doc.volumes.some((v) => v.id === id)) return
  outline.doc.volumes.push({
    id,
    title: newVolumeTitle.value.trim() || id,
    chapters: []
  })
  outline.markDirty()
}

function syncWorldSettings(): void {
  if (!knowledge.doc) return
  applyOutlineSettingsToWorld(
    knowledge.doc.world,
    {
      era: era.value,
      genre: genre.value,
      scene: scene.value,
      scenePlace: scenePlace.value,
      mapScale: worldScale.value,
      climate: climate.value,
      techLevel: techLevel.value,
      conflictFocus: conflictFocus.value,
      narrativeStyle: narrativeStyle.value,
      atmosphere: atmosphere.value,
      magicConstraint: magicConstraint.value
    },
    knowledge.doc.map
  )
  knowledge.markDirty()
}

async function confirmAppend(): Promise<boolean> {
  if (!outline.dirty) return true
  const action = await ui.showDirtyConfirm('大纲有未保存修改。保存后继续生成，或不保存并丢弃本地修改？')
  if (action === 'cancel') return false
  if (action === 'discard') {
    try {
      await outline.load()
    } catch (e) {
      genError.value = e instanceof Error ? e.message : '无法重新加载大纲'
      return false
    }
  }
  return true
}

async function run(): Promise<void> {
  genError.value = ''
  genIssues.value = ''

  if (!(await confirmAppend())) return

  const volumeExisted = volumes.value.some((v) => v.id === effectiveVolumeId.value)
  ensureVolumeExists()
  syncWorldSettings()
  if (knowledge.doc) prepareKnowledgeForOutline(knowledge.doc)
  const preflight = preflightResult.value
  if (!preflight.ok) {
    genError.value = preflight.errors.join('；')
    return
  }

  try {
    await knowledge.save()
  } catch (e) {
    genError.value = e instanceof Error ? e.message : '设定保存失败，无法生成'
    return
  }

  if (!volumeExisted) {
    try {
      await outline.save()
    } catch (e) {
      genError.value = e instanceof Error ? e.message : '新卷保存失败'
      return
    }
  }

  layout.expandBottomPanel()
  layout.setActivity('outline')

  try {
    const result = await dify.generateOutline({
      volume_id: effectiveVolumeId.value,
      chapters_to_generate: Math.max(1, chaptersToGenerate.value),
      outline_brief: outlineBrief.value.trim(),
      genre: genre.value.trim(),
      tone: formatAtmosphereTags(atmosphere.value),
      use_plot_memory: usePlotMemory.value
    })

    if (!result.ok) {
      const generated = result.chaptersGenerated ?? []
      genError.value = humanizeDifyError(result.error ?? dify.lastError ?? '生成请求失败')
      if (generated.length) {
        const resumeAt = result.failedAtChapter ?? '下一章'
        genError.value += `。已完成 ${generated.join(', ')}，修复后可重新生成，将从 ${resumeAt} 继续。`
        layout.selectedChapterId = generated[generated.length - 1]
      }
      return
    }

    const status = result.outputs?.status
    const generated = result.chaptersGenerated ?? []

    if (status === 'circuit_break') {
      genIssues.value = formatOutlineValidationIssues(
        result.outputs?.validation_report,
        result.outputs?.retry_issues_formatted
      )
      genError.value = generated.length
        ? `已完成 ${generated.length} 章后熔断，请调整设定后继续`
        : '大纲生成熔断：已达最大重试次数'
      if (generated.length) {
        layout.selectedChapterId = generated[generated.length - 1]
      }
      return
    }

    if (!result.outlineSaved || !generated.length) {
      genError.value = humanizeDifyError(result.error ?? '未能写入新章节')
      genIssues.value = formatOutlineValidationIssues(
        result.outputs?.validation_report,
        result.outputs?.retry_issues_formatted
      )
      if (result.failedAtChapter) {
        genError.value = `${genError.value}（中断于 ${result.failedAtChapter}）`
      }
      if (generated.length) {
        layout.selectedChapterId = generated[generated.length - 1]
      }
      return
    }

    if (knowledge.dirty) {
      await knowledge.save()
    }

    layout.selectedChapterId = generated[generated.length - 1]
    emit('close')
  } catch (e) {
    genError.value = humanizeDifyError(e instanceof Error ? e.message : String(e))
  }
}
</script>

<template>
  <Teleport to="body">
  <div class="overlay" @click.self="emit('close')">
    <div class="modal nc-card" @mousedown.stop @click.stop>
      <header class="head">
        <h2>AI 生成大纲</h2>
        <button type="button" class="nc-btn" :disabled="dify.outlineRunning" @click="emit('close')">
          关闭
        </button>
      </header>

      <p class="muted context">{{ contextHint }}</p>
      <p class="muted">
        选择<strong>目标卷</strong>与<strong>世界设定</strong>后串行生成；选项与「设定 / 章节向导」一致，生成时会写回 knowledge。
      </p>

      <label class="field">
        <span>目标卷</span>
        <select v-model="volumeId" class="nc-input" :disabled="dify.outlineRunning || showNewVolume">
          <option v-for="vol in volumes" :key="vol.id" :value="vol.id">
            {{ vol.title || vol.id }}（{{ vol.chapters?.length ?? 0 }} 章）
          </option>
        </select>
        <button
          type="button"
          class="nc-btn nc-btn-sm link-btn"
          :disabled="dify.outlineRunning"
          @click="showNewVolume = !showNewVolume"
        >
          {{ showNewVolume ? '使用已有卷' : '+ 新建卷' }}
        </button>
      </label>

      <template v-if="showNewVolume">
        <label class="field">
          <span>新卷 ID</span>
          <input v-model="newVolumeId" class="nc-input" placeholder="vol-02" :disabled="dify.outlineRunning" />
        </label>
        <label class="field">
          <span>新卷名称</span>
          <input
            v-model="newVolumeTitle"
            class="nc-input"
            placeholder="第二卷"
            :disabled="dify.outlineRunning"
          />
        </label>
      </template>

      <label class="field">
        <span>本次生成章数</span>
        <input
          v-model.number="chaptersToGenerate"
          type="number"
          min="1"
          max="50"
          class="nc-input"
          :disabled="dify.outlineRunning"
        />
      </label>

      <SettingTagGroup
        label="时代"
        :options="WIZARD_ERA_OPTIONS"
        :model-value="era"
        :disabled="dify.outlineRunning"
        @update:model-value="era = $event as string"
      />
      <SettingTagGroup
        label="题材"
        :options="WORLD_GENRE_OPTIONS"
        :model-value="genre"
        :disabled="dify.outlineRunning"
        @update:model-value="genre = $event as string"
      />
      <SettingTagGroup
        label="叙事风格"
        :options="WORLD_NARRATIVE_STYLE_OPTIONS"
        :model-value="narrativeStyle"
        :disabled="dify.outlineRunning"
        @update:model-value="narrativeStyle = $event as string"
      />
      <SettingTagGroup
        label="世界尺度（与地图一致）"
        :option-items="MAP_SCALE_UI_OPTIONS"
        :model-value="worldScale"
        :disabled="dify.outlineRunning"
        @update:model-value="worldScale = $event as WorldScale"
      />
      <SettingTagGroup
        label="气候分布"
        :option-items="WORLD_CLIMATE_UI_OPTIONS"
        :model-value="climate"
        :disabled="dify.outlineRunning"
        @update:model-value="climate = $event as WorldClimateMode"
      />
      <SettingTagGroup
        label="场景类型"
        :options="WIZARD_SCENE_OPTIONS"
        :model-value="scene"
        :disabled="dify.outlineRunning"
        @update:model-value="scene = $event as string"
      />
      <label class="field">
        <span>场景名称（可选）</span>
        <input
          v-model="scenePlace"
          class="nc-input"
          list="outline-scene-places"
          placeholder="从地图选或手填，如文京"
          :disabled="dify.outlineRunning"
        />
        <datalist id="outline-scene-places">
          <option v-for="name in locationNameOptions" :key="name" :value="name" />
        </datalist>
      </label>
      <SettingTagGroup
        label="科技水平"
        :options="WORLD_TECH_OPTIONS"
        :model-value="techLevel"
        :disabled="dify.outlineRunning"
        @update:model-value="techLevel = $event as string"
      />
      <SettingTagGroup
        label="冲突主轴"
        :options="WORLD_CONFLICT_OPTIONS"
        :model-value="conflictFocus"
        :disabled="dify.outlineRunning"
        @update:model-value="conflictFocus = $event as string"
      />
      <SettingTagGroup
        label="氛围（最多 3 个，对应 Dify tone）"
        :options="WIZARD_ATMOSPHERE_OPTIONS"
        :model-value="atmosphere"
        multiple
        :max="3"
        :disabled="dify.outlineRunning"
        @update:model-value="atmosphere = $event as string[]"
      />
      <SettingTagGroup
        label="力量体系（硬约束）"
        :options="WORLD_MAGIC_CONSTRAINT_OPTIONS"
        :model-value="magicConstraint"
        :disabled="dify.outlineRunning"
        @update:model-value="magicConstraint = $event as string"
      />

      <p v-if="preflightHint && !dify.outlineRunning" class="hint preflight">{{ preflightHint }}</p>

      <label class="field">
        <span>创作 brief（可选，勿重复粘贴 world.rules）</span>
        <textarea
          v-model="outlineBrief"
          class="nc-input area brief-input"
          rows="3"
          placeholder="本卷独有事件；主角/国家/地点已自动注入设定锚点，无需重复"
          :disabled="dify.outlineRunning"
          @keydown.stop
        />
      </label>

      <label class="check">
        <input v-model="usePlotMemory" type="checkbox" :disabled="dify.outlineRunning" />
        <span>使用前序章节剧情记忆（仅已写入大纲的章；首章或换主线时可取消）</span>
      </label>
      <p v-if="!usePlotMemory" class="hint">已关闭：仅依据知识库生成，可避免与旧正文摘要冲突。</p>

      <p v-if="dify.outlineRunning" class="status">
        {{ progressLabel || '正在串行生成，请稍候…' }}
      </p>
      <p v-else-if="genError" class="error">{{ genError }}</p>
      <pre v-if="genIssues && !dify.outlineRunning" class="issues">{{ genIssues }}</pre>

      <footer class="actions">
        <button type="button" class="nc-btn" :disabled="dify.outlineRunning" @click="emit('close')">
          取消
        </button>
        <button
          type="button"
          class="nc-btn nc-btn-primary"
          :disabled="dify.outlineRunning || (showNewVolume && !newVolumeId.trim()) || !preflightResult.ok"
          @click="run"
        >
          {{ dify.outlineRunning ? '生成中…' : '开始生成' }}
        </button>
      </footer>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  z-index: 1500;
}
.modal {
  width: min(620px, 92vw);
  max-height: 90vh;
  overflow: auto;
  pointer-events: auto;
}
.brief-input {
  pointer-events: auto;
  resize: vertical;
  min-height: 72px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.head h2 {
  margin: 0;
  font-size: 17px;
}
.field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--nc-text-muted);
  margin-bottom: 10px;
}
.area {
  resize: vertical;
}
.check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12px;
  color: var(--nc-text-muted);
  margin-bottom: 8px;
}
.hint {
  font-size: 11px;
  color: var(--nc-text-muted);
  margin: 0 0 8px;
}
.hint.preflight {
  color: var(--nc-accent);
}
.muted {
  font-size: 12px;
  color: var(--nc-text-muted);
  margin: 0 0 8px;
}
.context {
  font-size: 13px;
  color: var(--nc-text-primary);
}
.status {
  font-size: 13px;
  color: var(--nc-accent);
  margin: 8px 0 0;
}
.error {
  font-size: 13px;
  color: var(--nc-danger);
  margin: 8px 0 0;
}
.issues {
  white-space: pre-wrap;
  font-family: var(--nc-font-editor);
  font-size: 11px;
  background: var(--nc-bg-base);
  padding: 8px;
  border-radius: 6px;
  max-height: 160px;
  overflow: auto;
  margin: 8px 0 0;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.link-btn {
  justify-self: start;
  margin-top: 4px;
}
.nc-btn-sm {
  padding: 2px 8px;
  font-size: 11px;
}
</style>
