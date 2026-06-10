import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { OutlineBeat, OutlineChapter, OutlineDocument } from '@/types/project'
import { scheduleProjectPersist } from '@/utils/project-persist'
import { cloneForIpc } from '@/utils/ipc-serialize'

export const useOutlineStore = defineStore('outline', () => {
  const doc = ref<OutlineDocument | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const dirty = ref(false)
  const error = ref('')

  const chapters = computed(() => {
    const list: OutlineChapter[] = []
    for (const vol of doc.value?.volumes ?? []) {
      for (const ch of vol.chapters ?? []) {
        list.push(ch)
      }
    }
    return list
  })

  function getChapter(chapterId: string): OutlineChapter | undefined {
    return chapters.value.find((c) => c.id === chapterId)
  }

  async function load(): Promise<void> {
    if (!window.novelsCreator) return
    loading.value = true
    error.value = ''
    try {
      doc.value = await window.novelsCreator.project.getOutline()
      dirty.value = false
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function save(): Promise<void> {
    if (!doc.value || !window.novelsCreator) return
    saving.value = true
    error.value = ''
    try {
      doc.value = await window.novelsCreator.project.saveOutline(cloneForIpc(doc.value))
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

  function updateChapterTitle(chapterId: string, title: string): void {
    const ch = getChapter(chapterId)
    if (!ch) return
    ch.title = title
    markDirty()
  }

  function setBeats(chapterId: string, beats: OutlineBeat[]): void {
    const ch = getChapter(chapterId)
    if (!ch) return
    ch.beats = beats.map((b, i) => ({ order: i + 1, text: b.text }))
    markDirty()
  }

  function addBeat(chapterId: string, text = ''): void {
    const ch = getChapter(chapterId)
    if (!ch) return
    const order = (ch.beats?.length ?? 0) + 1
    ch.beats = [...(ch.beats ?? []), { order, text }]
    markDirty()
  }

  function removeBeat(chapterId: string, index: number): void {
    const ch = getChapter(chapterId)
    if (!ch?.beats) return
    ch.beats = ch.beats.filter((_, i) => i !== index).map((b, i) => ({ ...b, order: i + 1 }))
    markDirty()
  }

  function updateBeatText(chapterId: string, index: number, text: string): void {
    const ch = getChapter(chapterId)
    if (!ch?.beats?.[index]) return
    ch.beats[index].text = text
    markDirty()
  }

  async function addChapter(volId = 'vol-01'): Promise<string> {
    if (!doc.value) return ''
    let vol = doc.value.volumes.find((v) => v.id === volId)
    if (!vol) {
      vol = { id: volId, title: '新卷', chapters: [] }
      doc.value.volumes.push(vol)
    }
    const n = vol.chapters.length + 1
    const id = `ch-${String(n).padStart(3, '0')}`
    vol.chapters.push({
      id,
      title: `第${n}章`,
      status: 'draft',
      beats: []
    })
    markDirty()
    return id
  }

  function addVolume(): string {
    if (!doc.value) return ''
    const nums = doc.value.volumes
      .map((v) => /^vol-(\d+)$/.exec(v.id)?.[1])
      .filter(Boolean)
      .map((n) => parseInt(n!, 10))
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    const id = `vol-${String(next).padStart(2, '0')}`
    doc.value.volumes.push({ id, title: `第${next}卷`, chapters: [] })
    markDirty()
    return id
  }

  /** 从大纲移除章节，返回删除后建议选中的章 id */
  function removeChapter(chapterId: string): string | null {
    if (!doc.value) return null
    const list = chapters.value
    const idx = list.findIndex((c) => c.id === chapterId)
    if (idx < 0) return null

    let nextId: string | null = null
    if (list.length > 1) {
      nextId = list[idx + 1]?.id ?? list[idx - 1]?.id ?? null
    }

    for (const vol of doc.value.volumes) {
      const ci = vol.chapters.findIndex((c) => c.id === chapterId)
      if (ci >= 0) {
        vol.chapters.splice(ci, 1)
        markDirty()
        return nextId
      }
    }
    return null
  }

  function markDirty(): void {
    dirty.value = true
    scheduleProjectPersist()
  }

  return {
    doc,
    loading,
    saving,
    dirty,
    error,
    chapters,
    load,
    save,
    saveIfDirty,
    getChapter,
    updateChapterTitle,
    setBeats,
    addBeat,
    removeBeat,
    updateBeatText,
    addChapter,
    addVolume,
    removeChapter,
    markDirty
  }
})
