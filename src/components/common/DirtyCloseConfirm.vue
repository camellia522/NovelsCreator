<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore } from '@/stores/ui.store'
import { flushProjectPersist } from '@/utils/project-persist'

const ui = useUiStore()
const saveError = ref('')

async function choose(action: 'save' | 'discard' | 'cancel'): Promise<void> {
  saveError.value = ''
  if (action === 'save') {
    try {
      await flushProjectPersist()
    } catch (e) {
      saveError.value = e instanceof Error ? e.message : '保存失败，请重试'
      return
    }
  }
  ui.resolveDirtyConfirm(action)
}
</script>

<template>
  <div class="overlay">
    <div class="modal nc-card">
      <h2>未保存的更改</h2>
      <p>{{ ui.dirtyConfirmMessage }}</p>
      <p v-if="saveError" class="error">{{ saveError }}</p>
      <footer class="actions">
        <button type="button" class="nc-btn" @click="choose('cancel')">取消</button>
        <button type="button" class="nc-btn" @click="choose('discard')">不保存</button>
        <button type="button" class="nc-btn nc-btn-primary" @click="choose('save')">保存</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  z-index: 2000;
}
.modal {
  width: min(400px, 92vw);
}
h2 {
  margin: 0 0 10px;
  font-size: 17px;
}
p {
  margin: 0 0 16px;
  color: var(--nc-text-muted);
  font-size: 14px;
}
.error {
  color: var(--nc-danger);
  margin-top: -8px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
