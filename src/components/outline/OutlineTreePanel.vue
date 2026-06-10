<script setup lang="ts">
import { useLayoutStore } from '@/stores/layout.store'
import { useOutlineStore } from '@/stores/outline.store'
import { useUiStore } from '@/stores/ui.store'
import { useDifyStore } from '@/stores/dify.store'
import ChapterBeatsForm from '@/components/outline/ChapterBeatsForm.vue'
import PanelSaveBar from '@/components/forms/PanelSaveBar.vue'

const layout = useLayoutStore()
const outline = useOutlineStore()
const ui = useUiStore()
const dify = useDifyStore()

function generateChapter(chapterId: string): void {
  layout.selectedChapterId = chapterId
  ui.generateOpen = true
}
</script>

<template>
  <div class="outline-tree">
    <header class="head">
      <h3>大纲</h3>
      <div class="head-actions">
        <button
          type="button"
          class="nc-btn nc-btn-sm outline-ai"
          :disabled="dify.outlineRunning"
          @click="ui.generateOutlineOpen = true"
        >
          {{ dify.outlineRunning ? '生成中…' : 'AI 生成' }}
        </button>
        <button type="button" class="nc-btn nc-btn-sm" @click="outline.addVolume()">+ 卷</button>
        <button type="button" class="nc-btn nc-btn-sm" @click="outline.addChapter()">+ 章</button>
      </div>
    </header>

    <p class="tip">修改后请点击「立即保存」写入 outline/outline.json。</p>

    <ul class="tree">
      <li v-for="vol in outline.doc?.volumes ?? []" :key="vol.id">
        <label class="field vol-field">
          <span>卷名</span>
          <input v-model="vol.title" class="nc-input" @input="outline.markDirty()" />
        </label>
        <ul>
          <li v-for="ch in vol.chapters" :key="ch.id">
            <button
              type="button"
              class="ch"
              :class="{ active: ch.id === layout.selectedChapterId }"
              @click="layout.selectedChapterId = ch.id"
            >
              {{ ch.title }}
              <span class="meta">{{ ch.beats?.length ?? 0 }} 节拍</span>
            </button>
          </li>
        </ul>
      </li>
    </ul>

    <ChapterBeatsForm v-if="layout.selectedChapterId" :chapter-id="layout.selectedChapterId" />

    <button type="button" class="nc-btn nc-btn-sm gen" @click="generateChapter(layout.selectedChapterId)">
      AI 生成本章
    </button>

    <PanelSaveBar
      :dirty="outline.dirty"
      :saving="outline.saving"
      label="保存大纲"
      @save="outline.save()"
    />
  </div>
</template>

<style scoped>
.outline-tree {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  min-height: 0;
  overflow: auto;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.head-actions {
  display: flex;
  gap: 6px;
}
.outline-ai {
  color: var(--nc-accent);
}
.head h3 {
  margin: 0;
  font-size: 13px;
}
.tip {
  font-size: 11px;
  color: var(--nc-text-muted);
  margin: 0;
}
.tree {
  margin: 0;
  padding: 0;
  list-style: none;
}
.vol-field {
  margin: 8px 0 4px;
}
.field {
  display: grid;
  gap: 4px;
  font-size: 11px;
  color: var(--nc-text-muted);
}
.ch {
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border: none;
  background: none;
  color: inherit;
  border-radius: 4px;
  cursor: pointer;
}
.ch.active {
  background: var(--nc-bg-elevated);
  box-shadow: inset 2px 0 0 var(--nc-accent);
}
.meta {
  float: right;
  font-size: 11px;
  color: var(--nc-text-muted);
}
.gen {
  color: var(--nc-success);
}
.nc-btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
</style>
