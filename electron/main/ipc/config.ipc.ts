import { ipcMain } from 'electron'

import type { SetAppearancePayload, SetDifyConfigPayload, TestDifyPayload } from '../../src/types/api'

import {
  DIFY_MASKED_API_KEY,
  clearWorkspaceLayout,
  getDifyCredentials,
  getDifySettingsPublic,
  getPublicConfig,
  setAppearance,
  setDefaultProjectsDir,
  setDifyConfig,
  setWorkspaceLayout
} from '../services/config.service'

import { healthCheck } from '../services/dify.service'



export function registerConfigIpc(): void {

  ipcMain.handle('config:get', async () => {

    const config = await getPublicConfig()

    const dify = await getDifySettingsPublic()

    const hasApiKey = Object.values(dify.workflows).some((w) => w.configured)

    return { ...config, dify, hasApiKey }

  })



  ipcMain.handle('config:setDify', async (_e, payload: SetDifyConfigPayload) => {

    await setDifyConfig(payload)

  })



  ipcMain.handle('config:testDify', async (_e, partial?: TestDifyPayload) => {

    const slot = partial?.slot ?? 'chapter'

    const current = await getDifyCredentials(slot)

    let apiKey = partial?.apiKey?.trim() ?? ''

    if (!apiKey || apiKey === DIFY_MASKED_API_KEY) {

      apiKey = current.apiKey

    }

    return healthCheck({

      baseUrl: partial?.baseUrl?.trim() || current.baseUrl,

      apiKey,

      slot

    })

  })

  ipcMain.handle('config:setLayout', async (_e, layout) => {
    await setWorkspaceLayout(layout)
  })

  ipcMain.handle('config:setAppearance', async (_e, payload: SetAppearancePayload) => {
    await setAppearance(payload)
  })

  ipcMain.handle('config:setDefaultProjectsDir', async (_e, dir: string | undefined) => {
    await setDefaultProjectsDir(dir)
  })

  ipcMain.handle('config:clearWorkspaceLayout', async () => {
    await clearWorkspaceLayout()
  })
}

