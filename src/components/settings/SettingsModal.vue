<script setup lang="ts">
import { ref } from 'vue'
import { SETTINGS_TAB_ICON } from '@/components/icons/icon-paths'
import NcIcon from '@/components/icons/NcIcon.vue'
import NcIconButton from '@/components/icons/NcIconButton.vue'
import SettingsAppearancePanel from '@/components/settings/SettingsAppearancePanel.vue'
import SettingsDifyPanel from '@/components/settings/SettingsDifyPanel.vue'
import SettingsGeneralPanel from '@/components/settings/SettingsGeneralPanel.vue'
import SettingsWorkspacePanel from '@/components/settings/SettingsWorkspacePanel.vue'
import type { IconName } from '@/components/icons/icon-paths'

const emit = defineEmits<{ close: [] }>()

type SettingsTab = 'appearance' | 'dify' | 'general' | 'workspace'

const tab = ref<SettingsTab>('appearance')

const tabs: { id: SettingsTab; label: string; icon: IconName }[] = [
  { id: 'appearance', icon: SETTINGS_TAB_ICON.appearance, label: '外观' },
  { id: 'dify', icon: SETTINGS_TAB_ICON.dify, label: 'Dify' },
  { id: 'general', icon: SETTINGS_TAB_ICON.general, label: '常规' },
  { id: 'workspace', icon: SETTINGS_TAB_ICON.workspace, label: '工作区' }
]
</script>

<template>
  <div class="nc-modal-overlay" @click.self="emit('close')">
    <div class="shell nc-card nc-modal-panel" role="dialog" aria-labelledby="settings-title">
      <header class="head">
        <h2 id="settings-title">设置</h2>
        <NcIconButton name="close" :size="18" label="关闭" @click="emit('close')" />
      </header>

      <div class="body">
        <nav class="nav">
          <button
            v-for="item in tabs"
            :key="item.id"
            type="button"
            class="nav-item"
            :class="{ active: tab === item.id }"
            @click="tab = item.id"
          >
            <NcIcon :name="item.icon" :size="18" class="nav-icon" />
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <div class="content">
          <Transition name="tab-fade" mode="out-in">
            <SettingsAppearancePanel v-if="tab === 'appearance'" key="appearance" />
            <SettingsDifyPanel v-else-if="tab === 'dify'" key="dify" />
            <SettingsGeneralPanel v-else-if="tab === 'general'" key="general" />
            <SettingsWorkspacePanel v-else key="workspace" />
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shell {
  width: min(720px, 94vw);
  height: min(560px, 88vh);
  padding: 0;
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--nc-border);
}
.head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.body {
  display: grid;
  grid-template-columns: 148px 1fr;
  min-height: 0;
  flex: 1;
  height: calc(100% - 57px);
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 10px;
  border-right: 1px solid var(--nc-border);
  background: var(--nc-bg-base);
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  border-radius: var(--nc-radius-sm);
  background: transparent;
  color: var(--nc-text-muted);
  font-size: 13px;
  text-align: left;
  transition:
    background var(--nc-transition-fast),
    color var(--nc-transition-fast);
}
.nav-item :deep(.nc-icon) {
  color: var(--nc-icon);
}
.nav-item:hover {
  background: var(--nc-bg-elevated);
  color: var(--nc-text-primary);
}
.nav-item.active {
  background: color-mix(in srgb, var(--nc-accent) 18%, var(--nc-bg-elevated));
  color: var(--nc-text-primary);
  box-shadow: inset 2px 0 0 var(--nc-accent);
}
.nav-item.active :deep(.nc-icon) {
  color: var(--nc-text-primary);
}
.nav-icon {
  flex-shrink: 0;
}
.content {
  padding: 18px 20px;
  overflow-y: auto;
  min-height: 0;
}
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.tab-fade-enter-from {
  opacity: 0;
  transform: translateX(6px);
}
.tab-fade-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}
</style>
