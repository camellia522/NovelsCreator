import { parseJsonLoose } from '../../../../utils/world-dify-parse'

const WORKFLOW_VERSION_DEFAULT = 'world-society-v1'

function asList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  const parsed = parseJsonLoose<unknown>(raw, [])
  return Array.isArray(parsed) ? parsed : []
}

function pickList(societyVal: unknown, separateJson: unknown): unknown[] {
  const sep = asList(separateJson)
  if (sep.length > 0) return sep
  if (Array.isArray(societyVal) && societyVal.length > 0) return societyVal
  return []
}

function buildPacked(kwargs: Record<string, unknown>): { end_outputs: Record<string, unknown> } {
  const societyJsonIn = kwargs.society_json ?? ''
  const worldRulesIn = kwargs.world_rules ?? ''
  const nationsJsonIn = kwargs.nations_json ?? '[]'
  const locationsJsonIn = kwargs.locations_json ?? '[]'

  let society = parseJsonLoose<Record<string, unknown>>(societyJsonIn, {})
  if (typeof society === 'string') {
    society = parseJsonLoose(society, {})
  }
  if (!society || typeof society !== 'object') society = {}

  const wr = String(worldRulesIn || society.world_rules || '').trim()
  const nations = pickList(society.nations, nationsJsonIn)
  const locations = pickList(society.locations, locationsJsonIn)
  const packed = { world_rules: wr, nations, locations }
  const hasData = Boolean(wr) || nations.length > 0 || locations.length > 0

  const endOutputs = {
    status: hasData ? 'success' : 'error',
    society_json: JSON.stringify(packed),
    world_rules: wr,
    nations_json: JSON.stringify(nations),
    locations_json: JSON.stringify(locations),
    workflow_version: String(kwargs.workflow_version || WORKFLOW_VERSION_DEFAULT).trim() || WORKFLOW_VERSION_DEFAULT,
    error_message: hasData
      ? ''
      : 'END_OK 未收到 W2SX 数据：请检查 society_json/world_rules/nations_json/locations_json 是否绑定到 W2SX 对应输出。'
  }
  return { end_outputs: endOutputs }
}

export function runSocietyEndOkNode(kwargs: Record<string, unknown>): { end_outputs: string } {
  try {
    const { end_outputs } = buildPacked(kwargs)
    const packedStr = JSON.stringify(end_outputs)
    return { end_outputs: packedStr }
  } catch (exc) {
    const err = {
      status: 'error',
      society_json: JSON.stringify({ world_rules: '', nations: [], locations: [] }),
      world_rules: '',
      nations_json: '[]',
      locations_json: '[]',
      workflow_version: WORKFLOW_VERSION_DEFAULT,
      error_message: `END_OK 异常: ${exc instanceof Error ? exc.message : String(exc)}`
    }
    return { end_outputs: JSON.stringify(err) }
  }
}

function pickRaw(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (c == null) continue
    if (typeof c === 'object') return JSON.stringify(c)
    const text = String(c).trim()
    if (text && !['None', 'null'].includes(text)) return text
  }
  return ''
}

export function runSocietyParseEndOutputs(kwargs: Record<string, unknown>): Record<string, unknown> {
  const raw = pickRaw(kwargs.end_outputs, kwargs.end_outputs_, kwargs.ok_end_outputs)
  const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  return {
    status: o.status ?? 'error',
    society_json: o.society_json ?? '',
    world_rules: o.world_rules ?? '',
    nations_json: o.nations_json ?? '',
    locations_json: o.locations_json ?? '',
    workflow_version: o.workflow_version ?? WORKFLOW_VERSION_DEFAULT,
    error_message: o.error_message ?? ''
  }
}
