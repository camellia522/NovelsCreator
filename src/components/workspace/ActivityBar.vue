<script setup lang="ts">
import type { ActivityId } from '@/stores/layout.store'
import { ACTIVITY_ICON } from '@/components/icons/icon-paths'
import NcIcon from '@/components/icons/NcIcon.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useUiStore } from '@/stores/ui.store'

const layout = useLayoutStore()
const ui = useUiStore()

const items: { id: ActivityId; label: string }[] = [
  { id: 'explorer', label: '资源' },
  { id: 'outline', label: '大纲' },
  { id: 'knowledge', label: '设定' },
  { id: 'memory', label: '记忆' },
  { id: 'assistant', label: '助手' }
]

function onClick(id: ActivityId): void {
  if (layout.activity === id) {
    layout.toggleSidePanel()
    return
  }
  layout.setActivity(id)
}
</script>

<template>
  <nav class="activity-bar">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="btn"
      :class="{ active: layout.activity === item.id && layout.sidePanelVisible }"
      :title="item.label"
      @click="onClick(item.id)"
    >
      <NcIcon :name="ACTIVITY_ICON[item.id]" :size="20" />
    </button>
    <div class="spacer" />
    <button type="button" class="btn settings" title="设置" @click="ui.settingsOpen = true">
      <NcIcon name="settings" :size="20" />
    </button>
  </nav>
</template>

<style scoped>
.activity-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 48px;
  padding: 8px 0;
  background: var(--nc-bg-panel);
  border-right: 1px solid var(--nc-border);
}
.btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--nc-radius-sm);
  background: transparent;
  cursor: pointer;
  display: grid;
  place-items: center;
  color: var(--nc-icon);
  transition:
    background var(--nc-transition-fast),
    box-shadow var(--nc-transition-fast),
    color var(--nc-transition-fast),
    transform 0.1s ease;
}
.btn:hover {
  background: var(--nc-bg-elevated);
  color: var(--nc-text-primary);
}
.btn:active {
  transform: scale(0.94);
}
.btn.active {
  background: var(--nc-bg-elevated);
  box-shadow: inset 2px 0 0 var(--nc-accent);
  color: var(--nc-text-primary);
}
.spacer {
  flex: 1;
}
.settings {
  margin-bottom: 4px;
}
</style>
