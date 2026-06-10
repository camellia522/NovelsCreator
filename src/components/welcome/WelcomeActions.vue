<script setup lang="ts">
import NcIcon from '@/components/icons/NcIcon.vue'

const emit = defineEmits<{
  newProject: []
  openProject: []
}>()
</script>

<template>
  <div class="actions-grid">
    <button type="button" class="action-card nc-card" @click="emit('newProject')">
      <span class="icon-wrap">
        <NcIcon name="file-plus" :size="28" />
      </span>
      <strong>新建项目</strong>
      <span class="desc">创建小说工作空间</span>
    </button>
    <button type="button" class="action-card nc-card" @click="emit('openProject')">
      <span class="icon-wrap">
        <NcIcon name="folder-open" :size="28" />
      </span>
      <strong>打开项目</strong>
      <span class="desc">选择含 project.json 的文件夹</span>
    </button>
  </div>
</template>

<style scoped>
.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}
.action-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  text-align: left;
  cursor: pointer;
  min-height: 120px;
  transition: border-color var(--nc-transition-fast);
}
.action-card:hover .icon-wrap {
  color: var(--nc-text-primary);
}
.icon-wrap {
  color: var(--nc-icon);
  line-height: 1;
  transition: color var(--nc-transition-fast);
}
.desc {
  font-size: 13px;
  color: var(--nc-text-muted);
}
</style>
