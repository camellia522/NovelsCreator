import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ChapterSummaryEntry, PlotMemoryDocument } from '@/types/project'
import type { MemoryUpdateInfo } from '@/types/api'
import { scheduleProjectPersist } from '@/utils/project-persist'
import { cloneForIpc } from '@/utils/ipc-serialize'
import {
  buildGlobalSummaryFromChapterSummaries,
  pruneGlobalSummaryChapterBlocks
} from '@/utils/plot-memory-global'

function isSummaryUsable(text: string | undefined | null): boolean {
  const s = text?.trim() ?? ''
  if (!s) return false
  if (s.length < 12 && /^[.…·\-—_~～\s]+$/.test(s)) return false
  if (/^(\.{2,}|…+)$/.test(s)) return false
  return true
}

export const useMemoryStore = defineStore('memory', () => {
  const doc = ref<PlotMemoryDocument | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const dirty = ref(false)
  const error = ref('')
  const tab = ref<'overview' | 'global' | 'chapters' | 'foreshadowing'>('overview')
  const highlightChapterId = ref<string | null>(null)
  const lastUpdate = ref<MemoryUpdateInfo | null>(null)

  const sortedChapterSummaries = computed(() =>
    [...(doc.value?.chapterSummaries ?? [])].sort((a, b) => a.chapterId.localeCompare(b.chapterId))
  )

  const activeForeshadowing = computed(() =>
    (doc.value?.foreshadowing ?? []).filter((f) => !f.resolved)
  )

  const resolvedForeshadowing = computed(() =>
    (doc.value?.foreshadowing ?? []).filter((f) => f.resolved)
  )

  const stats = computed(() => ({
    chapters: doc.value?.chapterSummaries.length ?? 0,
    foreshadowingOpen: activeForeshadowing.value.length,
    foreshadowingResolved: resolvedForeshadowing.value.length,
    globalLength: doc.value?.globalSummary?.length ?? 0
  }))

  function getChapterSummary(chapterId: string): ChapterSummaryEntry | undefined {
    return doc.value?.chapterSummaries.find((s) => s.chapterId === chapterId)
  }

  async function load(): Promise<void> {
    if (!window.novelsCreator) return
    loading.value = true
    error.value = ''
    try {
      const filled = await window.novelsCreator.project.backfillMissingSummaries()
      doc.value = await window.novelsCreator.project.getPlotMemory()
      const repaired = reconcileGlobalSummaryWithChapters()
      dirty.value = false
      if (repaired) await save()
      if (filled > 0) {
        lastUpdate.value = {
          chapterId: highlightChapterId.value ?? layoutChapterFromDoc(),
          globalDeltaAdded: Boolean(doc.value?.globalSummary?.trim()),
          chapterSummaryUpdated: true,
          foreshadowingChanged: 0
        }
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function layoutChapterFromDoc(): string {
    const list = doc.value?.chapterSummaries ?? []
    return list[list.length - 1]?.chapterId ?? 'ch-001'
  }

  async function backfillMissing(): Promise<number> {
    if (!window.novelsCreator) return 0
    const n = await window.novelsCreator.project.backfillMissingSummaries()
    if (n > 0) await load()
    return n
  }

  async function save(): Promise<void> {
    if (!doc.value || !window.novelsCreator) return
    saving.value = true
    try {
      doc.value = await window.novelsCreator.project.savePlotMemory(cloneForIpc(doc.value))
      dirty.value = false
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      saving.value = false
    }
  }

  async function saveIfDirty(): Promise<void> {
    if (dirty.value) await save()
  }

  function markDirty(): void {
    dirty.value = true
    scheduleProjectPersist()
  }

  async function applyGenerationUpdate(
    chapterId: string,
    update?: MemoryUpdateInfo
  ): Promise<void> {
    if (window.novelsCreator?.project.backfillChapterSummary) {
      await window.novelsCreator.project.backfillChapterSummary(chapterId)
    }
    await load()
    const entry = getChapterSummary(chapterId)
    lastUpdate.value = update
      ? {
          ...update,
          chapterSummaryUpdated: isSummaryUsable(entry?.summary)
        }
      : {
          chapterId,
          globalDeltaAdded: false,
          chapterSummaryUpdated: isSummaryUsable(entry?.summary),
          foreshadowingChanged: 0
        }
    highlightChapterId.value = chapterId
    if (isSummaryUsable(entry?.summary)) tab.value = 'chapters'
    else if (update?.globalDeltaAdded) tab.value = 'global'
    else tab.value = 'overview'
    window.setTimeout(() => {
      if (highlightChapterId.value === chapterId) highlightChapterId.value = null
    }, 10_000)
  }

  function focusChapter(chapterId: string): void {
    tab.value = 'chapters'
    highlightChapterId.value = chapterId
  }

  function addChapterSummary(chapterId = 'ch-001'): void {
    if (!doc.value) return
    if (doc.value.chapterSummaries.some((s) => s.chapterId === chapterId)) return
    doc.value.chapterSummaries.push({
      chapterId,
      title: '',
      summary: '',
      keyEvents: [],
      characterStates: [],
      openThreads: []
    })
    markDirty()
  }

  function rebuildGlobalSummaryFromChapters(): void {
    if (!doc.value) return
    doc.value.globalSummary = buildGlobalSummaryFromChapterSummaries(doc.value.chapterSummaries)
  }

  /** 加载后剔除已删章节的 globalSummary 节选，避免与 chapterSummaries 不一致 */
  function reconcileGlobalSummaryWithChapters(): boolean {
    if (!doc.value?.globalSummary?.trim()) return false
    const pruned = pruneGlobalSummaryChapterBlocks(
      doc.value.globalSummary,
      doc.value.chapterSummaries.map((s) => s.chapterId)
    )
    if (pruned === doc.value.globalSummary.trim()) return false
    doc.value.globalSummary = pruned
    return true
  }

  function removeChapterSummary(index: number): void {
    doc.value?.chapterSummaries.splice(index, 1)
    rebuildGlobalSummaryFromChapters()
    markDirty()
  }

  function removeChapterSummaryById(chapterId: string): void {
    if (!doc.value) return
    doc.value.chapterSummaries = doc.value.chapterSummaries.filter(
      (s) => s.chapterId !== chapterId
    )
    doc.value.foreshadowing = doc.value.foreshadowing.filter((f) => f.plantedIn !== chapterId)
    rebuildGlobalSummaryFromChapters()
    markDirty()
  }

  function addForeshadowing(): void {
    if (!doc.value) return
    const n = doc.value.foreshadowing.length + 1
    doc.value.foreshadowing.push({
      id: `fs-${String(n).padStart(3, '0')}`,
      description: '',
      resolved: false
    })
    markDirty()
  }

  function removeForeshadowing(index: number): void {
    doc.value?.foreshadowing.splice(index, 1)
    markDirty()
  }

  return {
    doc,
    loading,
    saving,
    dirty,
    error,
    tab,
    highlightChapterId,
    lastUpdate,
    sortedChapterSummaries,
    activeForeshadowing,
    resolvedForeshadowing,
    stats,
    load,
    save,
    saveIfDirty,
    markDirty,
    applyGenerationUpdate,
    focusChapter,
    backfillMissing,
    getChapterSummary,
    addChapterSummary,
    removeChapterSummary,
    removeChapterSummaryById,
    addForeshadowing,
    removeForeshadowing
  }
})
