<script setup lang="ts">
import { useLayoutStore } from '@/stores/layout.store'
import ProjectExplorer from '@/components/explorer/ProjectExplorer.vue'
import OutlineTreePanel from '@/components/outline/OutlineTreePanel.vue'
import KnowledgePanel from '@/components/knowledge/KnowledgePanel.vue'
import MemoryPanel from '@/components/memory/MemoryPanel.vue'

const layout = useLayoutStore()

const panels = {
  explorer: ProjectExplorer,
  outline: OutlineTreePanel,
  knowledge: KnowledgePanel,
  memory: MemoryPanel
} as const
</script>

<template>
  <aside v-show="layout.sidePanelVisible" class="side-panel nc-card">
    <component :is="panels[layout.activity]" />
  </aside>
</template>

<style scoped>
.side-panel {
  min-height: 0;
  overflow: auto;
  padding: 10px;
  margin: 0;
  border-radius: 0;
  border-left: none;
  border-top: none;
  border-bottom: none;
}
</style>
