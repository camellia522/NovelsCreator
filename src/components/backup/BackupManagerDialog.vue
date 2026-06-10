<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDifyStore } from '@/stores/dify.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useEditorStore } from '@/stores/editor.store'
import { useOutlineStore } from '@/stores/outline.store'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useMemoryStore } from '@/stores/memory.store'
import { flushProjectPersist } from '@/utils/project-persist'

export interface BackupEntryRow {
  name: string
  path: string
  mtime: string
  size: number
}

const emit = defineEmits<{ close: [] }>()

const dify = useDifyStore()
const layout = useLayoutStore()
const editor = useEditorStore()
const outline = useOutlineStore()
const knowledge = useKnowledgeStore()
const memory = useMemoryStore()

const entries = ref<BackupEntryRow[]>([])
const loading = ref(true)
const busy = ref(false)
const message = ref('')
const ok = ref(false)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

async function reload(): Promise<void> {
  loading.value = true
  message.value = ''
  try {
    if (!window.novelsCreator?.backup?.list) {
      entries.value = []
      return
    }
    entries.value = await window.novelsCreator.backup.list()
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e)
    ok.value = false
  } finally {
    loading.value = false
  }
}

async function runBackup(): Promise<void> {
  if (!window.novelsCreator?.backup?.run) return
  busy.value = true
  message.value = ''
  try {
    await flushProjectPersist()
    const res = await window.novelsCreator.backup.run()
    ok.value = res.ok
    message.value = res.message
    if (res.ok) await reload()
    layout.expandBottomPanel()
    dify.log(res.ok ? 'success' : 'error', res.message)
  } finally {
    busy.value = false
  }
}

async function reloadProjectData(): Promise<void> {
  editor.clearTabs()
  await Promise.all([outline.load(), knowledge.load(), memory.load()])
}

async function restoreFromPath(zipPath: string, label: string): Promise<void> {
  if (!window.novelsCreator?.backup?.restore) return
  if (
    !window.confirm(
      `将用备份「${label}」覆盖当前项目内容（保留 backups/ 目录）。\n\n建议先点「立即备份」再恢复。是否继续？`
    )
  ) {
    return
  }
  busy.value = true
  message.value = ''
  try {
    await flushProjectPersist()
    const res = await window.novelsCreator.backup.restore(zipPath)
    ok.value = res.ok
    message.value = res.message
    if (res.ok) {
      await reloadProjectData()
      await reload()
      layout.expandBottomPanel()
      dify.log('success', res.message)
      emit('close')
    } else {
      dify.log('error', res.message)
    }
  } finally {
    busy.value = false
  }
}

async function pickExternalZip(): Promise<void> {
  if (!window.novelsCreator?.backup?.pickAndRestore) return
  if (
    !window.confirm(
      '将用所选外部 ZIP 覆盖当前项目内容（保留 backups/ 目录）。\n\n建议先手动备份一次。是否继续？'
    )
  ) {
    return
  }
  busy.value = true
  message.value = ''
  try {
    await flushProjectPersist()
    const res = await window.novelsCreator.backup.pickAndRestore()
    if (res.ok) {
      await reloadProjectData()
      await reload()
      layout.expandBottomPanel()
      dify.log('success', res.message)
      emit('close')
    } else if (res.message !== '已取消') {
      ok.value = false
      message.value = res.message
      dify.log('error', res.message)
    }
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void reload()
})
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @click.self="emit('close')">
      <div class="modal nc-card" @mousedown.stop @click.stop>
        <header class="head">
          <h2>备份管理</h2>
          <button type="button" class="nc-btn" :disabled="busy" @click="emit('close')">关闭</button>
        </header>

        <p class="muted">项目内 `backups/` 目录，自动保留最近 7 份 ZIP。</p>

        <div class="toolbar">
          <button type="button" class="nc-btn nc-btn-primary" :disabled="busy" @click="runBackup">
            立即备份
          </button>
          <button type="button" class="nc-btn" :disabled="busy" @click="pickExternalZip">
            从外部 ZIP 恢复…
          </button>
          <button type="button" class="nc-btn" :disabled="busy || loading" @click="reload">刷新列表</button>
        </div>

        <p v-if="loading" class="muted">加载中…</p>
        <p v-else-if="!entries.length" class="muted empty">暂无备份，请点击「立即备份」。</p>

        <ul v-else class="list">
          <li v-for="row in entries" :key="row.path" class="row">
            <div class="meta">
              <span class="name">{{ row.name }}</span>
              <span class="sub">{{ formatTime(row.mtime) }} · {{ formatSize(row.size) }}</span>
            </div>
            <button
              type="button"
              class="nc-btn nc-btn-sm"
              :disabled="busy"
              @click="restoreFromPath(row.path, row.name)"
            >
              恢复
            </button>
          </li>
        </ul>

        <p v-if="message" :class="ok ? 'msg ok' : 'msg err'">{{ message }}</p>
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
  z-index: 1400;
}
.modal {
  width: min(560px, 94vw);
  max-height: 85vh;
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
  margin: 0;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.empty {
  padding: 12px 0;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  max-height: 320px;
  overflow: auto;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--nc-border);
}
.row:last-child {
  border-bottom: none;
}
.meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.name {
  font-size: 13px;
  word-break: break-all;
}
.sub {
  font-size: 11px;
  color: var(--nc-text-muted);
}
.nc-btn-sm {
  padding: 2px 10px;
  font-size: 11px;
  flex-shrink: 0;
}
.msg {
  margin: 0;
  font-size: 12px;
}
.msg.ok {
  color: var(--nc-success);
}
.msg.err {
  color: var(--nc-danger);
}
</style>
