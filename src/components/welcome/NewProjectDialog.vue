<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/stores/project.store'
import { useConfigStore } from '@/stores/config.store'

const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const project = useProjectStore()
const config = useConfigStore()
const { defaultProjectsDir } = storeToRefs(config)

const name = ref('我的小说')
const author = ref('')
const parentDir = ref('')
const creating = ref(false)

onMounted(() => {
  if (defaultProjectsDir.value) parentDir.value = defaultProjectsDir.value
})

async function pickDir(): Promise<void> {
  const path = await window.novelsCreator.project.pickDirectory()
  if (path) parentDir.value = path
}
async function create(): Promise<void> {
  creating.value = true
  try {
    await project.create(name.value.trim() || '我的小说', parentDir.value || undefined)
    emit('close')
    await router.push({ name: 'workspace' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="nc-modal-overlay" @click.self="emit('close')">
    <div class="modal nc-card nc-modal-panel">
      <header class="head">
        <h2>新建项目</h2>
        <button type="button" class="nc-btn" @click="emit('close')">取消</button>
      </header>

      <label class="field">
        <span>书名</span>
        <input v-model="name" class="nc-input" />
      </label>
      <label class="field">
        <span>作者（可选）</span>
        <input v-model="author" class="nc-input" />
      </label>
      <label class="field">
        <span>保存位置</span>
        <div class="row">
          <input v-model="parentDir" class="nc-input" readonly placeholder="选择父目录…" />
          <button type="button" class="nc-btn" @click="pickDir">浏览</button>
        </div>
      </label>

      <p v-if="project.error" class="error">{{ project.error }}</p>

      <footer class="actions">
        <button type="button" class="nc-btn nc-btn-primary" :disabled="creating" @click="create">
          {{ creating ? '创建中…' : '创建并打开' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal {
  width: min(480px, 92vw);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.head h2 {
  margin: 0;
}
.field {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--nc-text-muted);
}
.row {
  display: flex;
  gap: 8px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.error {
  color: var(--nc-danger);
  font-size: 13px;
}
</style>
