import { BrowserWindow } from 'electron'

/** 通知 Renderer 重新加载大纲/设定/记忆/已打开章节标签 */
export function notifyAssistantProjectMutated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('agent:projectMutated', {})
    }
  }
}
