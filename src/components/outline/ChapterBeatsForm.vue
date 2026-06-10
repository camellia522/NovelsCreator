<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChapterStatus } from '@/types/project'
import { useOutlineStore } from '@/stores/outline.store'
import { useMemoryStore } from '@/stores/memory.store'
import { useEditorStore } from '@/stores/editor.store'
import { useLayoutStore } from '@/stores/layout.store'
import NcIconButton from '@/components/icons/NcIconButton.vue'

const props = defineProps<{ chapterId: string }>()
const outline = useOutlineStore()
const memory = useMemoryStore()
const editor = useEditorStore()
const layout = useLayoutStore()

const deleting = ref(false)

const chapter = computed(() => outline.getChapter(props.chapterId))

const statusOptions: { value: ChapterStatus; label: string }[] = [
  { value: 'draft', label: '草稿' },
  { value: 'generating', label: '生成中' },
  { value: 'generated', label: '已生成' },
  { value: 'published', label: '已定稿' }
]

function setStatus(e: Event): void {
  const ch = chapter.value
  if (!ch) return
  ch.status = (e.target as HTMLSelectElement).value as ChapterStatus
  outline.markDirty()
}

function markDirty(): void {
  outline.markDirty()
}

async function deleteChapter(): Promise<void> {
  const ch = chapter.value
  if (!ch || deleting.value) return

  const msg = `确定删除「${ch.title || ch.id}」（${ch.id}）？\n\n将从大纲移除；章节正文目录与剧情记忆中的本章摘要一并删除，不可恢复。`
  if (!window.confirm(msg)) return

  deleting.value = true
  try {
    editor.closeChapterTabs(ch.id)
    memory.removeChapterSummaryById(ch.id)
    if (memory.dirty) await memory.save()

    if (window.novelsCreator?.project.deleteChapterAssets) {
      await window.novelsCreator.project.deleteChapterAssets(ch.id)
    }

    const nextId = outline.removeChapter(ch.id)
    layout.selectedChapterId = nextId ?? ''
    await outline.save()
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="chapter" class="beats-form">
    <label class="field">
      <span>章节 ID</span>
      <input class="nc-input" :value="chapter.id" readonly />
    </label>
    <label class="field">
      <span>章标题</span>
      <input
        v-model="chapter.title"
        class="nc-input"
        @input="markDirty"
      />
    </label>
    <label class="field">
      <span>状态</span>
      <select class="nc-input" :value="chapter.status" @change="setStatus">
        <option v-for="o in statusOptions" :key="o.value" :value="o.value">
          {{ o.label }}
        </option>
      </select>
    </label>

    <div class="beats-head">
      <span>节拍（保存后写入 outline.json）</span>
      <button type="button" class="nc-btn nc-btn-sm" @click="outline.addBeat(chapterId)">
        + 节拍
      </button>
    </div>

    <div v-for="(beat, i) in chapter.beats" :key="i" class="beat-row">
      <span class="order">{{ i + 1 }}</span>
      <input
        v-model="beat.text"
        class="nc-input"
        placeholder="本节拍情节…"
        @input="markDirty"
      />
      <NcIconButton
        name="trash"
        :size="16"
        label="删除节拍"
        danger
        @click="outline.removeBeat(chapterId, i)"
      />
    </div>
    <p v-if="!chapter.beats?.length" class="hint">暂无节拍；可留空，生成时不勾选「使用大纲」即可。</p>

    <button
      type="button"
      class="nc-btn nc-btn-sm delete-ch"
      :disabled="deleting"
      @click="deleteChapter"
    >
      {{ deleting ? '删除中…' : '删除本章' }}
    </button>
  </div>
</template>

<style scoped>
.beats-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.beats-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--nc-text-muted);
  margin-top: 4px;
}
.beat-row {
  display: grid;
  grid-template-columns: 24px 1fr 28px;
  gap: 6px;
  align-items: center;
}
.order {
  text-align: center;
  color: var(--nc-text-muted);
  font-size: 12px;
}
.hint {
  font-size: 12px;
  color: var(--nc-text-muted);
  margin: 0;
}
.delete-ch {
  align-self: flex-start;
  margin-top: 8px;
  color: var(--nc-danger);
  border-color: var(--nc-danger);
}
.nc-btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
</style>
