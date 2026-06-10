import type { AppearancePrefs, ThemeId } from '@/types/api'

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: 'dark',
  editorFontSize: 14,
  editorLineNumbers: true
}

export const THEME_OPTIONS: { id: ThemeId; label: string; desc: string }[] = [
  { id: 'dark', label: '深色', desc: 'IDE 风格暗色，适合长时间写作' },
  { id: 'light', label: '浅色', desc: '明亮界面，日间环境更护眼' },
  { id: 'system', label: '跟随系统', desc: '自动匹配操作系统外观' }
]
