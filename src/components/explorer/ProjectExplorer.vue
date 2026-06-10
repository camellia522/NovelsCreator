<script setup lang="ts">
import { useLayoutStore } from '@/stores/layout.store'
import { useOutlineStore } from '@/stores/outline.store'
import { useEditorStore } from '@/stores/editor.store'

const layout = useLayoutStore()
const outline = useOutlineStore()
const editor = useEditorStore()

async function onDblClick(chapterId: string): Promise<void> {
  layout.selectedChapterId = chapterId
  const ch = outline.getChapter(chapterId)
  await editor.openChapterTabs(chapterId, ch?.title ?? chapterId)
}
</script>

<template>
  <div class="explorer">
    <h3>项目资源</h3>
    <ul class="tree">
      <li v-for="vol in outline.doc?.volumes ?? []" :key="vol.id">
        <span class="vol">{{ vol.title }}</span>
        <ul>
          <li v-for="ch in vol.chapters" :key="ch.id">
            <button
              type="button"
              class="node"
              :class="{ active: ch.id === layout.selectedChapterId }"
              @click="layout.selectedChapterId = ch.id"
              @dblclick="onDblClick(ch.id)"
            >
              {{ ch.id }} {{ ch.title }}
            </button>
          </li>
        </ul>
      </li>
    </ul>
    <p class="hint muted">双击章节打开正文 + 视频稿标签</p>
  </div>
</template>

<style scoped>
.explorer h3 {
  margin: 0 0 10px;
  font-size: 13px;
}
.tree {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}
.vol {
  color: var(--nc-text-muted);
  font-size: 12px;
}
.node {
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border: none;
  background: none;
  color: var(--nc-text-primary);
  border-radius: 4px;
  cursor: pointer;
}
.node:hover,
.node.active {
  background: var(--nc-bg-elevated);
}
.hint {
  margin-top: 12px;
  font-size: 11px;
}
.muted {
  color: var(--nc-text-muted);
}
</style>
