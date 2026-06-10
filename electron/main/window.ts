import { BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { APP_TITLE } from '@/constants/app-meta'

function resolvePreloadPath(): string {
  const base = join(__dirname, '../preload/index')
  if (existsSync(`${base}.mjs`)) return `${base}.mjs`
  if (existsSync(`${base}.js`)) return `${base}.js`
  return `${base}.mjs`
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: APP_TITLE,
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.on('close', (event) => {
    event.preventDefault()
    void (async () => {
      try {
        await win.webContents.executeJavaScript(
          `window.__ncFlushProject
            ? window.__ncFlushProject().then(function () { return true; })
            : Promise.resolve(true)`,
          true
        )
      } catch {
        // 渲染进程不可用时仍允许关闭
      }
      win.destroy()
    })()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
