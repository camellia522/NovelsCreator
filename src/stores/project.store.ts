import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProjectMeta } from '@/types/api'

export const useProjectStore = defineStore('project', () => {
  const current = ref<ProjectMeta | null>(null)
  const recent = ref<string[]>([])
  const loading = ref(false)
  const error = ref('')

  async function refresh(): Promise<void> {
    current.value = await window.novelsCreator.project.getCurrent()
  }

  async function loadRecent(): Promise<void> {
    recent.value = await window.novelsCreator.project.getRecent()
  }

  async function create(name: string, parentDir?: string): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      current.value = await window.novelsCreator.project.create(name, parentDir)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function open(rootPath: string): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      current.value = await window.novelsCreator.project.open(rootPath)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function close(): Promise<void> {
    await window.novelsCreator.project.close()
    current.value = null
  }

  async function remove(
    rootPath: string
  ): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
    error.value = ''
    const res = await window.novelsCreator.project.delete(rootPath)
    if (res.ok) {
      if (current.value?.rootPath === rootPath) {
        current.value = null
      }
      await loadRecent()
    } else if (!res.cancelled) {
      error.value = res.error ?? '删除失败'
    }
    return res
  }

  return { current, recent, loading, error, refresh, loadRecent, create, open, close, remove }
})
