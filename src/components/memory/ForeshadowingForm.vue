<script setup lang="ts">
import type { ForeshadowingEntry } from '@/types/project'
import NcIconButton from '@/components/icons/NcIconButton.vue'

defineProps<{ entry: ForeshadowingEntry }>()
const emit = defineEmits<{ remove: []; dirty: [] }>()
</script>

<template>
  <div class="fs-form">
    <div class="card-head">
      <strong>{{ entry.id }}</strong>
      <NcIconButton name="trash" :size="16" label="删除" danger @click="emit('remove')" />
    </div>
    <p v-if="entry.plantedIn" class="planted">埋设于 {{ entry.plantedIn }}</p>
    <label class="field check">
      <input v-model="entry.resolved" type="checkbox" @change="emit('dirty')" />
      <span>已揭示 / 已解决</span>
    </label>
    <textarea
      v-model="entry.description"
      class="nc-input area"
      rows="2"
      placeholder="伏笔描述…"
      @input="emit('dirty')"
    />
  </div>
</template>

<style scoped>
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.planted {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--nc-text-muted);
}
.field.check {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--nc-text-muted);
  margin-bottom: 6px;
}
.area {
  width: 100%;
  resize: vertical;
}
</style>
