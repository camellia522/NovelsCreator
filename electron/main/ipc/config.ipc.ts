import { ipcMain } from 'electron'

import type { SetAppearancePayload, SetAiAssistantPayload, SetAiEnginePayload, SetAiLocalPayload, SetDifyConfigPayload, TestAssistantLlmPayload, TestDifyPayload } from '../../src/types/api'

import {
  DIFY_MASKED_API_KEY,
  clearWorkspaceLayout,
  getAiSettingsPublic,
  getDifyCredentials,
  getDifySettingsPublic,
  getPublicConfig,
  setAiAssistant,
  setAiEngine,
  setAiLocal,
  setAiOnboardingCompleted,
  setAppearance,
  setDefaultProjectsDir,
  setDifyConfig,
  setWorkspaceLayout
} from '../services/config.service'

import { healthCheck } from '../services/dify.service'
import { testAssistantLlm } from '../services/llm-health.service'
import { invalidateAssistantCache } from '../agent/novel-assistant.service'



export function registerConfigIpc(): void {

  ipcMain.handle('config:get', async () => {

    const config = await getPublicConfig()

    const dify = await getDifySettingsPublic()
    const ai = await getAiSettingsPublic()

    const hasApiKey = Object.values(dify.workflows).some((w) => w.configured)

    return { ...config, dify, ai, hasApiKey }

  })



  ipcMain.handle('config:setDify', async (_e, payload: SetDifyConfigPayload) => {

    await setDifyConfig(payload)

  })

  ipcMain.handle('config:setAiEngine', async (_e, payload: SetAiEnginePayload) => {
    await setAiEngine(payload)
  })

  ipcMain.handle('config:setAiLocal', async (_e, payload: SetAiLocalPayload) => {
    await setAiLocal(payload)
    invalidateAssistantCache()
  })

  ipcMain.handle('config:setAiOnboardingCompleted', async (_e, completed: boolean) => {
    await setAiOnboardingCompleted(completed)
  })

  ipcMain.handle('config:setAiAssistant', async (_e, payload: SetAiAssistantPayload) => {
    await setAiAssistant(payload)
    invalidateAssistantCache()
  })

  ipcMain.handle('config:testAssistantLlm', async (_e, partial?: TestAssistantLlmPayload) => {
    return testAssistantLlm(partial)
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

