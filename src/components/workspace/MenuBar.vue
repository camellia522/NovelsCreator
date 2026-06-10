<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useEditorStore } from '@/stores/editor.store'
import { useProjectStore } from '@/stores/project.store'

const router = useRouter()
const ui = useUiStore()
const layout = useLayoutStore()
const editor = useEditorStore()
const project = useProjectStore()

const emit = defineEmits<{
  closeProject: []
  deleteProject: []
  backup: []
}>()

function openWizard(): void {
  router.push({
    name: 'generation-wizard',
    params: { chapterId: layout.selectedChapterId }
  })
}

function quickGenerate(): void {
  ui.generateOpen = true
}

function openWorldGenerator(): void {
  router.push({ name: 'world-generator' })
}
</script>

<template>
  <header class="menubar">
    <nav class="menu">
      <span class="menu-item">文件</span>
      <div class="dropdown">
        <button type="button" class="link" @click="emit('closeProject')">关闭项目</button>
        <button type="button" class="link danger" @click="emit('deleteProject')">删除项目…</button>
        <button type="button" class="link" @click="ui.exportOpen = true">导出…</button>
        <button type="button" class="link" @click="emit('backup')">备份项目</button>
        <button type="button" class="link" @click="ui.backupManagerOpen = true">备份管理…</button>
      </div>
    </nav>
    <nav class="menu">
      <span class="menu-item">生成</span>
      <div class="dropdown">
        <button type="button" class="link" @click="openWizard">三要素向导 (Ctrl+Enter)</button>
        <button type="button" class="link" @click="quickGenerate">快速生成</button>
        <button type="button" class="link" @click="ui.generateOutlineOpen = true">AI 生成大纲</button>
        <button type="button" class="link" @click="ui.generateKnowledgeOpen = true">AI 生成知识库</button>
      </div>
    </nav>
    <nav class="menu">
      <span class="menu-item">工具</span>
      <div class="dropdown">
        <button type="button" class="link" @click="openWorldGenerator">世界观生成器</button>
      </div>
    </nav>
    <nav class="menu">
      <span class="menu-item">视图</span>
      <div class="dropdown">
        <button type="button" class="link" @click="layout.toggleBottomPanel()">切换控制台</button>
        <button type="button" class="link" @click="layout.toggleSidePanel()">切换侧栏</button>
      </div>
    </nav>
    <span class="project">{{ project.current?.name }}</span>
  </header>
</template>

<style scoped>
.menubar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  height: 32px;
  background: var(--nc-bg-panel);
  border-bottom: 1px solid var(--nc-border);
  font-size: 13px;
}
.menu {
  position: relative;
  padding: 6px 8px;
  cursor: default;
}
.menu:hover .dropdown {
  display: block;
}
.dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 180px;
  background: var(--nc-bg-elevated);
  border: 1px solid var(--nc-border);
  border-radius: 6px;
  padding: 4px;
  z-index: 50;
}
.link {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  background: none;
  color: var(--nc-text-primary);
  border-radius: 4px;
  font-size: 13px;
}
.link:hover {
  background: var(--nc-bg-base);
}
.link.danger {
  color: var(--nc-danger);
}
.link.danger:hover {
  background: color-mix(in srgb, var(--nc-danger) 12%, transparent);
}
.project {
  color: var(--nc-text-muted);
  margin-left: 8px;
}
</style>
