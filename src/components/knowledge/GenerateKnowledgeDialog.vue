<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useDifyStore } from '@/stores/dify.store'
import { useUiStore } from '@/stores/ui.store'
import { useLayoutStore } from '@/stores/layout.store'
import { humanizeDifyError } from '@/utils/dify-error-message'
import { formatOutlineValidationIssues } from '@/utils/outline-validation-report'
import type { KnowledgeGenerationMode } from '@/types/api'
import type { KnowledgeDocument } from '@/types/project'
import {
  buildKnowledgeBriefForm,
  collectKnowledgeExistingStats,
  composeKnowledgeBrief,
  validateKnowledgeBriefForm,
  type KnowledgeBriefFormState
} from '@/utils/knowledge-brief-form'

const emit = defineEmits<{ close: [] }>()

const knowledge = useKnowledgeStore()
const dify = useDifyStore()
const ui = useUiStore()
const layout = useLayoutStore()

const EMPTY_DOC: KnowledgeDocument = {
  world: { title: '', rules: '' },
  map: null,
  locations: [],
  characters: [],
  factions: [],
  items: []
}

const generationMode = ref<KnowledgeGenerationMode>('expand')
const form = ref<KnowledgeBriefFormState>(buildKnowledgeBriefForm({ ...EMPTY_DOC }, 'expand'))
const genError = ref('')
const genIssues = ref('')

const stats = computed(() =>
  knowledge.doc ? collectKnowledgeExistingStats(knowledge.doc) : collectKnowledgeExistingStats({ ...EMPTY_DOC })
)

const worldTitle = computed(() => knowledge.doc?.world?.title?.trim() || '未命名世界')

const contextHint = computed(() => {
  const s = stats.value
  const parts = [
    `世界「${worldTitle.value}」`,
    `${s.characterCount} 个人物`,
    `${s.factionCount} 个势力`,
    `${s.itemCount} 个道具`
  ]
  if (s.nationCount) parts.push(`${s.nationCount} 个地图国家`)
  return parts.join(' · ')
})

const composedBrief = computed(() => composeKnowledgeBrief(form.value, generationMode.value, stats.value))

function reloadFormFromDoc(): void {
  if (!knowledge.doc) return
  form.value = buildKnowledgeBriefForm(knowledge.doc, generationMode.value)
}

onMounted(async () => {
  await knowledge.loadIfEmpty()
  reloadFormFromDoc()
})

watch(generationMode, () => {
  reloadFormFromDoc()
})

async function run(): Promise<void> {
  genError.value = ''
  genIssues.value = ''

  const validation = validateKnowledgeBriefForm(form.value)
  if (validation) {
    genError.value = validation
    return
  }

  const brief = composedBrief.value.trim()
  if (!brief) {
    genError.value = '无法合成 brief，请检查表单'
    return
  }

  if (knowledge.dirty) {
    const action = await ui.showDirtyConfirm('设定有未保存修改。保存后继续生成，或不保存并丢弃本地修改？')
    if (action === 'cancel') return
    if (action === 'save') {
      try {
        await knowledge.save()
      } catch (e) {
        genError.value = e instanceof Error ? e.message : '设定保存失败'
        return
      }
    } else {
      await knowledge.load()
      reloadFormFromDoc()
    }
  }

  layout.expandBottomPanel()
  layout.setActivity('knowledge')

  try {
    const result = await dify.generateKnowledge({
      knowledge_brief: brief,
      generation_mode: generationMode.value
    })

    if (!result.ok) {
      if (result.outputs?.status === 'circuit_break') {
        ui.showKnowledgeCircuitBreak(result.outputs)
        emit('close')
        return
      }
      genError.value = humanizeDifyError(result.error ?? dify.lastError ?? '生成失败')
      genIssues.value = formatOutlineValidationIssues(
        result.outputs?.validation_report,
        result.outputs?.retry_issues_formatted
      )
      return
    }

    if (!result.knowledgeSaved) {
      genError.value = humanizeDifyError(result.error ?? '未能写入知识库')
      return
    }

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
          <h2>AI 生成知识库</h2>
          <button type="button" class="nc-btn" :disabled="dify.knowledgeRunning" @click="emit('close')">
            关闭
          </button>
        </header>

        <p class="muted context">{{ contextHint }}</p>
        <p class="muted">
          已根据当前设定预填；空白项请补充。点击「开始生成」将自动合成 brief（不修改地图与地点）。
        </p>

        <label class="field">
          <span>生成模式</span>
          <select v-model="generationMode" class="nc-input" :disabled="dify.knowledgeRunning">
            <option value="expand">扩充（保留已有，按 id 合并）</option>
            <option value="bootstrap">bootstrap（以 brief 为主刷新设定）</option>
          </select>
        </label>

        <section class="section">
          <h3 class="section-title">核心设定</h3>
          <div class="grid">
            <label class="field">
              <span>世界名</span>
              <input v-model="form.worldTitle" class="nc-input" type="text" :disabled="dify.knowledgeRunning" />
            </label>
            <label class="field">
              <span>题材 / 时代</span>
              <input
                v-model="form.genreEra"
                class="nc-input"
                type="text"
                placeholder="如：史诗 · 架空"
                :disabled="dify.knowledgeRunning"
              />
            </label>
          </div>
          <label class="field">
            <span>力量体系</span>
            <input
              v-model="form.magicSystem"
              class="nc-input"
              type="text"
              placeholder="如：低魔；冷兵器；灵炁需媒介且代价高昂"
              :disabled="dify.knowledgeRunning"
            />
          </label>
          <label class="field">
            <span>叙事禁忌</span>
            <input
              v-model="form.taboos"
              class="nc-input"
              type="text"
              placeholder="如：禁穿越、禁系统、禁起死回生"
              :disabled="dify.knowledgeRunning"
            />
          </label>
        </section>

        <section class="section">
          <h3 class="section-title">故事钩子</h3>
          <label class="field">
            <span>主角（姓名 + 身份）</span>
            <input
              v-model="form.protagonist"
              class="nc-input"
              type="text"
              placeholder="如：周衍，大晏北境斥候"
              :disabled="dify.knowledgeRunning"
            />
          </label>
          <label class="field">
            <span>核心冲突</span>
            <textarea
              v-model="form.coreConflict"
              class="nc-input area-sm"
              rows="2"
              placeholder="如：四国百年战争，秘密势力争夺魂玉"
              :disabled="dify.knowledgeRunning"
              @keydown.stop
            />
          </label>
          <label class="field">
            <span>开篇悬念</span>
            <textarea
              v-model="form.openingHook"
              class="nc-input area-sm"
              rows="2"
              placeholder="如：斥候获得地图碎片，被多方盯上"
              :disabled="dify.knowledgeRunning"
              @keydown.stop
            />
          </label>
        </section>

        <section class="section">
          <h3 class="section-title">生成数量</h3>
          <p class="muted section-hint">
            {{ generationMode === 'expand' ? '数值 = 还需增加的数量（已扣减已有）' : 'bootstrap = 目标总数' }}
          </p>
          <div class="grid grid-4">
            <label class="field">
              <span>国家背景 <em class="hint">已有 {{ stats.nationCount }}</em></span>
              <input
                v-model.number="form.targetNations"
                class="nc-input"
                type="number"
                min="0"
                max="20"
                :disabled="dify.knowledgeRunning"
              />
            </label>
            <label class="field">
              <span>核心角色 <em class="hint">已有 {{ stats.characterCount }}</em></span>
              <input
                v-model.number="form.targetCharacters"
                class="nc-input"
                type="number"
                min="0"
                max="30"
                :disabled="dify.knowledgeRunning"
              />
            </label>
            <label class="field">
              <span>秘密势力 <em class="hint">已有 {{ stats.factionCount }}</em></span>
              <input
                v-model.number="form.targetSecretFactions"
                class="nc-input"
                type="number"
                min="0"
                max="20"
                :disabled="dify.knowledgeRunning"
              />
            </label>
            <label class="field">
              <span>关键道具 <em class="hint">已有 {{ stats.itemCount }}</em></span>
              <input
                v-model.number="form.targetItems"
                class="nc-input"
                type="number"
                min="0"
                max="20"
                :disabled="dify.knowledgeRunning"
              />
            </label>
          </div>
        </section>

        <section class="section">
          <h3 class="section-title">实体白名单（逗号或顿号分隔）</h3>
          <div class="grid">
            <label class="field">
              <span>国家 / 政权</span>
              <input
                v-model="form.whitelistNations"
                class="nc-input"
                type="text"
                :placeholder="stats.nationCount ? '已从地图国家预填' : '如：大晏、北朔、西陵、南襄'"
                :disabled="dify.knowledgeRunning"
              />
            </label>
            <label class="field">
              <span>反派</span>
              <input
                v-model="form.whitelistVillain"
                class="nc-input"
                type="text"
                placeholder="如：殷无咎"
                :disabled="dify.knowledgeRunning"
              />
            </label>
          </div>
          <label class="field">
            <span>主要配角</span>
            <input
              v-model="form.whitelistCharacters"
              class="nc-input"
              type="text"
              placeholder="如：苏晚晴（军医）、魏武（将军）"
              :disabled="dify.knowledgeRunning"
            />
          </label>
          <div class="grid">
            <label class="field">
              <span>组织 / 势力</span>
              <input
                v-model="form.whitelistFactions"
                class="nc-input"
                type="text"
                placeholder="如：影阁、铸魂殿"
                :disabled="dify.knowledgeRunning"
              />
            </label>
            <label class="field">
              <span>关键道具</span>
              <input
                v-model="form.whitelistItems"
                class="nc-input"
                type="text"
                placeholder="如：霜月刃、魂玉"
                :disabled="dify.knowledgeRunning"
              />
            </label>
          </div>
        </section>

        <section class="section">
          <h3 class="section-title">风格（可选）</h3>
          <div class="grid grid-3">
            <label class="field">
              <span>叙事风格</span>
              <input v-model="form.narrativeStyle" class="nc-input" type="text" :disabled="dify.knowledgeRunning" />
            </label>
            <label class="field">
              <span>政治基调</span>
              <input v-model="form.politicalTone" class="nc-input" type="text" :disabled="dify.knowledgeRunning" />
            </label>
            <label class="field">
              <span>战争形态</span>
              <input v-model="form.warfareStyle" class="nc-input" type="text" :disabled="dify.knowledgeRunning" />
            </label>
          </div>
        </section>

        <details class="preview">
          <summary>预览将发送给 AI 的 brief</summary>
          <pre class="preview-body">{{ composedBrief }}</pre>
        </details>

        <p v-if="genError" class="error">{{ genError }}</p>
        <pre v-if="genIssues" class="issues">{{ genIssues }}</pre>

        <footer class="actions">
          <button type="button" class="nc-btn" :disabled="dify.knowledgeRunning" @click="emit('close')">
            取消
          </button>
          <button
            type="button"
            class="nc-btn nc-btn-primary"
            :disabled="dify.knowledgeRunning"
            @click="run"
          >
            {{ dify.knowledgeRunning ? '生成中…' : '开始生成' }}
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
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
}
.modal {
  width: min(720px, 96vw);
  max-height: 92vh;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.head h2 {
  margin: 0;
  font-size: 16px;
}
.muted {
  color: var(--nc-text-muted);
  font-size: 12px;
  margin: 0;
}
.context {
  font-size: 13px;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  background: var(--nc-bg-base);
}
.section-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}
.section-hint {
  margin: -4px 0 0;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.field .hint {
  font-style: normal;
  font-weight: normal;
  color: var(--nc-text-muted);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.grid-3 {
  grid-template-columns: repeat(3, 1fr);
}
.grid-4 {
  grid-template-columns: repeat(4, 1fr);
}
@media (max-width: 640px) {
  .grid,
  .grid-3,
  .grid-4 {
    grid-template-columns: 1fr;
  }
}
.area-sm {
  min-height: 56px;
  resize: vertical;
  line-height: 1.45;
}
.preview {
  font-size: 12px;
}
.preview summary {
  cursor: pointer;
  color: var(--nc-text-muted);
  user-select: none;
}
.preview-body {
  margin: 8px 0 0;
  padding: 8px;
  max-height: 160px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  background: var(--nc-bg-base);
  border: 1px solid var(--nc-border);
  border-radius: 6px;
}
.error {
  color: var(--nc-danger);
  font-size: 12px;
  margin: 0;
}
.issues {
  margin: 0;
  padding: 8px;
  font-size: 11px;
  max-height: 120px;
  overflow: auto;
  background: var(--nc-bg-base);
  border: 1px solid var(--nc-border);
  border-radius: 6px;
  white-space: pre-wrap;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
