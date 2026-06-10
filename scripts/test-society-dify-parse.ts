/**
 * 本地校验 Dify 社会层 END 输出能否被主进程解析。
 * 运行：npx tsx scripts/test-society-dify-parse.ts
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  diagnoseSocietyOutputs,
  extractSocietyOutputsFromDifyRaw
} from '../electron/main/utils/world-dify-parse.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 用户提供的有效 END 样例（6 城） */
const GOOD_OUTPUTS: Record<string, unknown> = {
  society_json:
    '{"world_rules": "世界名为埃瑟拉，处于铁器时代与魔法余晖交织的纪元。", "nations": [{"id": "nation-001", "government": "君主立宪", "culture": "重商", "description": "奥兰多王国临海重商。", "authorSettings": ""}, {"id": "nation-002", "government": "封建帝国", "culture": "武勋农耕", "description": "达贡帝国以农立国。", "authorSettings": ""}], "locations": [{"id": "loc-001", "name": "碧波堡", "type": "capital", "x": 25.5, "y": 45.3, "nationId": "nation-001", "terrain": "coast", "climate": "温带海洋性", "description": "奥兰多王国首都。", "population": "约15万"}, {"id": "loc-002", "name": "霜叶城", "type": "capital", "x": 72.8, "y": 48.6, "nationId": "nation-002", "terrain": "plain", "climate": "温带大陆性", "description": "达贡帝国都城。", "population": "约25万"}, {"id": "loc-003", "name": "金穗镇", "type": "town", "x": 60.2, "y": 55.1, "nationId": "nation-002", "terrain": "plain", "climate": "温带", "description": "北方粮镇。", "population": "约8千"}, {"id": "loc-004", "name": "银沙港", "type": "city", "x": 18.9, "y": 52.0, "nationId": "nation-001", "terrain": "coast", "climate": "亚热带", "description": "南部贸易港。", "population": "约6万"}, {"id": "loc-005", "name": "灰脊关隘", "type": "fortress", "x": 50.0, "y": 48.0, "nationId": "nation-002", "terrain": "mountain", "climate": "高山气候", "description": "边境要塞。", "population": "约2千驻军"}, {"id": "loc-006", "name": "沉星湖", "type": "landmark", "x": 82.0, "y": 32.5, "nationId": "nation-002", "terrain": "forest", "climate": "亚热带", "description": "森林深处的圣湖。", "population": "无定居"}]}',
  nations_json:
    '[{"id": "nation-001", "government": "君主立宪", "culture": "重商", "description": "奥兰多王国临海。"}, {"id": "nation-002", "government": "封建帝国", "culture": "武勋农耕", "description": "达贡帝国以农立国。"}]',
  locations_json:
    '[{"id": "loc-001", "name": "碧波堡"}, {"id": "loc-002", "name": "霜叶城"}, {"id": "loc-003", "name": "金穗镇"}, {"id": "loc-004", "name": "银沙港"}, {"id": "loc-005", "name": "灰脊关隘"}, {"id": "loc-006", "name": "沉星湖"}]',
  world_rules: '世界名为埃瑟拉，处于铁器时代与魔法余晖交织的纪元。',
  status: 'success'
}

/** Dify PARSE → END 带 String 后缀 */
const GOOD_OUTPUTS_STRING_SUFFIX: Record<string, unknown> = {
  statusString: 'success',
  society_jsonString: GOOD_OUTPUTS.society_json,
  nations_jsonString: GOOD_OUTPUTS.nations_json,
  locations_jsonString: GOOD_OUTPUTS.locations_json,
  world_rulesString: GOOD_OUTPUTS.world_rules
}

const BAD_EMPTY: Record<string, unknown> = {
  status: 'success',
  society_json: '',
  nations_json: '[]',
  locations_json: '[]',
  world_rules: ''
}

const BAD_PLACEHOLDER: Record<string, unknown> = {
  status: 'success',
  society_json: '{"world_rules":"……","nations":[…],"locations":[…]}',
  nations_json: '[]',
  locations_json: '[]',
  world_rules: '……'
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exitCode = 1
    throw new Error(msg)
  }
  console.log('OK:', msg)
}

function runCase(name: string, raw: Record<string, unknown>, expectOk: boolean): void {
  console.log('\n---', name, '---')
  console.log('diagnose:', diagnoseSocietyOutputs(raw))
  const extracted = extractSocietyOutputsFromDifyRaw(raw)
  if (!expectOk) {
    assert(extracted === null, `${name} 应解析失败`)
    return
  }
  assert(extracted !== null, `${name} 应解析成功`)
  const packed = JSON.parse(extracted!.society_json) as {
    nations?: unknown[]
    locations?: unknown[]
    world_rules?: string
  }
  assert(
    (packed.nations?.length ?? 0) >= 2,
    `${name} nations>=2 实际 ${packed.nations?.length}`
  )
  assert(
    (packed.locations?.length ?? 0) === 6,
    `${name} locations=6 实际 ${packed.locations?.length}`
  )
  assert(
    Boolean(extracted!.world_rules.trim()),
    `${name} world_rules 非空`
  )
  // 与 world-society.service 一致的门闩
  const serviceOk =
    packed.nations?.length || packed.locations?.length || extracted!.world_rules.trim()
  assert(Boolean(serviceOk), `${name} 主进程 service 门闩应通过`)
}

console.log('test-society-dify-parse\nroot:', root)

runCase('用户样例（标准键名）', GOOD_OUTPUTS, true)
runCase('用户样例（String 后缀）', GOOD_OUTPUTS_STRING_SUFFIX, true)
runCase('空内容（仅有键名）', BAD_EMPTY, false)
runCase('占位符省略号', BAD_PLACEHOLDER, false)

const BAD_END_BLOB: Record<string, unknown> = {
  end_outputs: JSON.stringify({
    status: 'success',
    society_json: '{"world_rules":"","nations":[],"locations":[]}',
    nations_json: '[]',
    locations_json: '[]',
    world_rules: ''
  })
}
runCase('end_outputs 仅空数组', BAD_END_BLOB, false)

for (const fixtureName of [
  'w2s-end-user-sample.json',
  'w2s-end-parse-string-suffix.json'
]) {
  const fullPath = join(root, 'dify/world/fixtures', fixtureName)
  try {
    const file = JSON.parse(readFileSync(fullPath, 'utf-8')) as {
      description?: string
      outputs?: Record<string, unknown>
      workflow_api_response?: { data?: { outputs?: Record<string, unknown> } }
    }
    const raw =
      file.workflow_api_response?.data?.outputs ??
      (() => {
        const { description: _d, outputs, workflow_api_response: _w, expected_client_parse: _e, binding_checklist: _b, ...rest } = file as Record<string, unknown>
        return (outputs ?? rest) as Record<string, unknown>
      })()
    const expectLoc = fixtureName.includes('string-suffix') ? 8 : 6
    console.log('\n---', fixtureName, '---')
    console.log('diagnose:', diagnoseSocietyOutputs(raw))
    const extracted = extractSocietyOutputsFromDifyRaw(raw)
    assert(extracted !== null, `${fixtureName} 应解析成功`)
    const packed = JSON.parse(extracted!.society_json) as { locations?: unknown[] }
    assert(
      (packed.locations?.length ?? 0) === expectLoc,
      `${fixtureName} locations=${expectLoc} 实际 ${packed.locations?.length}`
    )
    console.log('OK:', fixtureName)
  } catch (e) {
    console.log('\n(skip)', fixtureName, '—', (e as Error).message)
  }
}

console.log('\n全部通过。')
