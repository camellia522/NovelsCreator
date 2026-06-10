import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { registerConfigIpc } from './ipc/config.ipc'
import { registerDifyIpc } from './ipc/dify.ipc'
import { registerProjectIpc } from './ipc/project.ipc'
import { registerProjectFilesIpc } from './ipc/project-files.ipc'
import { registerExportIpc } from './ipc/export.ipc'
import { registerBackupIpc } from './ipc/backup.ipc'
import { registerWorldGenIpc } from './ipc/world-gen.ipc'
import {
  registerWorldMapProtocol,
  registerWorldMapScheme
} from './protocols/world-map.protocol'

registerWorldMapScheme()

let mainWindow: BrowserWindow | null = null

function registerIpc(): void {
  registerConfigIpc()
  registerDifyIpc()
  registerProjectIpc()
  registerProjectFilesIpc()
  registerExportIpc()
  registerBackupIpc()
  registerWorldGenIpc()
}

app.whenReady().then(() => {
  registerWorldMapProtocol()
  registerIpc()
  mainWindow = createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
