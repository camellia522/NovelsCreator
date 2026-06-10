import type { ThemeId } from '@/types/api'

export type EffectiveTheme = 'dark' | 'light'

export function resolveEffectiveTheme(theme: ThemeId): EffectiveTheme {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: ThemeId): EffectiveTheme {
  const effective = resolveEffectiveTheme(theme)
  document.documentElement.dataset.theme = effective
  document.documentElement.style.colorScheme = effective
  return effective
}

export function monacoThemeName(effective: EffectiveTheme): string {
  return effective === 'light' ? 'novelscreator-light' : 'novelscreator-dark'
}

let systemListener: ((e: MediaQueryListEvent) => void) | null = null

/** 当 theme=system 时监听系统配色变化 */
export function watchSystemTheme(theme: ThemeId, onChange: (effective: EffectiveTheme) => void): void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  if (systemListener) {
    mq.removeEventListener('change', systemListener)
    systemListener = null
  }
  if (theme !== 'system') return

  systemListener = () => {
    onChange(applyTheme('system'))
  }
  mq.addEventListener('change', systemListener)
}
