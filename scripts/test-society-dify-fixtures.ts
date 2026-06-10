/**
 * 读取 dify/world/fixtures/*.json，模拟主进程 workflows/run 的 outputs 解析。
 *
 * 用法：
 *   npm run test:society-fixtures
 *   npx tsx scripts/test-society-dify-fixtures.ts w2s-end-parse-string-suffix.json
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  diagnoseSocietyOutputs,
  extractSocietyOutputsFromDifyRaw
} from '../electron/main/utils/world-dify-parse.ts'
import { parseSocietyLlmPayload } from '../src/utils/world-territory-society.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturesDir = join(root, 'dify/world/fixtures')

interface FixtureFile {
  description?: string
  outputs?: Record<string, unknown>
  workflow_api_response?: { data?: { outputs?: Record<string, unknown> } }
  expected_client_parse?: {
    locations_count?: number
    nations_count?: number
    service_gate_pass: boolean
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exitCode = 1
    throw new Error(msg)
  }
  console.log('OK:', msg)
}

function runFixture(name: string, file: FixtureFile): void {
  const raw =
    file.workflow_api_response?.data?.outputs ?? file.outputs ?? {}
  const expect = file.expected_client_parse
  if (!expect) {
    console.log(`\n(skip) ${name} — 无 expected_client_parse`)
    return
  }

  console.log(`\n=== ${name} ===`)
  if (file.description) console.log(file.description)
  console.log('diagnose:', diagnoseSocietyOutputs(raw))

  const extracted = extractSocietyOutputsFromDifyRaw(raw)
  const llmPayload = extracted
    ? parseSocietyLlmPayload({
        society_json: extracted.society_json,
        nations_json: extracted.nations_json,
        locations_json: extracted.locations_json,
        world_rules: extracted.world_rules
      })
    : null

  const packed = extracted ? JSON.parse(extracted.society_json) : null
  const locCount = packed?.locations?.length ?? llmPayload?.locations?.length ?? 0
  const nationCount = packed?.nations?.length ?? llmPayload?.nations?.length ?? 0
  const gate =
    Boolean(
      nationCount ||
        locCount ||
        extracted?.world_rules?.trim() ||
        llmPayload?.worldRules?.trim()
    )

  if (expect.service_gate_pass) {
    assert(extracted !== null, `${name} extract 应成功`)
    assert(gate, `${name} service 门闩应通过`)
    if (expect.locations_count != null) {
      assert(locCount === expect.locations_count, `${name} locations=${expect.locations_count} 实际 ${locCount}`)
    }
    if (expect.nations_count != null) {
      assert(nationCount === expect.nations_count, `${name} nations=${expect.nations_count} 实际 ${nationCount}`)
    }
  } else {
    assert(!gate || extracted === null, `${name} 应解析失败或门闩不通过`)
  }
}

const arg = process.argv[2]
const files = arg
  ? [arg.endsWith('.json') ? arg : `${arg}.json`]
  : [
      'w2s-end-parse-string-suffix.json',
      'w2s-end-empty-string-suffix.json',
      'w2s-end-user-sample.json'
    ]

console.log('test-society-dify-fixtures')
console.log('fixtures:', fixturesDir)

for (const f of files) {
  const path = join(fixturesDir, basename(f))
  const file = JSON.parse(readFileSync(path, 'utf8')) as FixtureFile
  runFixture(basename(f), file)
}

if (!arg) {
  const all = readdirSync(fixturesDir).filter((n) => n.endsWith('.json'))
  console.log('\n可用 fixture 文件:', all.join(', '))
}

console.log('\n完成。')
