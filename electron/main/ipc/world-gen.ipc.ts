import { ipcMain } from 'electron'
import type { WorldGenConfig, WorldSocietyGenerateRequest } from '../../src/types/world-gen'
import { getCurrentProject } from '../services/project.service'
import { runTerritorySocietyLlm } from '../services/world-society.service'
import {
  checkWorldEngineInstall,
  readCachedMapAsDataUrl,
  runNativeWorldEngine
} from '../services/worldengine-cli.service'

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function registerWorldGenIpc(): void {
  ipcMain.handle('world:checkEngine', async () => {
    const result = await checkWorldEngineInstall()
    return toPlain(result)
  })

  ipcMain.handle('world:generateNative', async (_e, config: WorldGenConfig) => {
    const result = await runNativeWorldEngine(toPlain(config))
    return toPlain(result)
  })

  ipcMain.handle('world:readMapFile', async (_e, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') {
      return { ok: false as const, error: '无效地图路径' }
    }
    try {
      const dataUrl = await readCachedMapAsDataUrl(filePath)
      return { ok: true as const, dataUrl }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle('world:generateSociety', async (_e, req: WorldSocietyGenerateRequest) => {
    const project = getCurrentProject()
    if (!project) {
      return { ok: false, error: '请先打开或创建项目' }
    }
    const plain = toPlain(req)
    const result = await runTerritorySocietyLlm(
      {
        config: plain.config,
        nations: plain.nations,
        territoryBriefJson: plain.territoryBriefJson
      },
      project.id
    )
    return toPlain(result)
  })
}
