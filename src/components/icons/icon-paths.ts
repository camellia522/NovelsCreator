export type IconName =
  | 'folder'
  | 'folder-open'
  | 'file-text'
  | 'book'
  | 'layers'
  | 'settings'
  | 'palette'
  | 'workflow'
  | 'monitor'
  | 'close'
  | 'plus'
  | 'check'
  | 'circle'
  | 'circle-dot'
  | 'chevron-left'
  | 'arrow-right'
  | 'trash'
  | 'file-plus'
  | 'dot-filled'

export type IconElement =
  | { type: 'path'; d: string; fill?: string }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: string }

/** 简约线条图标（24×24 viewBox，stroke 由 NcIcon 统一控制） */
export const ICONS: Record<IconName, IconElement[]> = {
  folder: [
    {
      type: 'path',
      d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'
    }
  ],
  'folder-open': [
    {
      type: 'path',
      d: 'm6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2'
    }
  ],
  'file-text': [
    { type: 'path', d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' },
    { type: 'path', d: 'M14 2v4a2 2 0 0 0 2 2h4' },
    { type: 'path', d: 'M10 9H8' },
    { type: 'path', d: 'M16 13H8' },
    { type: 'path', d: 'M16 17H8' },
    { type: 'path', d: 'M10 5H8' }
  ],
  book: [
    { type: 'path', d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' },
    { type: 'path', d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z' }
  ],
  layers: [
    { type: 'path', d: 'm12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z' },
    { type: 'path', d: 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65' },
    { type: 'path', d: 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65' }
  ],
  settings: [
    { type: 'path', d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z' },
    { type: 'circle', cx: 12, cy: 12, r: 3 }
  ],
  palette: [
    { type: 'path', d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z' },
    { type: 'circle', cx: 6.5, cy: 11.5, r: 0.5, fill: 'currentColor' },
    { type: 'circle', cx: 9.5, cy: 7.5, r: 0.5, fill: 'currentColor' },
    { type: 'circle', cx: 14.5, cy: 7.5, r: 0.5, fill: 'currentColor' },
    { type: 'circle', cx: 17.5, cy: 11.5, r: 0.5, fill: 'currentColor' }
  ],
  workflow: [
    { type: 'path', d: 'M12 8V4H8' },
    { type: 'path', d: 'M12 8h4' },
    { type: 'path', d: 'M12 8v4' },
    { type: 'path', d: 'M4 12h4' },
    { type: 'path', d: 'M16 12h4' },
    { type: 'path', d: 'M12 16v4' },
    { type: 'path', d: 'M8 20h8' },
    { type: 'circle', cx: 12, cy: 12, r: 2 }
  ],
  monitor: [
    { type: 'path', d: 'M8 21h8' },
    { type: 'path', d: 'M12 17v4' },
    { type: 'path', d: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' }
  ],
  close: [
    { type: 'path', d: 'M18 6 6 18' },
    { type: 'path', d: 'm6 6 12 12' }
  ],
  plus: [
    { type: 'path', d: 'M5 12h14' },
    { type: 'path', d: 'M12 5v14' }
  ],
  check: [
    { type: 'path', d: 'M20 6 9 17l-5-5' }
  ],
  circle: [{ type: 'circle', cx: 12, cy: 12, r: 9 }],
  'circle-dot': [{ type: 'circle', cx: 12, cy: 12, r: 4, fill: 'currentColor' }],
  'dot-filled': [{ type: 'circle', cx: 12, cy: 12, r: 3, fill: 'currentColor' }],
  'chevron-left': [{ type: 'path', d: 'm15 18-6-6 6-6' }],
  'arrow-right': [
    { type: 'path', d: 'M5 12h14' },
    { type: 'path', d: 'm12 5 7 7-7 7' }
  ],
  trash: [
    { type: 'path', d: 'M3 6h18' },
    { type: 'path', d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' },
    { type: 'path', d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }
  ],
  'file-plus': [
    { type: 'path', d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' },
    { type: 'path', d: 'M14 2v4a2 2 0 0 0 2 2h4' },
    { type: 'path', d: 'M9 15h6' },
    { type: 'path', d: 'M12 12v6' }
  ]
}

/** Activity / 设置侧栏图标名映射 */
export const ACTIVITY_ICON: Record<string, IconName> = {
  explorer: 'folder',
  outline: 'file-text',
  knowledge: 'book',
  memory: 'layers'
}

export const SETTINGS_TAB_ICON: Record<string, IconName> = {
  appearance: 'palette',
  dify: 'workflow',
  general: 'folder-open',
  workspace: 'monitor'
}
