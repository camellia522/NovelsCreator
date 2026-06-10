/**
 * Dify 工作流 E2E 共用：凭据读取 + blocking 调用
 */
import axios from 'axios'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type DifyKeySlot = 'outline' | 'chapter' | 'knowledge' | 'society'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const ENV_KEY: Record<DifyKeySlot, string> = {
  outline: 'DIFY_OUTLINE_API_KEY',
  chapter: 'DIFY_CHAPTER_API_KEY',
  knowledge: 'DIFY_KNOWLEDGE_API_KEY',
  society: 'DIFY_SOCIETY_API_KEY'
}

export interface DifyCredentials {
  baseUrl: string
  apiKey: string
}

export interface DifyWorkflowRunResult {
  runId: string
  status: string
  error?: string
  outputs: Record<string, unknown>
}

function readSecretsDump(): Record<string, string> & { baseUrl?: string } {
  const electronBin = join(root, 'node_modules/electron/cli.js')
  const script = join(root, 'scripts/dify-secrets-dump.cjs')
  const proc = spawnSync(process.execPath, [electronBin, script], {
    encoding: 'utf-8',
    timeout: 45_000,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  })
  if (proc.status !== 0 || !proc.stdout.trim()) {
    throw new Error(
      proc.stderr?.trim() ||
        '无法读取 Dify Key。请设置对应环境变量，或在 NovelsCreator 设置中配置后重试。'
    )
  }
  return JSON.parse(proc.stdout.trim()) as Record<string, string> & { baseUrl?: string }
}

/** 优先环境变量，其次 Electron 用户数据中的加密 Key */
export function loadDifyCredentials(slot: DifyKeySlot): DifyCredentials {
  const envKey =
    process.env[ENV_KEY[slot]]?.trim() ||
    (slot === 'outline' ? process.env.DIFY_API_KEY?.trim() : undefined)
  const envBase = process.env.DIFY_BASE_URL?.trim()
  if (envKey) {
    return {
      baseUrl: (envBase || 'http://127.0.0.1/v1').replace(/\/$/, ''),
      apiKey: envKey
    }
  }

  const parsed = readSecretsDump()
  const apiKey = String(parsed[slot] ?? '').trim()
  if (!apiKey) {
    throw new Error(`未配置 ${slot} 工作流 API Key（环境变量 ${ENV_KEY[slot]}）`)
  }
  return {
    baseUrl: String(parsed.baseUrl ?? 'http://127.0.0.1/v1').replace(/\/$/, ''),
    apiKey
  }
}

export async function runDifyWorkflowBlocking(
  creds: DifyCredentials,
  inputs: Record<string, unknown>,
  user: string,
  timeoutMs = 900_000
): Promise<DifyWorkflowRunResult> {
  const resp = await axios.post(
    `${creds.baseUrl}/workflows/run`,
    {
      inputs,
      response_mode: 'blocking',
      user
    },
    {
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: timeoutMs
    }
  )

  const data = resp.data as {
    data?: {
      status?: string
      error?: string
      outputs?: Record<string, unknown>
      id?: string
    }
  }

  if (data.data?.status === 'failed') {
    throw new Error(data.data.error?.trim() || 'Dify workflow failed')
  }

  return {
    runId: data.data?.id ?? '',
    status: data.data?.status ?? '',
    error: data.data?.error,
    outputs: data.data?.outputs ?? {}
  }
}
