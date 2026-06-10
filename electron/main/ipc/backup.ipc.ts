import { ipcMain } from 'electron'
import {
  listProjectBackups,
  pickAndRestoreBackup,
  restoreProjectFromZip,
  runProjectBackup
} from '../services/backup.service'
import { getCurrentProject } from '../services/project.service'

export function registerBackupIpc(): void {
  ipcMain.handle('backup:run', async () => runProjectBackup({ auto: false }))

  ipcMain.handle('backup:list', async () => listProjectBackups())

  ipcMain.handle('backup:pickAndRestore', async () => {
    if (!getCurrentProject()) {
      return { ok: false, message: '未打开项目' }
    }
    return pickAndRestoreBackup()
  })

  ipcMain.handle('backup:restore', async (_e, zipPath: string) => {
    if (!getCurrentProject()) {
      return { ok: false, message: '未打开项目' }
    }
    return restoreProjectFromZip(zipPath)
  })
}
