import { ipcMain } from 'electron'
import { exportChapter, exportChapterToProjectExports, exportFullBook } from '../services/export.service'

export function registerExportIpc(): void {
  ipcMain.handle(
    'export:chapter',
    async (
      _e,
      chapterId: string,
      exportType: 'novel' | 'video' | 'both',
      format: 'txt' | 'md'
    ) => exportChapter(chapterId, exportType, format)
  )

  ipcMain.handle('export:toProjectFolder', async (_e, chapterId: string) =>
    exportChapterToProjectExports(chapterId)
  )

  ipcMain.handle(
    'export:fullBook',
    async (_e, exportType: 'novel' | 'video', format: 'txt' | 'md') =>
      exportFullBook(exportType, format)
  )
}
