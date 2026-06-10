import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import type { EffectiveTheme } from '@/utils/apply-theme'
import { monacoThemeName } from '@/utils/apply-theme'

let themesDefined = false

const DARK_COLORS = {
  'editor.background': '#1e1f22',
  'editor.foreground': '#dfe1e5',
  'editorLineNumber.foreground': '#6b6f76',
  'editorLineNumber.activeForeground': '#9da0a8',
  'editor.selectionBackground': '#3574f066',
  'editor.inactiveSelectionBackground': '#3574f033',
  'editorCursor.foreground': '#3574f0',
  'editor.lineHighlightBackground': '#2b2d30',
  'editorWidget.background': '#2b2d30',
  'editorWidget.border': '#4e5157'
}

const LIGHT_COLORS = {
  'editor.background': '#ffffff',
  'editor.foreground': '#1f2328',
  'editorLineNumber.foreground': '#8c959f',
  'editorLineNumber.activeForeground': '#656d76',
  'editor.selectionBackground': '#0969da33',
  'editor.inactiveSelectionBackground': '#0969da1a',
  'editorCursor.foreground': '#0969da',
  'editor.lineHighlightBackground': '#f6f8fa',
  'editorWidget.background': '#ffffff',
  'editorWidget.border': '#d3d7de'
}

export function defineNovelsCreatorThemes(): void {
  if (themesDefined) return
  monaco.editor.defineTheme('novelscreator-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: DARK_COLORS
  })
  monaco.editor.defineTheme('novelscreator-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: LIGHT_COLORS
  })
  themesDefined = true
}

export function applyMonacoTheme(effective: EffectiveTheme): void {
  defineNovelsCreatorThemes()
  monaco.editor.setTheme(monacoThemeName(effective))
}
