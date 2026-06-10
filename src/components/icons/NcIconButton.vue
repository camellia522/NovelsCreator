<script setup lang="ts">
import NcIcon from '@/components/icons/NcIcon.vue'
import type { IconName } from '@/components/icons/icon-paths'

withDefaults(
  defineProps<{
    name: IconName
    size?: number
    label?: string
    danger?: boolean
  }>(),
  {
    size: 16,
    label: '',
    danger: false
  }
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    class="nc-icon-btn"
    :class="{ danger }"
    :title="label"
    :aria-label="label || undefined"
    @click="emit('click', $event)"
  >
    <NcIcon :name="name" :size="size" />
  </button>
</template>

<style scoped>
.nc-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--nc-icon, currentColor);
  cursor: pointer;
  transition:
    color var(--nc-transition-fast),
    background var(--nc-transition-fast);
}
.nc-icon-btn:hover {
  background: var(--nc-bg-elevated);
  color: var(--nc-text-primary);
}
.nc-icon-btn.danger:hover {
  color: var(--nc-danger);
}
</style>
