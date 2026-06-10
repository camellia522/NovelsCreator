<script setup lang="ts">
import NcIcon from '@/components/icons/NcIcon.vue'

defineProps<{
  kind: 'ok' | 'err' | 'info'
  text: string
}>()
</script>

<template>
  <p class="status" :class="kind">
    <NcIcon v-if="kind === 'ok'" name="check" :size="14" />
    <NcIcon v-else-if="kind === 'err'" name="close" :size="14" />
    <span>{{ text }}</span>
  </p>
</template>

<style scoped>
.status {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  margin: 8px 0 0;
  color: var(--nc-text-muted);
}
.status.ok {
  color: var(--nc-success);
}
.status.err {
  color: var(--nc-danger);
}
</style>
