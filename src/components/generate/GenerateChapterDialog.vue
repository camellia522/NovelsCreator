<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useOutlineStore } from '@/stores/outline.store'
import { useDifyStore } from '@/stores/dify.store'
import { useEditorStore } from '@/stores/editor.store'
import { useMemoryStore } from '@/stores/memory.store'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { validateChapterGenerationPreflight } from '@/utils/chapter-preflight'

const emit = defineEmits<{ close: [] }>()

const layout = useLayoutStore()
const outline = useOutlineStore()
const dify = useDifyStore()
const editor = useEditorStore()
const memory = useMemoryStore()
const knowledge = useKnowledgeStore()

const useOutlineBeats = ref(true)
const briefText = ref('')
const preflightError = ref('')

const chapter = computed(() => outline.getChapter(layout.selectedChapterId))
const beatCount = computed(() => chapter.value?.beats?.filter((b) => b.text.trim()).length ?? 0)

const preflight = computed(() => {
  if (!outline.doc || !memory.doc || !knowledge.doc) return null
  return validateChapterGenerationPreflight(
    layout.selectedChapterId,
    outline.doc,
    knowledge.doc,
    memory.doc,
    { useOutlineBeats: useOutlineBeats.value && beatCount.value > 0 }
  )
})

const canGenerate = computed(() => preflight.value?.ok !== false && !dify.running)

onMounted(async () => {
  if (!memory.doc) await memory.load()
  if (!knowledge.doc) await knowledge.load()
})

async function run(): Promise<void> {
  preflightError.value = ''
  if (!memory.doc) await memory.load()
  if (!knowledge.doc) await knowledge.load()
  const check = preflight.value
  if (check && !check.ok) {
    preflightError.value = check.errors.join('；')
    return
  }

  const useBeats = useOutlineBeats.value && beatCount.value > 0
  layout.expandBottomPanel()

  const result = await dify.generateChapter({
    chapter_id: layout.selectedChapterId,
    use_outline_beats: useBeats,
    generation_prompt_text: briefText.value.trim()
  })

  if (result.ok && result.outputs?.status === 'success') {
    await editor.openChapterTabs(
      layout.selectedChapterId,
      chapter.value?.title ?? layout.selectedChapterId
    )
  }
  emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal nc-card">
      <header class="head">
        <h2>快速生成 · {{ layout.selectedChapterId }}</h2>
        <button type="button" class="nc-btn" @click="emit('close')">关闭</button>
      </header>

      <label class="check">
        <input v-model="useOutlineBeats" type="checkbox" :disabled="beatCount === 0" />
        <span>使用大纲节拍（{{ beatCount }} 条）</span>
      </label>

      <ul v-if="preflight?.warnings.length" class="warn-list">
        <li v-for="(w, i) in preflight.warnings" :key="i">{{ w }}</li>
      </ul>
      <p v-if="preflightError || (preflight && !preflight.ok)" class="err">
        {{ preflightError || preflight?.errors.join('；') }}
      </p>

      <label class="field">
        <span>Brief（可选，已自动注入设定锚点）</span>
        <textarea v-model="briefText" class="nc-input area" rows="3" />
      </label>

      <p class="muted">Shift+Ctrl+Enter 快速生成 · Ctrl+Enter 打开三要素向导</p>

      <footer class="actions">
        <button type="button" class="nc-btn" @click="emit('close')">取消</button>
        <button type="button" class="nc-btn nc-btn-primary" :disabled="!canGenerate" @click="run">
          {{ dify.running ? '生成中…' : '开始生成' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  z-index: 1000;
}
.modal {
  width: min(480px, 92vw);
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
.check {
  display: flex;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 12px;
}
.warn-list {
  margin: 0 0 10px;
  padding-left: 18px;
  font-size: 12px;
  color: #e8a045;
}
.err {
  margin: 0 0 10px;
  font-size: 12px;
  color: #f07070;
}
.field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.area {
  resize: vertical;
}
.muted {
  font-size: 12px;
  color: var(--nc-text-muted);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
</style>
