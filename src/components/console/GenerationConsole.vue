<script setup lang="ts">
import { computed } from 'vue'
import { useDifyStore } from '@/stores/dify.store'
import { useLayoutStore } from '@/stores/layout.store'

const dify = useDifyStore()
const layout = useLayoutStore()

const runningLabel = computed(() => {
  if (dify.outlineRunning) return '大纲生成中…'
  if (dify.knowledgeRunning) return '知识库生成中…'
  if (dify.running) return '章节生成中…'
  return ''
})

function clear(): void {
  dify.consoleLines.length = 0
}
</script>

<template>
  <div
    v-show="!layout.bottomPanelCollapsed"
    class="console-panel nc-card"
    :style="{ height: `${layout.bottomPanelHeight}px` }"
  >
    <header class="head">
      <h3>
        Generation Console
        <span v-if="runningLabel" class="running">{{ runningLabel }}</span>
      </h3>
      <div class="actions">
        <button type="button" class="nc-btn nc-btn-sm" @click="clear">清空</button>
        <button type="button" class="nc-btn nc-btn-sm" @click="layout.toggleBottomPanel()">折叠</button>
      </div>
    </header>
    <ul>
      <li v-for="(line, i) in dify.consoleLines" :key="i" :class="line.level">
        <span class="time">{{ line.time }}</span> {{ line.message }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.console-panel {
  margin: 0;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-bottom: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 8px 12px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.head h3 {
  margin: 0;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.running {
  color: var(--nc-accent);
  font-weight: normal;
}
.actions {
  display: flex;
  gap: 6px;
}
ul {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--nc-font-editor);
  font-size: 12px;
}
.time {
  color: var(--nc-text-muted);
  margin-right: 8px;
}
.error {
  color: var(--nc-danger);
}
.success {
  color: var(--nc-success);
}
.nc-btn-sm {
  padding: 2px 8px;
  font-size: 11px;
}
</style>
