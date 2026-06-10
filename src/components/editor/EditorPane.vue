<script setup lang="ts">

import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useEditorStore } from '@/stores/editor.store'

import MonacoTextEditor from '@/components/editor/MonacoTextEditor.vue'



const editor = useEditorStore()

const monacoRef = ref<InstanceType<typeof MonacoTextEditor> | null>(null)



const tab = computed(() => editor.activeTab)



function onContentUpdate(value: string): void {

  if (!tab.value) return

  editor.updateContent(tab.value.id, value)

}



async function save(): Promise<void> {

  if (!tab.value) return

  await editor.saveTab(tab.value.id)

}



function onKeydown(e: KeyboardEvent): void {

  if (e.ctrlKey && e.key === 's') {

    e.preventDefault()

    void save()

  }

}



onMounted(() => window.addEventListener('keydown', onKeydown))

onUnmounted(() => window.removeEventListener('keydown', onKeydown))

</script>



<template>

  <div v-if="tab" class="pane">

    <header class="toolbar">

      <span class="type">{{ tab.type === 'chapter-novel' ? '小说正文' : '视频稿' }}</span>

      <span class="save-hint">{{ tab.dirty ? '有未保存的更改' : '已保存到 chapters/' }}</span>

      <button type="button" class="nc-btn nc-btn-sm" :disabled="!tab.dirty" @click="save">

        立即保存 (Ctrl+S)

      </button>

    </header>

    <MonacoTextEditor

      ref="monacoRef"

      :tab-id="tab.id"

      :resource-key="tab.resourceKey"

      :content="tab.content"

      @update:content="onContentUpdate"

    />

  </div>

</template>



<style scoped>

.pane {

  flex: 1;

  display: flex;

  flex-direction: column;

  min-height: 0;

}

.toolbar {

  display: flex;

  align-items: center;

  gap: 10px;

  padding: 6px 10px;

  font-size: 12px;

  color: var(--nc-text-muted);

  border-bottom: 1px solid var(--nc-border);

}

.save-hint {

  flex: 1;

  font-size: 11px;

  text-align: center;

}

.nc-btn-sm {

  padding: 4px 10px;

  font-size: 12px;

}

</style>

