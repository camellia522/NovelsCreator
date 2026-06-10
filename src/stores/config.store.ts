import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { DEFAULT_APPEARANCE } from '@/constants/appearance'
import type { AppearancePrefs, ThemeId } from '@/types/api'
import { applyMonacoTheme } from '@/monaco/theme'
import {
  applyTheme,
  type EffectiveTheme,
  watchSystemTheme
} from '@/utils/apply-theme'

export const useConfigStore = defineStore('config', () => {
  const loaded = ref(false)
  const theme = ref<ThemeId>(DEFAULT_APPEARANCE.theme)
  const editorFontSize = ref(DEFAULT_APPEARANCE.editorFontSize)
  const editorLineNumbers = ref(DEFAULT_APPEARANCE.editorLineNumbers)
  const defaultProjectsDir = ref<string | undefined>(undefined)
  const effectiveTheme = ref<EffectiveTheme>('dark')

  const appearance = computed<AppearancePrefs>(() => ({
    theme: theme.value,
    editorFontSize: editorFontSize.value,
    editorLineNumbers: editorLineNumbers.value
  }))

  function syncTheme(): void {
    effectiveTheme.value = applyTheme(theme.value)
    applyMonacoTheme(effectiveTheme.value)
    watchSystemTheme(theme.value, (next) => {
      effectiveTheme.value = next
      applyMonacoTheme(next)
    })
  }

  async function load(): Promise<void> {
    if (!window.novelsCreator?.config?.get) {
      syncTheme()
      loaded.value = true
      return
    }
    try {
      const config = await window.novelsCreator.config.get()
      const prefs = { ...DEFAULT_APPEARANCE, ...config.appearance }
      theme.value = prefs.theme
      editorFontSize.value = prefs.editorFontSize
      editorLineNumbers.value = prefs.editorLineNumbers
      defaultProjectsDir.value = config.defaultProjectsDir
    } catch {
      /* use defaults */
    }
    syncTheme()
    loaded.value = true
  }

  async function persistAppearance(patch: Partial<AppearancePrefs>): Promise<void> {
    if (patch.theme != null) theme.value = patch.theme
    if (patch.editorFontSize != null) {
      editorFontSize.value = Math.max(12, Math.min(22, patch.editorFontSize))
    }
    if (patch.editorLineNumbers != null) editorLineNumbers.value = patch.editorLineNumbers
    syncTheme()
    if (window.novelsCreator?.config?.setAppearance) {
      await window.novelsCreator.config.setAppearance(patch)
    }
  }

  async function setTheme(next: ThemeId): Promise<void> {
    await persistAppearance({ theme: next })
  }

  async function setEditorFontSize(size: number): Promise<void> {
    await persistAppearance({ editorFontSize: size })
  }

  async function setEditorLineNumbers(on: boolean): Promise<void> {
    await persistAppearance({ editorLineNumbers: on })
  }

  async function pickDefaultProjectsDir(): Promise<void> {
    if (!window.novelsCreator?.project?.pickDirectory) return
    const path = await window.novelsCreator.project.pickDirectory()
    if (!path) return
    defaultProjectsDir.value = path
    await window.novelsCreator.config.setDefaultProjectsDir(path)
  }

  async function clearDefaultProjectsDir(): Promise<void> {
    defaultProjectsDir.value = undefined
    await window.novelsCreator.config.setDefaultProjectsDir(undefined)
  }

  return {
    loaded,
    theme,
    editorFontSize,
    editorLineNumbers,
    defaultProjectsDir,
    effectiveTheme,
    appearance,
    load,
    setTheme,
    setEditorFontSize,
    setEditorLineNumbers,
    pickDefaultProjectsDir,
    clearDefaultProjectsDir
  }
})
