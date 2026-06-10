/**
 * 调用本机 Dify 知识库工作流（blocking），校验 success + knowledge_json 可解析合并。
 * 运行：npm run test:knowledge-dify
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { KnowledgeDocument } from '../src/types/project'
import {
  countKnowledgePayload,
  mergeKnowledgeDocument,
  parseKnowledgeJson,
  validateMergedKnowledge
} from '../src/utils/knowledge-dify-merge'
import { loadDifyCredentials, runDifyWorkflowBlocking } from './dify-e2e-common'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = join(root, 'dify/knowledge/fixtures/knowledge-run.sample.json')

const emptyDoc: KnowledgeDocument = {
  world: { title: '', rules: '' },
  map: {
    version: 1,
    name: '',
    seed: 0,
    width: 100,
    height: 100,
    regions: [],
    rivers: [],
    nations: []
  },
  locations: [],
  characters: [],
  factions: [],
  items: []
}

function summarize(outputs: Record<string, unknown>): void {
  const status = String(outputs.status ?? '')
  console.log(`status=${status} retry_count=${outputs.retry_count ?? 0}`)
  const kj = String(outputs.knowledge_json ?? '')
  console.log(`knowledge_json length=${kj.length}`)
  if (outputs.retry_issues_formatted) {
    console.log('retry_issues:\n' + String(outputs.retry_issues_formatted))
  }
}

async function main(): Promise<void> {
  const creds = loadDifyCredentials('knowledge')
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8')) as {
    inputs: Record<string, unknown>
    user?: string
  }

  console.log(`POST ${creds.baseUrl}/workflows/run`)
  const run = await runDifyWorkflowBlocking(
    creds,
    fixture.inputs,
    fixture.user ?? 'novelscreator-knowledge-e2e',
    1_200_000
  )

  console.log(`workflow_run_id=${run.runId}`)
  summarize(run.outputs)

  const status = String(run.outputs.status ?? '')
  if (status === 'retry') {
    console.warn('E2E: retry（校验未通过，检查 Dify 画布 K1/RE 绑定）')
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

  const rawJson = String(run.outputs.knowledge_json ?? '').trim()
  if (!rawJson) {
    console.error('E2E FAIL: missing knowledge_json')
    process.exit(1)
  }

  const parsed = parseKnowledgeJson(rawJson)
  if (!parsed) {
    console.error('E2E FAIL: knowledge_json 无法解析')
    process.exit(1)
  }

  const counts = countKnowledgePayload(parsed)
  console.log(
    `parsed: characters=${counts.characters} factions=${counts.factions} items=${counts.items}`
  )

  const mode =
    String(fixture.inputs.generation_mode ?? 'bootstrap') === 'expand' ? 'expand' : 'bootstrap'
  const merged = mergeKnowledgeDocument(emptyDoc, parsed, mode)
  const validation = validateMergedKnowledge(merged)
  if (!validation.ok) {
    console.error('E2E FAIL:', validation.errors.join('；'))
    process.exit(1)
  }

  if (counts.characters < 1) {
    console.error('E2E FAIL: 无有效人物')
    process.exit(1)
  }

  console.log('E2E PASS')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
