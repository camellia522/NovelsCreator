/**
 * 调用本机 Dify 大纲工作流（blocking），使用 NovelsCreator 已保存的 API Key。
 * 运行：npm run test:outline-dify
 */
import axios from 'axios'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = join(root, 'dify/outline/fixtures/outline-run.epic-fantasy.json')

function loadCredentials(): { baseUrl: string; apiKey: string } {
  const envKey = process.env.DIFY_OUTLINE_API_KEY?.trim() || process.env.DIFY_API_KEY?.trim()
  const envBase = process.env.DIFY_BASE_URL?.trim()
  if (envKey) {
    return {
      baseUrl: (envBase || 'http://127.0.0.1/v1').replace(/\/$/, ''),
      apiKey: envKey
    }
  }

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
        '无法读取 Dify 大纲 Key。请设置环境变量 DIFY_OUTLINE_API_KEY，或在 NovelsCreator 设置中配置后重试。'
    )
  }
  const parsed = JSON.parse(proc.stdout.trim()) as { baseUrl: string; outline: string }
  if (!parsed.outline?.trim()) {
    throw new Error('未配置大纲工作流 API Key')
  }
  return { baseUrl: parsed.baseUrl.replace(/\/$/, ''), apiKey: parsed.outline.trim() }
}

function summarizeOutputs(outputs: Record<string, unknown>): void {
  const status = String(outputs.status ?? '')
  console.log(`status=${status}`)
  if (outputs.outline_summary) {
    const s = String(outputs.outline_summary)
    console.log(`outline_summary (${s.length} chars): ${s.slice(0, 120)}…`)
  }
  const oj = String(outputs.outline_json ?? '')
  if (oj) {
    console.log(`outline_json length=${oj.length}`)
    try {
      const doc = JSON.parse(oj) as { volumes?: { chapters?: unknown[] }[] }
      let chapters = 0
      let beats = 0
      for (const v of doc.volumes ?? []) {
        for (const c of v.chapters ?? []) {
          chapters++
          const ch = c as { beats?: unknown[] }
          beats += ch.beats?.length ?? 0
        }
      }
      console.log(`parsed: volumes=${doc.volumes?.length ?? 0} chapters=${chapters} beats=${beats}`)
    } catch {
      console.log(`outline_json NOT valid JSON (first 120): ${oj.slice(0, 120)}…`)
      console.log('→ 请在 Dify 更新 AGG/RE/CB/O1X 代码，并确认 O2.outline_json ← O1X.outline_json')
    }
  }
  if (outputs.retry_issues_formatted) {
    console.log('retry_issues:\n' + String(outputs.retry_issues_formatted))
  }
}

async function main(): Promise<void> {
  const { baseUrl, apiKey } = loadCredentials()
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8')) as {
    inputs: Record<string, string>
  }

  console.log(`POST ${baseUrl}/workflows/run`)
  const resp = await axios.post(
    `${baseUrl}/workflows/run`,
    {
      inputs: fixture.inputs,
      response_mode: 'blocking',
      user: 'novelscreator-outline-e2e'
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 900_000
    }
  )

  const data = resp.data as { data?: { status?: string; error?: string; outputs?: Record<string, unknown>; id?: string } }
  if (data.data?.status === 'failed') {
    console.error('workflow failed:', data.data.error)
    process.exit(1)
  }

  const outputs = data.data?.outputs ?? {}
  console.log(`workflow_run_id=${data.data?.id ?? ''}`)
  summarizeOutputs(outputs)

  const status = String(outputs.status ?? '')
  if (status === 'success' && outputs.outline_json) {
    const doc = JSON.parse(String(outputs.outline_json)) as { volumes?: { chapters?: { beats?: unknown[] }[] }[] }
    let beats = 0
    for (const v of doc.volumes ?? []) {
      for (const c of v.chapters ?? []) beats += c.beats?.length ?? 0
    }
    if (beats >= 2) {
      console.log('E2E PASS')
      return
    }
    console.error('E2E FAIL: success but beats < 2')
    process.exit(1)
  }

  if (status === 'retry') {
    console.warn('E2E: retry（校验未通过，检查 Dify 画布 O1/O1X/O2 绑定）')
    process.exit(2)
  }

  console.error('E2E FAIL: circuit_break or missing outline')
  process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
