<script setup lang="ts">
import { useEditorStore } from '@/stores/editor.store'
import { useUiStore } from '@/stores/ui.store'
import NcIcon from '@/components/icons/NcIcon.vue'
import NcIconButton from '@/components/icons/NcIconButton.vue'

const editor = useEditorStore()
const ui = useUiStore()

async function closeTab(tabId: string, e: Event): Promise<void> {
  e.stopPropagation()
  const tab = editor.tabs.find((t) => t.id === tabId)
  if (tab?.dirty) {
    const action = await ui.showDirtyConfirm(`关闭「${tab.title}」？`)
    if (action === 'cancel') return
    if (action === 'save') await editor.saveTab(tabId)
  }
  editor.closeTab(tabId)
}
</script>

<template>
  <div class="tab-bar">
    <button
      v-for="tab in editor.tabs"
      :key="tab.id"
      type="button"
      class="tab"
      :class="{ active: tab.id === editor.activeTabId }"
      @click="editor.setActiveTab(tab.id)"
    >
      <NcIcon v-if="tab.dirty" name="dot-filled" :size="8" class="dirty" />
      {{ tab.title }}
      <NcIconButton
        name="close"
        :size="14"
        label="关闭标签"
        class="close-btn"
        @click.stop="closeTab(tab.id, $event)"
      />
    </button>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  border-bottom: 1px solid var(--nc-border);
  background: var(--nc-bg-panel);
  min-height: 32px;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 12px;
  border: none;
  background: transparent;
  color: var(--nc-text-muted);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.tab.active {
  background: var(--nc-bg-base);
  color: var(--nc-text-primary);
  border-bottom: 2px solid var(--nc-accent);
}
.dirty {
  color: var(--nc-accent);
}
.close-btn {
  opacity: 0.65;
}
.close-btn:hover {
  opacity: 1;
}
</style>
