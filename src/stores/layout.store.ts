import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { WorkspaceActivityId, WorkspaceLayoutPrefs } from '@/types/api'

export type ActivityId = WorkspaceActivityId

const DEFAULT_SIDE_WIDTH = 260

export const useLayoutStore = defineStore('layout', () => {
  const activity = ref<ActivityId>('explorer')
  const sidePanelVisible = ref(true)
  const bottomPanelCollapsed = ref(true)
  const bottomPanelHeight = ref(180)
  const sidePanelWidth = ref(DEFAULT_SIDE_WIDTH)
  const selectedChapterId = ref('ch-001')

  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let layoutLoaded = false

  function schedulePersist(): void {
    if (!layoutLoaded || !window.novelsCreator?.config?.setLayout) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      void window.novelsCreator.config.setLayout(snapshot())
    }, 500)
  }

  function snapshot(): WorkspaceLayoutPrefs {
    return {
      activity: activity.value,
      sidePanelVisible: sidePanelVisible.value,
      bottomPanelCollapsed: bottomPanelCollapsed.value,
      bottomPanelHeight: bottomPanelHeight.value,
      sidePanelWidth: sidePanelWidth.value
    }
  }

  function apply(prefs: WorkspaceLayoutPrefs | undefined): void {
    if (!prefs) return
    if (prefs.activity) activity.value = prefs.activity
    if (prefs.sidePanelVisible !== undefined) sidePanelVisible.value = prefs.sidePanelVisible
    if (prefs.bottomPanelCollapsed !== undefined) {
      bottomPanelCollapsed.value = prefs.bottomPanelCollapsed
    }
    if (prefs.bottomPanelHeight !== undefined) {
      bottomPanelHeight.value = Math.max(120, Math.min(480, prefs.bottomPanelHeight))
    }
    if (prefs.sidePanelWidth !== undefined) {
      sidePanelWidth.value = Math.max(200, Math.min(480, prefs.sidePanelWidth))
    }
  }

  async function loadFromConfig(): Promise<void> {
    if (!window.novelsCreator?.config?.get) {
      layoutLoaded = true
      return
    }
    try {
      const config = await window.novelsCreator.config.get()
      apply(config.workspaceLayout)
    } catch {
      /* ignore */
    } finally {
      layoutLoaded = true
    }
  }

  watch(
    [activity, sidePanelVisible, bottomPanelCollapsed, bottomPanelHeight, sidePanelWidth],
    () => schedulePersist()
  )

  function setActivity(id: ActivityId): void {
    activity.value = id
    sidePanelVisible.value = true
  }

  function toggleSidePanel(): void {
    sidePanelVisible.value = !sidePanelVisible.value
  }

  function expandBottomPanel(): void {
    bottomPanelCollapsed.value = false
  }

  function toggleBottomPanel(): void {
    bottomPanelCollapsed.value = !bottomPanelCollapsed.value
  }

  function setSidePanelWidth(px: number): void {
    sidePanelWidth.value = Math.max(200, Math.min(480, px))
  }

  function setBottomPanelHeight(px: number): void {
    bottomPanelHeight.value = Math.max(120, Math.min(480, px))
  }

  async function resetToDefaults(): Promise<void> {
    activity.value = 'explorer'
    sidePanelVisible.value = true
    bottomPanelCollapsed.value = true
    bottomPanelHeight.value = 180
    sidePanelWidth.value = DEFAULT_SIDE_WIDTH
    if (window.novelsCreator?.config?.clearWorkspaceLayout) {
      await window.novelsCreator.config.clearWorkspaceLayout()
    }
    schedulePersist()
  }

  return {
    activity,
    sidePanelVisible,
    bottomPanelCollapsed,
    bottomPanelHeight,
    sidePanelWidth,
    selectedChapterId,
    loadFromConfig,
    apply,
    setActivity,
    toggleSidePanel,
    expandBottomPanel,
    toggleBottomPanel,
    setSidePanelWidth,
    setBottomPanelHeight,
    resetToDefaults
  }
})
