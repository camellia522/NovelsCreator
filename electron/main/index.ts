import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { registerConfigIpc } from './ipc/config.ipc'
import { registerAiIpc } from './ipc/ai.ipc'
import { registerAgentIpc } from './ipc/agent.ipc'
import { registerProjectIpc } from './ipc/project.ipc'
import { registerProjectFilesIpc } from './ipc/project-files.ipc'
import { registerExportIpc } from './ipc/export.ipc'
import { registerBackupIpc } from './ipc/backup.ipc'
import { registerWorldGenIpc } from './ipc/world-gen.ipc'
import {
  registerWorldMapProtocol,
  registerWorldMapScheme
} from './protocols/world-map.protocol'
import { applyAppIcon } from './app-icon'

registerWorldMapScheme()

let mainWindow: BrowserWindow | null = null

function registerIpc(): void {
  registerConfigIpc()
  registerAiIpc()
  registerAgentIpc()
  registerProjectIpc()
  registerProjectFilesIpc()
  registerExportIpc()
  registerBackupIpc()
  registerWorldGenIpc()
}

app.whenReady().then(() => {
  applyAppIcon()
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
