<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useLayoutStore } from '@/stores/layout.store'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useUiStore } from '@/stores/ui.store'

const router = useRouter()
const layout = useLayoutStore()
const knowledge = useKnowledgeStore()
const ui = useUiStore()
const { doc } = storeToRefs(knowledge)

const hasWorldMap = computed(() => !!doc.value?.map)

function openWizard(): void {
  router.push({ name: 'generation-wizard', params: { chapterId: layout.selectedChapterId } })
}

function openWorldMapEdit(): void {
  void ui.openWorldMapEdit()
}
</script>

<template>
  <div class="empty">
    <template v-if="hasWorldMap">
      <p class="title">世界地图已就绪</p>
      <p class="desc">无需重新生成，可直接编辑领土、行省与城市并保存。</p>
      <button type="button" class="nc-btn nc-btn-primary" @click="openWorldMapEdit">
        编辑世界地图
      </button>
      <button type="button" class="nc-btn" @click="openWizard">
        Ctrl+Enter · 章节生成向导
      </button>
    </template>
    <template v-else>
      <p class="title">未打开文件</p>
      <p class="desc">从左侧选择章节，或在「设定」中生成/编辑世界地图</p>
      <button type="button" class="nc-btn nc-btn-primary" @click="openWizard">
        Ctrl+Enter · 三要素向导生成
      </button>
    </template>
  </div>
</template>

<style scoped>
.empty {
  flex: 1;
  display: grid;
  place-content: center;
  gap: 12px;
  text-align: center;
  color: var(--nc-text-muted);
  padding: 24px;
}
.title {
  margin: 0;
  font-size: 18px;
  color: var(--nc-text-primary);
}
.desc {
  margin: 0;
  font-size: 14px;
}
</style>
