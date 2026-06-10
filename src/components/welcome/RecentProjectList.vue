<script setup lang="ts">
import NcIconButton from '@/components/icons/NcIconButton.vue'

defineProps<{
  paths: string[]
}>()

const emit = defineEmits<{
  open: [path: string]
  delete: [path: string]
}>()

function folderName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}
</script>

<template>
  <section class="recent nc-card">
    <h2>最近项目</h2>
    <div v-if="!paths.length" class="empty muted">暂无最近项目，请新建或打开</div>
    <div v-else class="cards">
      <div v-for="path in paths" :key="path" class="project-card">
        <button type="button" class="open-area" @click="emit('open', path)">
          <span class="name">{{ folderName(path) }}</span>
          <span class="path">{{ path }}</span>
        </button>
        <NcIconButton
          name="trash"
          :size="16"
          label="删除项目"
          danger
          class="delete-btn"
          @click="emit('delete', path)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.recent h2 {
  margin: 0 0 12px;
  font-size: 16px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.project-card {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 4px 4px 4px 0;
  border-radius: 8px;
  border: 1px solid var(--nc-border);
  background: var(--nc-bg-base);
  transition: border-color var(--nc-transition-fast);
}
.project-card:hover {
  border-color: var(--nc-accent);
}
.open-area {
  flex: 1;
  min-width: 0;
  text-align: left;
  padding: 8px 8px 8px 12px;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
}
.name {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
}
.path {
  font-size: 11px;
  color: var(--nc-text-muted);
  word-break: break-all;
}
.delete-btn {
  flex-shrink: 0;
  margin-top: 6px;
  margin-right: 4px;
}
.empty {
  padding: 20px 0;
  text-align: center;
}
.muted {
  color: var(--nc-text-muted);
}
</style>
