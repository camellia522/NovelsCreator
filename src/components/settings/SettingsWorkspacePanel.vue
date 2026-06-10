<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import NcStatusLine from '@/components/icons/NcStatusLine.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useUiStore } from '@/stores/ui.store'

const layout = useLayoutStore()
const ui = useUiStore()
const { sidePanelWidth, bottomPanelHeight, sidePanelVisible, bottomPanelCollapsed } =
  storeToRefs(layout)
const resetting = ref(false)
const message = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

async function resetLayout(): Promise<void> {
  resetting.value = true
  message.value = null
  try {
    ui.closeWorldMapEdit()
    await layout.resetToDefaults()
    message.value = { kind: 'ok', text: '已恢复默认布局' }
  } catch (e) {
    message.value = {
      kind: 'err',
      text: e instanceof Error ? e.message : String(e)
    }
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <div class="panel">
    <section class="section">
      <h3 class="section-title">当前布局</h3>
      <ul class="stats">
        <li>侧栏宽度：<strong>{{ sidePanelWidth }}px</strong></li>
        <li>控制台高度：<strong>{{ bottomPanelHeight }}px</strong></li>
        <li>侧栏：<strong>{{ sidePanelVisible ? '显示' : '隐藏' }}</strong></li>
        <li>控制台：<strong>{{ bottomPanelCollapsed ? '折叠' : '展开' }}</strong></li>
      </ul>
      <p class="hint">布局会在调整侧栏/控制台时自动保存。</p>
    </section>

    <section class="section">
      <h3 class="section-title">恢复默认</h3>
      <p class="hint">重置侧栏宽度、Activity 选中项与控制台状态，并关闭地图编辑器。</p>
      <button type="button" class="nc-btn" :disabled="resetting" @click="resetLayout">
        {{ resetting ? '恢复中…' : '恢复工作区默认布局' }}
      </button>
      <NcStatusLine
        v-if="message"
        :kind="message.kind"
        :text="message.text"
      />
    </section>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.section-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.stats {
  margin: 0 0 8px;
  padding: 12px 14px;
  list-style: none;
  border: 1px solid var(--nc-border);
  border-radius: var(--nc-radius-sm);
  background: var(--nc-bg-base);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.stats strong {
  color: var(--nc-text-primary);
}
</style>
