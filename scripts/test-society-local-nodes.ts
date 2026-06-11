/**
 * 本地社会层 Code 节点 TS 移植测试（无需 LLM / Dify）
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runW2SXNode } from '../electron/main/workflows/local/nodes/society/w2sx.node'
import {
  runSocietyEndOkNode,
  runSocietyParseEndOutputs
} from '../electron/main/workflows/local/nodes/society/end-nodes'
import { extractSocietyOutputsFromDifyRaw } from '../electron/main/utils/world-dify-parse'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const w2sFixture = JSON.parse(
  readFileSync(join(root, 'dify/world/fixtures/w2s-output.example.json'), 'utf-8')
) as { w2s_root: Record<string, unknown> }

const w2sJson = JSON.stringify(w2sFixture.w2s_root)

const w2sx = runW2SXNode({ w2s_json: w2sJson, structured_output: w2sFixture.w2s_root })
assert(w2sx.world_rules.length > 50, 'W2SX world_rules')
assert(JSON.parse(w2sx.nations_json).length === 2, 'W2SX nations=2')
assert(JSON.parse(w2sx.locations_json).length === 2, 'W2SX locations=2')

const endOk = runSocietyEndOkNode({
  society_json: w2sx.society_json,
  world_rules: w2sx.world_rules,
  nations_json: w2sx.nations_json,
  locations_json: w2sx.locations_json
})
const flat = runSocietyParseEndOutputs({ ok_end_outputs: endOk.end_outputs })
assert(flat.status === 'success', 'PARSE success')

const extracted = extractSocietyOutputsFromDifyRaw(flat)
assert(extracted !== null, 'extractSocietyOutputsFromDifyRaw')
const packed = JSON.parse(extracted!.society_json) as {
  nations?: unknown[]
  locations?: unknown[]
  world_rules?: string
}
assert((packed.nations?.length ?? 0) === 2, 'packed nations=2')
assert((packed.locations?.length ?? 0) === 2, 'packed locations=2')
assert(Boolean(packed.world_rules?.trim()), 'packed world_rules')

// empty W2S → error path
const emptyW2sx = runW2SXNode({ w2s_json: '{}' })
const emptyEnd = runSocietyEndOkNode({
  society_json: emptyW2sx.society_json,
  world_rules: emptyW2sx.world_rules,
  nations_json: emptyW2sx.nations_json,
  locations_json: emptyW2sx.locations_json
})
const emptyFlat = runSocietyParseEndOutputs({ ok_end_outputs: emptyEnd.end_outputs })
assert(emptyFlat.status === 'error', 'empty W2S → error')

console.log('test-society-local-nodes: all passed')
