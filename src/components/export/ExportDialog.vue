<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore } from '@/stores/project.store'
import { useLayoutStore } from '@/stores/layout.store'

const emit = defineEmits<{ close: [] }>()

const project = useProjectStore()
const layout = useLayoutStore()

const mode = ref<'chapter' | 'fullBook'>('chapter')
const chapterId = ref(layout.selectedChapterId)
const exportType = ref<'novel' | 'video' | 'both'>('both')
const fullBookType = ref<'novel' | 'video'>('novel')
const format = ref<'txt' | 'md'>('txt')
const message = ref('')
const ok = ref(false)

async function exportToFile(): Promise<void> {
  message.value = ''
  if (mode.value === 'fullBook') {
    const res = await window.novelsCreator.export.fullBook(fullBookType.value, format.value)
    ok.value = res.ok
    message.value = res.message
    return
  }
  const res = await window.novelsCreator.export.chapter(
    chapterId.value,
    exportType.value,
    format.value
  )
  ok.value = res.ok
  message.value = res.message
}

async function copyToExports(): Promise<void> {
  message.value = ''
  const res = await window.novelsCreator.export.toProjectFolder(chapterId.value)
  ok.value = res.ok
  message.value = res.message
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal nc-card">
      <header class="head">
        <h2>导出</h2>
        <button type="button" class="nc-btn" @click="emit('close')">关闭</button>
      </header>

      <p class="muted">项目：{{ project.current?.name }}</p>

      <div class="mode-tabs">
        <button
          type="button"
          class="nc-btn nc-btn-sm"
          :class="{ active: mode === 'chapter' }"
          @click="mode = 'chapter'"
        >
          单章
        </button>
        <button
          type="button"
          class="nc-btn nc-btn-sm"
          :class="{ active: mode === 'fullBook' }"
          @click="mode = 'fullBook'"
        >
          全本
        </button>
      </div>

      <template v-if="mode === 'chapter'">
        <label class="field">
          <span>章节 ID</span>
          <input v-model="chapterId" class="nc-input" placeholder="ch-001" />
        </label>
        <label class="field">
          <span>内容</span>
          <select v-model="exportType" class="nc-input">
            <option value="novel">正文</option>
            <option value="video">视频脚本</option>
            <option value="both">正文 + 视频脚本</option>
          </select>
        </label>
      </template>

      <template v-else>
        <label class="field">
          <span>内容</span>
          <select v-model="fullBookType" class="nc-input">
            <option value="novel">正文（按大纲卷章顺序合并）</option>
            <option value="video">视频脚本</option>
          </select>
        </label>
        <p class="hint muted">缺失或空白的章会跳过，并在导出完成后提示。</p>
      </template>

      <label class="field">
        <span>格式</span>
        <select v-model="format" class="nc-input">
          <option value="txt">纯文本 (.txt)</option>
          <option value="md">Markdown (.md)</option>
        </select>
      </label>

      <p v-if="message" class="hint" :class="{ ok }">{{ message }}</p>

      <footer class="actions">
        <button
          v-if="mode === 'chapter'"
          type="button"
          class="nc-btn"
          @click="copyToExports"
        >
          复制到项目 exports/
        </button>
        <button type="button" class="nc-btn nc-btn-primary" @click="exportToFile">另存为…</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.modal {
  width: min(420px, 92vw);
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
.mode-tabs {
  display: flex;
  gap: 8px;
}
.mode-tabs .active {
  background: var(--nc-accent);
  color: #fff;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.hint {
  font-size: 12px;
  margin: 0;
  color: var(--nc-danger);
}
.hint.ok {
  color: var(--nc-success);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
