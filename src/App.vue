<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import SettingsModal from '@/components/settings/SettingsModal.vue'
import AboutDialog from '@/components/about/AboutDialog.vue'
import ExportDialog from '@/components/export/ExportDialog.vue'
import DirtyCloseConfirm from '@/components/common/DirtyCloseConfirm.vue'
import CircuitBreakModal from '@/components/generate/CircuitBreakModal.vue'
import { useUiStore } from '@/stores/ui.store'
import { useConfigStore } from '@/stores/config.store'
import { flushProjectPersist } from '@/utils/project-persist'
import { APP_TITLE } from '@/constants/app-meta'

const ui = useUiStore()
const config = useConfigStore()

onMounted(async () => {
  document.title = APP_TITLE
  window.__ncFlushProject = flushProjectPersist
  await config.load()
})
</script>
<template>
  <div class="app-root">
    <RouterView />
  </div>

  <SettingsModal v-if="ui.settingsOpen" @close="ui.settingsOpen = false" />
  <AboutDialog v-if="ui.aboutOpen" />
  <ExportDialog v-if="ui.exportOpen" @close="ui.exportOpen = false" />
  <DirtyCloseConfirm v-if="ui.dirtyConfirmOpen" />
  <CircuitBreakModal v-if="ui.circuitBreakOpen" />
</template>

<style scoped>
.app-root {
  min-height: 100vh;
  min-width: 1024px;
}
</style>
