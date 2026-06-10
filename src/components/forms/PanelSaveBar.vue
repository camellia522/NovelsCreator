<script setup lang="ts">
defineProps<{
  dirty: boolean
  saving: boolean
  label?: string
}>()
defineEmits<{ save: [] }>()
</script>

<template>
  <div class="save-bar-wrap">
    <p class="status" :class="{ ok: !dirty && !saving, pending: dirty && !saving, busy: saving }">
      {{
        saving
          ? '正在写入项目文件夹…'
          : dirty
            ? '有未保存的更改，请点击下方按钮保存'
            : '已保存到项目文件夹'
      }}
    </p>
    <button
      v-if="dirty"
      type="button"
      class="nc-btn save-bar nc-btn-primary"
      :disabled="saving"
      @click="$emit('save')"
    >
      {{ saving ? '保存中…' : label ?? '立即保存' }}
    </button>
  </div>
</template>

<style scoped>
.save-bar-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
}
.status {
  margin: 0;
  font-size: 11px;
  color: var(--nc-text-muted);
}
.status.pending {
  color: var(--nc-accent);
}
.status.busy {
  color: var(--nc-text-muted);
}
.status.ok {
  color: var(--nc-success);
}
.save-bar {
  width: 100%;
}
</style>
