import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useChapterStore = defineStore('chapter', () => {
  const novelText = ref('')
  const videoText = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const dirty = ref(false)

  async function load(chapterId: string): Promise<void> {
    if (!window.novelsCreator) return
    loading.value = true
    try {
      novelText.value = await window.novelsCreator.project.getChapterText(chapterId, 'novel')
      videoText.value = await window.novelsCreator.project.getChapterText(chapterId, 'video')
      dirty.value = false
    } finally {
      loading.value = false
    }
  }

  async function save(chapterId: string, kind: 'novel' | 'video', content: string): Promise<void> {
    if (!window.novelsCreator) return
    saving.value = true
    try {
      await window.novelsCreator.project.saveChapterText(chapterId, kind, content)
      if (kind === 'novel') novelText.value = content
      else videoText.value = content
      dirty.value = false
    } finally {
      saving.value = false
    }
  }

  return { novelText, videoText, loading, saving, dirty, load, save }
})
