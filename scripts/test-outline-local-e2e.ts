/**
 * 本地大纲 LangGraph E2E（需真实 LLM API Key）
 * 运行：npm run test:outline-local-e2e
 * 环境变量：LOCAL_LLM_API_KEY / LOCAL_LLM_BASE_URL / LOCAL_LLM_MODEL
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { OutlineGenerateInputs } from '../src/types/api'
import { invokeOutlineGraph } from '../electron/main/workflows/local/graphs/outline.graph'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = join(root, 'dify/outline/fixtures/outline-run.epic-fantasy.json')

function loadCredentials(): { baseUrl: string; apiKey: string; model: string } {
  const envKey = process.env.LOCAL_LLM_API_KEY?.trim()
  if (envKey) {
    return {
      baseUrl: (process.env.LOCAL_LLM_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, ''),
      apiKey: envKey,
      model: process.env.LOCAL_LLM_MODEL?.trim() || 'deepseek-chat'
    }
  }
  const electronBin = join(root, 'node_modules/electron/cli.js')
  const script = join(root, 'scripts/llm-secrets-dump.cjs')
  const proc = spawnSync(process.execPath, [electronBin, script], {
    encoding: 'utf-8',
    timeout: 45_000,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  })
  if (proc.status !== 0 || !proc.stdout.trim()) {
    throw new Error(
      proc.stderr?.trim() ||
        '无法读取内置 LLM Key。请设置 LOCAL_LLM_API_KEY，或在 NovelsCreator 设置 → AI 中配置后重试。'
    )
  }
  const parsed = JSON.parse(proc.stdout.trim()) as {
    baseUrl: string
    apiKey: string
    model: string
  }
  if (!parsed.apiKey?.trim()) {
    throw new Error('未配置内置 LLM API Key')
  }
  return {
    baseUrl: parsed.baseUrl.replace(/\/$/, ''),
    apiKey: parsed.apiKey.trim(),
    model: parsed.model?.trim() || 'deepseek-chat'
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

async function main(): Promise<void> {
  const creds = loadCredentials()
  process.env.LOCAL_LLM_BASE_URL = creds.baseUrl
  process.env.LOCAL_LLM_API_KEY = creds.apiKey
  process.env.LOCAL_LLM_MODEL = creds.model
  process.env.LOCAL_LLM_REASONING_MODEL = creds.model

  const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8')) as {
    inputs: OutlineGenerateInputs
  }
  const inputs: OutlineGenerateInputs = {
    ...fixture.inputs,
    retry_count: 0,
    retry_issues_formatted: ''
  }

  console.log('test-outline-local-e2e')
  console.log('baseUrl:', creds.baseUrl)
  console.log('model:', creds.model)

  const flat = await invokeOutlineGraph(inputs)
  const status = String(flat.status ?? '')
  console.log('status:', status)
  assert(status === 'success' || status === 'circuit_break', 'unexpected status')
  if (status === 'success') {
    const doc = JSON.parse(String(flat.outline_json ?? '{}')) as {
      volumes?: { chapters?: unknown[] }[]
    }
    let chapters = 0
    for (const v of doc.volumes ?? []) {
      chapters += v.chapters?.length ?? 0
    }
    assert(chapters >= 1, `expected chapters>=1, got ${chapters}`)
    console.log(`OK outline_json chapters=${chapters}`)
  } else {
    console.log('circuit_break (acceptable for flaky model):', flat.retry_issues_formatted)
  }
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
