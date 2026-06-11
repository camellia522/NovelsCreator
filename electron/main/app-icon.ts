import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** 开发 / 打包后解析应用窗口与 Dock 图标 */
export function resolveAppIconPath(): string | undefined {
  const candidates: string[] = []

  if (process.platform === 'win32') {
    candidates.push(join(process.resourcesPath, 'icon.ico'))
    candidates.push(join(app.getAppPath(), 'resources', 'icon.ico'))
  }

  candidates.push(
    join(process.resourcesPath, 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.png'),
    join(__dirname, '../../resources/icon.png'),
    join(__dirname, '../../../resources/icon.png')
  )

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

export function applyAppIcon(): void {
  const iconPath = resolveAppIconPath()
  if (!iconPath) return
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath)
  }
}
