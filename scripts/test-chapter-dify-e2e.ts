/**
 * 调用本机 Dify 章节工作流（blocking），校验 success + 正文长度。
 * 运行：npm run test:chapter-dify
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WorkflowOutputs } from '../src/types/api'
import { validateChapterWorkflowOutputs } from '../electron/main/utils/chapter-output-validation'
import { loadDifyCredentials, runDifyWorkflowBlocking } from './dify-e2e-common'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = join(root, 'dify/chapter/fixtures/run-request-success.json')

function summarize(outputs: Record<string, unknown>): void {
  const status = String(outputs.status ?? '')
  console.log(`status=${status} retry_count=${outputs.retry_count ?? 0}`)
  const body = String(outputs.novel_body ?? '')
  console.log(`novel_body length=${body.length}`)
  if (outputs.video_script) {
    console.log(`video_script length=${String(outputs.video_script).length}`)
  }
  if (outputs.retry_issues_formatted) {
    console.log('retry_issues:\n' + String(outputs.retry_issues_formatted))
  }
}

async function main(): Promise<void> {
  const creds = loadDifyCredentials('chapter')
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8')) as {
    inputs: Record<string, unknown>
    user?: string
  }

  console.log(`POST ${creds.baseUrl}/workflows/run`)
  const run = await runDifyWorkflowBlocking(
    creds,
    fixture.inputs,
    fixture.user ?? 'novelscreator-chapter-e2e'
  )

  console.log(`workflow_run_id=${run.runId}`)
  summarize(run.outputs)

  const status = String(run.outputs.status ?? '')
  if (status === 'retry') {
    console.warn('E2E: retry（校验未通过，检查 Dify 画布 N2/RE 绑定）')
    process.exit(2)
  }

  if (status === 'circuit_break') {
    console.error('E2E FAIL: circuit_break')
    process.exit(1)
  }

  if (status !== 'success') {
    console.error(`E2E FAIL: unexpected status=${status}`)
    process.exit(1)
  }

  const check = validateChapterWorkflowOutputs(run.outputs as WorkflowOutputs)
  for (const w of check.warnings) console.warn('warn:', w)
  if (!check.ok) {
    console.error('E2E FAIL:', check.errors.join('；'))
    process.exit(1)
  }

  console.log('E2E PASS')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
