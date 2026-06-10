import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { KnowledgeWorkflowOutputs, OutlineWorkflowOutputs, WorkflowOutputs } from '@/types/api'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useLayoutStore } from '@/stores/layout.store'

export type DirtyConfirmAction = 'save' | 'discard' | 'cancel'

export type KnowledgeTabId = 'world' | 'characters' | 'appeared' | 'factions' | 'items'

export const useUiStore = defineStore('ui', () => {
  const settingsOpen = ref(false)
  const aboutOpen = ref(false)
  const exportOpen = ref(false)
  const generateOpen = ref(false)
  const generateOutlineOpen = ref(false)
  const generateKnowledgeOpen = ref(false)
  const backupManagerOpen = ref(false)
  const bottomPanelOpen = ref(true)
  /** 主编辑区显示世界平面地图编辑器 */
  const worldMapEditOpen = ref(false)
  /** 设定侧栏打开指定 tab（如生成后跳转「已出现」） */
  const knowledgeTabRequest = ref<KnowledgeTabId | null>(null)

  function openKnowledgeTab(tab: KnowledgeTabId): void {
    knowledgeTabRequest.value = tab
  }

  function consumeKnowledgeTabRequest(): KnowledgeTabId | null {
    const t = knowledgeTabRequest.value
    knowledgeTabRequest.value = null
    return t
  }

  async function openWorldMapEdit(): Promise<void> {
    const knowledge = useKnowledgeStore()
    const layout = useLayoutStore()
    await knowledge.loadIfEmpty()
    await knowledge.ensureMapImageLoaded()
    layout.setActivity('knowledge')
    worldMapEditOpen.value = true
  }

  function closeWorldMapEdit(): void {
    worldMapEditOpen.value = false
  }

  const dirtyConfirmOpen = ref(false)
  const dirtyConfirmMessage = ref('')
  let dirtyResolve: ((action: DirtyConfirmAction) => void) | null = null

  const circuitBreakOpen = ref(false)
  const circuitBreakKind = ref<'chapter' | 'outline' | 'knowledge'>('chapter')
  const circuitBreakOutputs = ref<WorkflowOutputs | OutlineWorkflowOutputs | KnowledgeWorkflowOutputs | null>(null)
  const circuitBreakChapterId = ref('')

  function showDirtyConfirm(message: string): Promise<DirtyConfirmAction> {
    if (dirtyConfirmOpen.value) {
      return Promise.resolve('cancel')
    }
    dirtyConfirmMessage.value = message
    dirtyConfirmOpen.value = true
    return new Promise((resolve) => {
      dirtyResolve = resolve
    })
  }

  function resolveDirtyConfirm(action: DirtyConfirmAction): void {
    dirtyConfirmOpen.value = false
    dirtyResolve?.(action)
    dirtyResolve = null
  }

  function showCircuitBreak(chapterId: string, outputs: WorkflowOutputs): void {
    circuitBreakKind.value = 'chapter'
    circuitBreakChapterId.value = chapterId
    circuitBreakOutputs.value = outputs
    circuitBreakOpen.value = true
  }

  function showOutlineCircuitBreak(outputs: OutlineWorkflowOutputs): void {
    circuitBreakKind.value = 'outline'
    circuitBreakChapterId.value = ''
    circuitBreakOutputs.value = outputs
    circuitBreakOpen.value = true
  }

  function showKnowledgeCircuitBreak(outputs: KnowledgeWorkflowOutputs): void {
    circuitBreakKind.value = 'knowledge'
    circuitBreakChapterId.value = ''
    circuitBreakOutputs.value = outputs
    circuitBreakOpen.value = true
  }

  function closeCircuitBreak(): void {
    circuitBreakOpen.value = false
    circuitBreakOutputs.value = null
  }

  return {
    settingsOpen,
    aboutOpen,
    exportOpen,
    generateOpen,
    generateOutlineOpen,
    generateKnowledgeOpen,
    backupManagerOpen,
    bottomPanelOpen,
    worldMapEditOpen,
    knowledgeTabRequest,
    openKnowledgeTab,
    consumeKnowledgeTabRequest,
    openWorldMapEdit,
    closeWorldMapEdit,
    dirtyConfirmOpen,
    dirtyConfirmMessage,
    circuitBreakOpen,
    circuitBreakKind,
    circuitBreakOutputs,
    circuitBreakChapterId,
    showDirtyConfirm,
    resolveDirtyConfirm,
    showCircuitBreak,
    showOutlineCircuitBreak,
    showKnowledgeCircuitBreak,
    closeCircuitBreak
  }
})
