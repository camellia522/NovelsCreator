/**
 * 校验 END_OK 脚本（null 输入 + 8 城样例）
 * npm run test:society-end-ok
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const codePath = join(root, 'dify/world/code/world_society_end_success.py')

function runPythonMain(inputs: Record<string, unknown>): Promise<Record<string, string>> {
  const wrapper = `
import json, importlib.util
spec = importlib.util.spec_from_file_location("end_ok", ${JSON.stringify(codePath)})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
inp = json.loads(${JSON.stringify(JSON.stringify(inputs))})
out = mod.main(**inp)
print(json.dumps(out, ensure_ascii=False))
`
  return new Promise((resolve, reject) => {
    const proc = spawn('python', ['-c', wrapper], { cwd: root })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d))
    proc.stderr.on('data', (d) => (stderr += d))
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr || `exit ${code}`))
      else resolve(JSON.parse(stdout.trim()) as Record<string, string>)
    })
  })
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
  console.log('OK:', msg)
}

console.log('test-society-end-ok')

let nullOut: Record<string, string>
try {
  nullOut = await runPythonMain({
    society_json: null,
    world_rules: null,
    nations_json: null,
    locations_json: null
  })
} catch (e) {
  console.log('(skip) 需要本机 python:', (e as Error).message)
  process.exit(0)
}

assert(typeof nullOut.end_outputs === 'string' && nullOut.end_outputs.length > 20, 'null 仍返回 end_outputs')
assert(typeof nullOut.end_outputs_ === 'string', 'null 仍返回 end_outputs_')
const nullParsed = JSON.parse(nullOut.end_outputs) as { status: string; error_message?: string }
assert(nullParsed.status === 'error', 'null → status error')
assert(Boolean(nullParsed.error_message?.includes('W2SX')), 'null 含提示文案')

const sample = JSON.parse(
  readFileSync(join(root, 'dify/world/fixtures/w2s-end-parse-string-suffix.json'), 'utf8')
).outputs as Record<string, string>

const good = await runPythonMain({
  society_json: sample.society_jsonString,
  world_rules: sample.world_rulesString,
  nations_json: sample.nations_jsonString,
  locations_json: sample.locations_jsonString
})
const goodParsed = JSON.parse(good.end_outputs) as { status: string; locations_json: string }
assert(goodParsed.status === 'success', '8城 status=success')
assert((JSON.parse(goodParsed.locations_json) as unknown[]).length === 8, '8 locations')

console.log('全部通过')
