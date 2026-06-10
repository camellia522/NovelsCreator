<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import WelcomeHeader from '@/components/welcome/WelcomeHeader.vue'
import WelcomeActions from '@/components/welcome/WelcomeActions.vue'
import RecentProjectList from '@/components/welcome/RecentProjectList.vue'
import NewProjectDialog from '@/components/welcome/NewProjectDialog.vue'
import { useProjectStore } from '@/stores/project.store'
import { onMounted } from 'vue'

const router = useRouter()
const project = useProjectStore()
const newOpen = ref(false)

onMounted(() => {
  project.loadRecent()
})

async function openProject(): Promise<void> {
  const path = await window.novelsCreator.project.pickOpen()
  if (!path) return
  await project.open(path)
  await router.push({ name: 'workspace' })
}

async function openRecent(path: string): Promise<void> {
  await project.open(path)
  await router.push({ name: 'workspace' })
}

async function deleteRecent(path: string): Promise<void> {
  await project.remove(path)
}
</script>

<template>
  <div class="welcome-page">
    <WelcomeHeader />
    <main class="content">
      <section class="hero">
        <h1>开始你的长篇创作</h1>
        <p>大纲 · 设定 · 记忆 · 正文 — 均可编辑，均可 AI 生成</p>
      </section>
      <WelcomeActions @new-project="newOpen = true" @open-project="openProject" />
      <RecentProjectList :paths="project.recent" @open="openRecent" @delete="deleteRecent" />
      <p v-if="project.error" class="error">{{ project.error }}</p>
    </main>
    <NewProjectDialog v-if="newOpen" @close="newOpen = false" />
  </div>
</template>

<style scoped>
.welcome-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.content {
  flex: 1;
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px 48px;
  display: grid;
  gap: 24px;
  width: 100%;
}
.hero h1 {
  margin: 0 0 8px;
  font-size: 28px;
}
.hero p {
  margin: 0;
  color: var(--nc-text-muted);
}
.error {
  color: var(--nc-danger);
  font-size: 13px;
}
</style>
