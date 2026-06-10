<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project.store'
import { useEditorStore } from '@/stores/editor.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useDifyStore } from '@/stores/dify.store'

const project = useProjectStore()
const editor = useEditorStore()
const layout = useLayoutStore()
const dify = useDifyStore()

const statusText = computed(() => {
  if (dify.running) return '章节生成中…'
  if (dify.outlineRunning) return '大纲生成中…'
  if (editor.activeTab?.dirty) return '未保存'
  return '就绪'
})
</script>

<template>
  <footer class="status-bar">
    <span>{{ project.current?.name }}</span>
    <span class="sep">|</span>
    <span>{{ layout.selectedChapterId }}</span>
    <span class="sep">|</span>
    <span>{{ statusText }}</span>
    <span class="spacer" />
    <span v-if="editor.activeTab">{{ editor.activeTab.title }}</span>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 24px;
  padding: 0 12px;
  font-size: 11px;
  color: var(--nc-text-muted);
  background: var(--nc-bg-panel);
  border-top: 1px solid var(--nc-border);
}
.sep {
  opacity: 0.4;
}
.spacer {
  flex: 1;
}
</style>
