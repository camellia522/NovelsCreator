import { app, safeStorage } from 'electron'

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'

import { join } from 'node:path'

import {
  DIFY_WORKFLOW_SLOTS,
  emptyDifyWorkflowKeys,
  type DifyWorkflowKeys,
  type DifyWorkflowSlot
} from '@/constants/dify-workflows'

import type {
  AppConfig,
  AiEngineId,
  AiSettingsPublic,
  DifyAppConfig,
  DifySettingsPublic,
  SetAppearancePayload,
  SetAiAssistantPayload,
  SetAiEnginePayload,
  SetAiLocalPayload,
  SetDifyConfigPayload,
  WorkspaceLayoutPrefs
} from '../../src/types/api'
import { DEFAULT_APPEARANCE } from '@/constants/appearance'



const DEFAULT_BASE_URL = 'http://127.0.0.1/v1'
const DEFAULT_ASSISTANT_LLM_BASE = 'https://api.deepseek.com'

const DEFAULT_CONFIG: AppConfig = {
  dify: { baseUrl: DEFAULT_BASE_URL },
  ai: {
    engine: 'local',
    assistant: { model: 'deepseek-chat', baseUrl: DEFAULT_ASSISTANT_LLM_BASE }
  },
  recentProjects: [],
  appearance: { ...DEFAULT_APPEARANCE }
}



const MASKED_KEY = '********'



function configPath(): string {

  return join(app.getPath('userData'), 'config.json')

}



function difySecretsPath(): string {

  return join(app.getPath('userData'), 'dify-secrets.bin')

}

function llmSecretsPath(): string {
  return join(app.getPath('userData'), 'llm-secrets.bin')
}



/** 旧版单 Key 存储，迁移后仍可读 */

function legacySecretsPath(): string {

  return join(app.getPath('userData'), 'secrets.bin')

}



async function ensureUserData(): Promise<void> {

  await mkdir(app.getPath('userData'), { recursive: true })

}



function decryptBuffer(buf: Buffer): string {
  if (buf.length === 0) return ''
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(buf)
    } catch {
      /* 可能是旧版明文 secrets，继续按 utf-8 读取 */
    }
  }
  return buf.toString('utf-8')
}



function encryptString(text: string): Buffer {

  if (safeStorage.isEncryptionAvailable()) {

    return safeStorage.encryptString(text)

  }

  return Buffer.from(text, 'utf-8')

}



async function readLegacySingleKey(): Promise<string> {

  try {

    const encrypted = await readFile(legacySecretsPath())

    return decryptBuffer(encrypted).trim()

  } catch {

    return ''

  }

}



async function loadWorkflowSecrets(): Promise<DifyWorkflowKeys> {
  const keys = emptyDifyWorkflowKeys()
  try {
    const encrypted = await readFile(difySecretsPath())
    const parsed = JSON.parse(decryptBuffer(encrypted)) as Partial<DifyWorkflowKeys>
    for (const slot of DIFY_WORKFLOW_SLOTS) {
      keys[slot] = String(parsed[slot] ?? '').trim()
    }
    return keys
  } catch {
    const legacy = await readLegacySingleKey()
    if (legacy) {
      keys.chapter = legacy
      await saveWorkflowSecrets(keys)
    }
    return keys
  }
}



async function saveWorkflowSecrets(keys: DifyWorkflowKeys): Promise<void> {

  await ensureUserData()

  const payload = JSON.stringify(keys)

  await writeFile(difySecretsPath(), encryptString(payload))

}



export async function loadConfig(): Promise<AppConfig> {

  await ensureUserData()

  try {

    const raw = await readFile(configPath(), 'utf-8')

    const parsed = JSON.parse(raw) as AppConfig & { dify?: { baseUrl?: string; apiKey?: string } }

    const baseUrl = parsed.dify?.baseUrl ?? DEFAULT_BASE_URL

    return {

      ...DEFAULT_CONFIG,

      ...parsed,

      dify: { baseUrl: baseUrl.replace(/\/$/, '') },

      ai: {
        engine: parsed.ai?.engine ?? DEFAULT_CONFIG.ai?.engine ?? 'local',
        local: parsed.ai?.local,
        assistant: {
          ...DEFAULT_CONFIG.ai?.assistant,
          ...parsed.ai?.assistant
        }
      },

      appearance: { ...DEFAULT_APPEARANCE, ...parsed.appearance }

    }

  } catch {

    return { ...DEFAULT_CONFIG }

  }

}



async function saveConfig(config: AppConfig): Promise<void> {

  await ensureUserData()

  const toSave: AppConfig = {

    ...config,

    dify: { baseUrl: config.dify.baseUrl.replace(/\/$/, '') }

  }

  await writeFile(configPath(), JSON.stringify(toSave, null, 2), 'utf-8')

}



async function loadLlmSecret(): Promise<string> {
  try {
    const encrypted = await readFile(llmSecretsPath())
    return decryptBuffer(encrypted).trim()
  } catch {
    return ''
  }
}

async function saveLlmSecret(apiKey: string): Promise<void> {
  await ensureUserData()
  await writeFile(llmSecretsPath(), encryptString(apiKey.trim()))
}

async function clearLlmSecret(): Promise<void> {
  await rm(llmSecretsPath(), { force: true })
}

function isMaskedApiKey(value: string): boolean {
  const t = value.trim()
  return t === MASKED_KEY || /^\*+$/.test(t)
}

/** 空字符串表示删除；MASKED 表示未改动 */
async function applyLlmSecretUpdate(apiKey: string | undefined): Promise<void> {
  if (apiKey === undefined) return
  const incoming = apiKey.trim()
  if (isMaskedApiKey(incoming)) return
  const config = await loadConfig()
  if (!incoming) {
    await clearLlmSecret()
    config.ai = { ...config.ai, llmKeyCleared: true }
    await saveConfig(config)
    return
  }
  await saveLlmSecret(incoming)
  config.ai = { ...config.ai, llmKeyCleared: false }
  await saveConfig(config)
}

export async function getAssistantLlmCredentials(): Promise<AssistantLlmCredentials> {
  const config = await loadConfig()
  const llmKey = await loadLlmSecret()

  const baseUrl = (
    config.ai?.assistant?.baseUrl?.trim() ||
    config.ai?.local?.baseUrl?.trim() ||
    DEFAULT_ASSISTANT_LLM_BASE
  ).replace(/\/$/, '')

  let apiKey = llmKey
  if (!apiKey && !config.ai?.llmKeyCleared) {
    apiKey = process.env.LOCAL_LLM_API_KEY?.trim() ?? ''
  }

  const model =
    config.ai?.assistant?.model?.trim() ||
    config.ai?.local?.model?.trim() ||
    'deepseek-chat'

  return { baseUrl, apiKey, model }
}

export interface WorkflowLlmCredentials {
  baseUrl: string
  apiKey: string
  model: string
}

export interface AssistantLlmCredentials extends WorkflowLlmCredentials {}

function workflowLlmCredentialsFromEnv(
  role: 'creative' | 'reasoning'
): WorkflowLlmCredentials | null {
  const apiKey = process.env.LOCAL_LLM_API_KEY?.trim()
  if (!apiKey) return null
  const baseUrl = (process.env.LOCAL_LLM_BASE_URL ?? DEFAULT_ASSISTANT_LLM_BASE).replace(/\/$/, '')
  const creative = process.env.LOCAL_LLM_MODEL?.trim() || 'deepseek-chat'
  const reasoning =
    process.env.LOCAL_LLM_REASONING_MODEL?.trim() ||
    process.env.LOCAL_LLM_MODEL?.trim() ||
    creative
  return {
    baseUrl,
    apiKey,
    model: role === 'reasoning' ? reasoning : creative
  }
}

/** 内置 LangGraph 工作流 LLM（creative=O1 等，reasoning=O2 等） */
export async function getWorkflowLlmCredentials(
  role: 'creative' | 'reasoning' = 'creative'
): Promise<WorkflowLlmCredentials> {
  const config = await loadConfig()
  if (!config.ai?.llmKeyCleared) {
    const fromEnv = workflowLlmCredentialsFromEnv(role)
    if (fromEnv) return fromEnv
  }

  const llmKey = await loadLlmSecret()
  const local = config.ai?.local
  const assistant = config.ai?.assistant

  const baseUrl = (
    local?.baseUrl?.trim() ||
    assistant?.baseUrl?.trim() ||
    DEFAULT_ASSISTANT_LLM_BASE
  ).replace(/\/$/, '')

  const apiKey = llmKey
  const creativeModel = local?.model?.trim() || assistant?.model?.trim() || 'deepseek-chat'
  const reasoningModel =
    local?.reasoningModel?.trim() || local?.model?.trim() || assistant?.model?.trim() || 'deepseek-chat'

  return {
    baseUrl,
    apiKey,
    model: role === 'reasoning' ? reasoningModel : creativeModel
  }
}

export async function getAiSettingsPublic(): Promise<AiSettingsPublic> {
  const config = await loadConfig()
  const llmKey = await loadLlmSecret()
  const hasStoredKey =
    Boolean(llmKey) || (!config.ai?.llmKeyCleared && Boolean(process.env.LOCAL_LLM_API_KEY?.trim()))
  const engine: AiEngineId = config.ai?.engine ?? 'local'
  const local = config.ai?.local

  return {
    engine,
    onboardingCompleted: config.ai?.onboardingCompleted === true,
    local: local
      ? {
          baseUrl: local.baseUrl || config.dify.baseUrl,
          model: local.model || 'deepseek-chat',
          reasoningModel: local.reasoningModel,
          apiKey: hasStoredKey ? MASKED_KEY : '',
          configured: hasStoredKey
        }
      : undefined,
    assistant: {
      model: config.ai?.assistant?.model ?? 'deepseek-chat',
      baseUrl: config.ai?.assistant?.baseUrl ?? DEFAULT_ASSISTANT_LLM_BASE,
      apiKey: hasStoredKey ? MASKED_KEY : '',
      configured: hasStoredKey
    }
  }
}

export async function setAiEngine(payload: SetAiEnginePayload): Promise<void> {
  const config = await loadConfig()
  config.ai = { ...config.ai, engine: payload.engine }
  await saveConfig(config)
}

export async function setAiOnboardingCompleted(completed: boolean): Promise<void> {
  const config = await loadConfig()
  config.ai = { ...config.ai, onboardingCompleted: completed }
  await saveConfig(config)
}

export async function setAiLocal(payload: SetAiLocalPayload): Promise<void> {
  const config = await loadConfig()
  config.ai = {
    ...config.ai,
    engine: config.ai?.engine ?? 'local',
    local: {
      baseUrl: payload.baseUrl.replace(/\/$/, ''),
      model: payload.model.trim() || 'deepseek-chat',
      reasoningModel: payload.reasoningModel?.trim() || undefined
    }
  }
  await saveConfig(config)

  await applyLlmSecretUpdate(payload.apiKey)
}

export async function setAiAssistant(payload: SetAiAssistantPayload): Promise<void> {
  const config = await loadConfig()
  const prev = config.ai?.assistant ?? {}
  config.ai = {
    ...config.ai,
    engine: config.ai?.engine ?? 'dify',
    assistant: {
      model: payload.model?.trim() || prev.model || 'deepseek-chat',
      baseUrl: (payload.baseUrl ?? prev.baseUrl ?? DEFAULT_ASSISTANT_LLM_BASE).replace(/\/$/, '')
    }
  }
  await saveConfig(config)

  await applyLlmSecretUpdate(payload.apiKey)
}

export async function getDifyCredentials(slot: DifyWorkflowSlot): Promise<DifyAppConfig> {

  const config = await loadConfig()

  const secrets = await loadWorkflowSecrets()

  return {

    baseUrl: config.dify.baseUrl,

    apiKey: secrets[slot] ?? ''

  }

}



export async function getDifySettingsPublic(): Promise<DifySettingsPublic> {

  const config = await loadConfig()

  const secrets = await loadWorkflowSecrets()

  const workflows = {} as DifySettingsPublic['workflows']

  for (const slot of DIFY_WORKFLOW_SLOTS) {

    const configured = Boolean(secrets[slot])

    workflows[slot] = {

      configured,

      apiKey: configured ? MASKED_KEY : ''

    }

  }

  return { baseUrl: config.dify.baseUrl, workflows }

}



export async function setDifyConfig(payload: SetDifyConfigPayload): Promise<void> {
  const config = await loadConfig()
  config.dify.baseUrl = payload.baseUrl.replace(/\/$/, '')
  await saveConfig(config)

  const current = await loadWorkflowSecrets()
  const next: DifyWorkflowKeys = { ...current }
  let secretsChanged = false
  const workflows = payload.workflows ?? {}

  for (const slot of DIFY_WORKFLOW_SLOTS) {
    if (!(slot in workflows)) continue
    const incoming = workflows[slot]
    if (incoming == null) continue
    if (isMaskedApiKey(String(incoming))) continue
    const trimmed = String(incoming).trim()
    if (next[slot] !== trimmed) {
      next[slot] = trimmed
      secretsChanged = true
    }
  }

  if (secretsChanged) {
    await saveWorkflowSecrets(next)
  }
}



export async function addRecentProject(rootPath: string): Promise<void> {

  const config = await loadConfig()

  config.recentProjects = [rootPath, ...config.recentProjects.filter((p) => p !== rootPath)].slice(

    0,

    10

  )

  await saveConfig(config)

}

export async function removeRecentProject(rootPath: string): Promise<void> {
  const config = await loadConfig()
  const next = config.recentProjects.filter((p) => p !== rootPath)
  if (next.length === config.recentProjects.length) return
  config.recentProjects = next
  await saveConfig(config)
}



export async function setWorkspaceLayout(layout: WorkspaceLayoutPrefs): Promise<void> {
  const config = await loadConfig()
  config.workspaceLayout = { ...(config.workspaceLayout ?? {}), ...layout }
  await saveConfig(config)
}

export async function setAppearance(payload: SetAppearancePayload): Promise<void> {
  const config = await loadConfig()
  const current = { ...DEFAULT_APPEARANCE, ...config.appearance }
  config.appearance = {
    theme: payload.theme ?? current.theme,
    editorFontSize: payload.editorFontSize ?? current.editorFontSize,
    editorLineNumbers: payload.editorLineNumbers ?? current.editorLineNumbers
  }
  if (config.appearance.editorFontSize) {
    config.appearance.editorFontSize = Math.max(12, Math.min(22, config.appearance.editorFontSize))
  }
  await saveConfig(config)
}

export async function setDefaultProjectsDir(dir: string | undefined): Promise<void> {
  const config = await loadConfig()
  config.defaultProjectsDir = dir?.trim() || undefined
  await saveConfig(config)
}

export async function clearWorkspaceLayout(): Promise<void> {
  const config = await loadConfig()
  delete config.workspaceLayout
  await saveConfig(config)
}



export { loadConfig as getPublicConfig, saveConfig, MASKED_KEY as DIFY_MASKED_API_KEY }

