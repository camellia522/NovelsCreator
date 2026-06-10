import { ipcMain } from 'electron'
import {
  closeProject,
  createProject,
  deleteProject,
  getCurrentProject,
  openProject,
  pickDirectory,
  pickOpenProject
} from '../services/project.service'
import { getPublicConfig } from '../services/config.service'
import { maybeAutoBackupOnProjectOpen } from '../services/backup.service'

export function registerProjectIpc(): void {
  ipcMain.handle('project:create', async (_e, name: string, parentDir?: string) =>
    createProject(name, parentDir)
  )

  ipcMain.handle('project:open', async (_e, rootPath: string) => {
    const meta = await openProject(rootPath)
    const autoBackup = await maybeAutoBackupOnProjectOpen(rootPath)
    if (autoBackup?.ok) {
      return { ...meta, autoBackupMessage: autoBackup.message }
    }
    return meta
  })
  ipcMain.handle('project:close', async () => {
    await closeProject()
  })

  ipcMain.handle('project:delete', async (_e, rootPath: string) => deleteProject(rootPath))

  ipcMain.handle('project:getCurrent', async () => getCurrentProject())

  ipcMain.handle('project:pickDirectory', async () => pickDirectory())

  ipcMain.handle('project:pickOpen', async () => pickOpenProject())

  ipcMain.handle('project:getRecent', async () => {
    const config = await getPublicConfig()
    return config.recentProjects
  })
}
