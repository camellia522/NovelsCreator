/**
 * 主进程用：命名风格 brief（勿依赖 src/utils，避免 electron-vite 无法解析 @/ 链）
 */
import type { PlaceNamingStyle, WorldGenConfig } from '../../src/types/world-gen'

const STYLE_LABELS: Record<PlaceNamingStyle, string> = {
  chinese: '中式',
  western: '西式',
  japanese: '日式',
  fantasy: '奇幻',
  mixed: '混合'
}

const MIXED_ROTATION: Exclude<PlaceNamingStyle, 'mixed'>[] = [
  'chinese',
  'western',
  'japanese',
  'fantasy'
]

export function normalizePlaceNamingStyle(
  style?: PlaceNamingStyle | string | null
): PlaceNamingStyle {
  if (
    style === 'chinese' ||
    style === 'western' ||
    style === 'japanese' ||
    style === 'fantasy' ||
    style === 'mixed'
  ) {
    return style
  }
  return 'chinese'
}

export function namingStyleBriefLine(config: WorldGenConfig): string {
  const style = normalizePlaceNamingStyle(config.placeNamingStyle)
  const label = STYLE_LABELS[style]
  if (style === 'mixed') {
    return `命名风格：混合（各国在 ${MIXED_ROTATION.map((s) => STYLE_LABELS[s]).join(' / ')} 中择一，同国城市语种一致；聚落专名宜 2–5 字）`
  }
  return `命名风格：${label}（placeNamingStyle=${style}；聚落专名宜 2–5 字，国名≤8 字）`
}
