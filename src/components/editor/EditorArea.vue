<script setup lang="ts">
import { useEditorStore } from '@/stores/editor.store'
import { useUiStore } from '@/stores/ui.store'
import TabBar from '@/components/editor/TabBar.vue'
import EditorPane from '@/components/editor/EditorPane.vue'
import EmptyEditorPlaceholder from '@/components/editor/EmptyEditorPlaceholder.vue'
import WorldMapEditPane from '@/components/world/WorldMapEditPane.vue'

const editor = useEditorStore()
const ui = useUiStore()
</script>

<template>
  <div class="editor-area">
    <TabBar v-if="!ui.worldMapEditOpen" />
    <WorldMapEditPane v-if="ui.worldMapEditOpen" />
    <EditorPane v-else-if="editor.activeTab" />
    <EmptyEditorPlaceholder v-else />
  </div>
</template>

<style scoped>
.editor-area {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--nc-bg-base);
}
</style>
