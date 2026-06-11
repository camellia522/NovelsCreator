<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import MenuBar from '@/components/workspace/MenuBar.vue'
import ActivityBar from '@/components/workspace/ActivityBar.vue'
import SidePanelHost from '@/components/workspace/SidePanelHost.vue'
import EditorArea from '@/components/editor/EditorArea.vue'
import GenerationConsole from '@/components/console/GenerationConsole.vue'
import StatusBar from '@/components/workspace/StatusBar.vue'
import GenerateChapterDialog from '@/components/generate/GenerateChapterDialog.vue'
import GenerateOutlineDialog from '@/components/generate/GenerateOutlineDialog.vue'
import GenerateKnowledgeDialog from '@/components/knowledge/GenerateKnowledgeDialog.vue'
import BackupManagerDialog from '@/components/backup/BackupManagerDialog.vue'
import { useProjectStore } from '@/stores/project.store'
import { useOutlineStore } from '@/stores/outline.store'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useMemoryStore } from '@/stores/memory.store'
import { useEditorStore } from '@/stores/editor.store'
import { useUiStore } from '@/stores/ui.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useDifyStore } from '@/stores/dify.store'
import { useAssistantStore } from '@/stores/assistant.store'
import { flushProjectPersist } from '@/utils/project-persist'

const router = useRouter()
const project = useProjectStore()
const outline = useOutlineStore()
const knowledge = useKnowledgeStore()
const memory = useMemoryStore()
const editor = useEditorStore()
const layout = useLayoutStore()
const dify = useDifyStore()
const ui = useUiStore()
const assistant = useAssistantStore()

const gridColumns = computed(() => {
  if (!layout.sidePanelVisible) return '48px 1fr'
  return `48px ${layout.sidePanelWidth}px 4px 1fr`
})

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  ui.closeWorldMapEdit()
  await layout.loadFromConfig()
  await Promise.all([
    outline.load(),
    knowledge.load(),
    memory.load(),
    assistant.loadSessionForProject()
  ])
  if (project.current?.autoBackupMessage) {
    dify.log('info', project.current.autoBackupMessage)
  }
})

onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function onKeydown(e: KeyboardEvent): void {
  if (e.ctrlKey && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    router.push({ name: 'generation-wizard', params: { chapterId: layout.selectedChapterId } })
  }
  if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
    e.preventDefault()
    ui.generateOpen = true
  }
}

function startSidebarResize(e: MouseEvent): void {
  e.preventDefault()
  const startX = e.clientX
  const startW = layout.sidePanelWidth
  const onMove = (ev: MouseEvent) => {
    layout.setSidePanelWidth(startW + ev.clientX - startX)
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function startConsoleResize(e: MouseEvent): void {
  e.preventDefault()
  layout.expandBottomPanel()
  const startY = e.clientY
  const startH = layout.bottomPanelHeight
  const onMove = (ev: MouseEvent) => {
    layout.setBottomPanelHeight(startH + (startY - ev.clientY))
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

async function runBackup(): Promise<void> {
  if (!window.novelsCreator?.backup?.run) return
  await flushProjectPersist()
  const res = await window.novelsCreator.backup.run()
  dify.log(res.ok ? 'success' : 'error', res.message)
  layout.expandBottomPanel()
}

watch(
  () => dify.lastOutputs,
  async (out) => {
    if (out?.status === 'success') {
      const ch = outline.getChapter(layout.selectedChapterId)
      await editor.openChapterTabs(
        layout.selectedChapterId,
        ch?.title ?? layout.selectedChapterId
      )
    }
  }
)

async function closeProject(): Promise<void> {
  editor.clearTabs()
  await project.close()
  await router.push({ name: 'welcome' })
}

async function deleteProject(): Promise<void> {
  const rootPath = project.current?.rootPath
  if (!rootPath) return
  await flushProjectPersist()
  const res = await project.remove(rootPath)
  if (res.cancelled || !res.ok) return
  editor.clearTabs()
  await router.push({ name: 'welcome' })
}
</script>

<template>
  <div class="workspace">
    <MenuBar @close-project="closeProject" @delete-project="deleteProject" @backup="runBackup" />

    <div
      class="grid"
      :style="{ gridTemplateColumns: gridColumns }"
      :class="{ 'no-sidebar': !layout.sidePanelVisible }"
    >
      <ActivityBar class="activity" />
      <SidePanelHost v-show="layout.sidePanelVisible" class="sidebar" />
      <div
        v-show="layout.sidePanelVisible"
        class="splitter"
        title="拖动调整侧栏宽度"
        @mousedown="startSidebarResize"
      />
      <EditorArea class="editor" />
      <div class="bottom-stack">
        <div
          v-show="!layout.bottomPanelCollapsed"
          class="console-splitter"
          title="拖动调整控制台高度"
          @mousedown="startConsoleResize"
        />
        <GenerationConsole class="bottom" />
      </div>
    </div>

    <StatusBar />

    <GenerateChapterDialog v-if="ui.generateOpen" @close="ui.generateOpen = false" />
    <GenerateOutlineDialog v-if="ui.generateOutlineOpen" @close="ui.generateOutlineOpen = false" />
    <GenerateKnowledgeDialog v-if="ui.generateKnowledgeOpen" @close="ui.generateKnowledgeOpen = false" />
    <BackupManagerDialog v-if="ui.backupManagerOpen" @close="ui.backupManagerOpen = false" />
  </div>
</template>

<style scoped>
.workspace {
  height: 100vh;
  display: grid;
  grid-template-rows: 32px 1fr 24px;
  min-width: 1024px;
}
.grid {
  display: grid;
  grid-template-rows: 1fr auto;
  grid-template-areas:
    'activity sidebar splitter editor'
    'activity bottom bottom bottom';
  min-height: 0;
}
.grid.no-sidebar {
  grid-template-areas:
    'activity editor editor editor'
    'activity bottom bottom bottom';
}
.activity {
  grid-area: activity;
}
.sidebar {
  grid-area: sidebar;
  min-width: 0;
}
.splitter {
  grid-area: splitter;
  cursor: col-resize;
  background: transparent;
  min-height: 0;
}
.splitter:hover {
  background: var(--nc-border);
}
.editor {
  grid-area: editor;
  min-height: 0;
}
.bottom-stack {
  grid-area: bottom;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.console-splitter {
  flex: 0 0 4px;
  cursor: row-resize;
  background: transparent;
}
.console-splitter:hover {
  background: var(--nc-border);
}
.bottom {
  flex: 0 0 auto;
  min-height: 0;
}
</style>
