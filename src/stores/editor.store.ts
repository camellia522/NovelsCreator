import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { scheduleProjectPersist } from '@/utils/project-persist'

export type TabType = 'chapter-novel' | 'chapter-video'

export interface EditorTab {
  id: string
  type: TabType
  title: string
  resourceKey: string
  chapterId?: string
  content: string
  dirty: boolean
}

export interface OpenTabDescriptor {
  type: TabType
  title: string
  resourceKey: string
  chapterId?: string
  focus?: boolean
}

export const useEditorStore = defineStore('editor', () => {
  const tabs = ref<EditorTab[]>([])
  const activeTabId = ref<string | null>(null)

  const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value) ?? null)
  const hasDirtyTabs = computed(() => tabs.value.some((t) => t.dirty))

  function tabIdFromKey(resourceKey: string): string {
    return `tab-${resourceKey}`
  }

  async function loadContent(desc: OpenTabDescriptor): Promise<string> {
    if (!window.novelsCreator) return ''
    return window.novelsCreator.project.getChapterText(desc.chapterId ?? '', desc.type === 'chapter-novel' ? 'novel' : 'video')
  }

  async function openTab(desc: OpenTabDescriptor): Promise<EditorTab> {
    const existing = tabs.value.find((t) => t.resourceKey === desc.resourceKey)
    if (existing) {
      if (desc.focus !== false) activeTabId.value = existing.id
      return existing
    }

    const content = await loadContent(desc)
    const tab: EditorTab = {
      id: tabIdFromKey(desc.resourceKey),
      type: desc.type,
      title: desc.title,
      resourceKey: desc.resourceKey,
      chapterId: desc.chapterId,
      content,
      dirty: false
    }
    tabs.value.push(tab)
    if (desc.focus !== false) activeTabId.value = tab.id
    return tab
  }

  function setActiveTab(tabId: string): void {
    activeTabId.value = tabId
  }

  function updateContent(tabId: string, content: string): void {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (!tab) return
    tab.content = content
    tab.dirty = true
    scheduleProjectPersist(1200)
  }

  async function saveTab(tabId: string): Promise<void> {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (!tab || !tab.chapterId) return

    const kind = tab.type === 'chapter-novel' ? 'novel' : 'video'
    await window.novelsCreator.project.saveChapterText(tab.chapterId, kind, tab.content)
    tab.dirty = false
  }

  async function saveAll(): Promise<void> {
    for (const tab of tabs.value.filter((t) => t.dirty)) {
      await saveTab(tab.id)
    }
  }

  function closeTab(tabId: string): void {
    const idx = tabs.value.findIndex((t) => t.id === tabId)
    if (idx < 0) return
    tabs.value.splice(idx, 1)
    if (activeTabId.value === tabId) {
      const next = tabs.value[idx] ?? tabs.value[idx - 1]
      activeTabId.value = next?.id ?? null
    }
  }

  function closeChapterTabs(chapterId: string): void {
    const ids = tabs.value.filter((t) => t.chapterId === chapterId).map((t) => t.id)
    for (const id of ids) closeTab(id)
  }

  function clearTabs(): void {
    tabs.value = []
    activeTabId.value = null
  }

  async function openChapterTabs(chapterId: string, title: string): Promise<void> {
    await openTab({
      type: 'chapter-novel',
      title: `${title || chapterId} · 正文`,
      resourceKey: `${chapterId}:novel`,
      chapterId,
      focus: true
    })
    await openTab({
      type: 'chapter-video',
      title: `${title || chapterId} · 视频稿`,
      resourceKey: `${chapterId}:video`,
      chapterId,
      focus: false
    })
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    hasDirtyTabs,
    openTab,
    setActiveTab,
    updateContent,
    saveTab,
    saveAll,
    closeTab,
    closeChapterTabs,
    clearTabs,
    openChapterTabs
  }
})
