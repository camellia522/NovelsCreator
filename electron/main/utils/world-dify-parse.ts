/** 主进程用：Dify 工作流 outputs 字段规范化（与 src/utils/world-dify-parse 逻辑一致） */

export function stripThinking(text: string): string {
  let t = text
  let low = t.toLowerCase()
  const endTags = [
    '</' + 'think' + '>',
    '</' + 'redacted_thinking' + '>',
    '</' + 'thought' + '>'
  ]
  for (const endTag of endTags) {
    const pos = low.indexOf(endTag)
    if (pos >= 0) {
      t = t.slice(pos + endTag.length)
      low = t.toLowerCase()
    }
  }
  return t.trim()
}

export function coerceJsonString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value)
}

export function parseJsonLoose<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as T
  let text = stripThinking(coerceJsonString(raw))
  if (!text || text === '{}' || text === '[]' || text === 'null') return fallback
  if (text.startsWith('```')) {
    const lines = text.split('\n')
    text = lines.slice(1, -1).join('\n').trim() || text
  }
  try {
    return JSON.parse(text) as T
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T
      } catch {
        return fallback
      }
    }
    return fallback
  }
}

export interface FlatSocietyOutputs {
  society_json: string
  nations_json: string
  locations_json: string
  world_rules: string
}

function normalizeSocietyRoot(parsed: unknown): Record<string, unknown> | null {
  if (parsed == null) return null
  if (Array.isArray(parsed)) {
    const objs = parsed.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Record<
      string,
      unknown
    >[]
    if (objs.length === 1 && ('id' in objs[0] || 'nationId' in objs[0])) {
      return { locations: objs, nations: [], world_rules: '' }
    }
    const item = objs.find((x) => 'nations' in x || 'locations' in x || 'world_rules' in x)
    if (item) return item
    return null
  }
  if (typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  for (const key of ['structured_output', 'structuredOutput', 'output', 'result', 'data', 'society', 'json']) {
    const inner = obj[key]
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const inObj = inner as Record<string, unknown>
      if ('nations' in inObj || 'locations' in inObj || 'world_rules' in inObj || 'worldRules' in inObj) {
        return inObj
      }
    }
    if (typeof inner === 'string' && inner.trim()) {
      const nested = normalizeSocietyRoot(parseJsonLoose(inner, null))
      if (nested) return nested
    }
  }
  if ('nations' in obj || 'locations' in obj || 'world_rules' in obj || 'worldRules' in obj) return obj
  return null
}

function packSocietyFromRoot(root: Record<string, unknown>): FlatSocietyOutputs | null {
  const nations = root.nations
  const locations = root.locations
  const world_rules = String(root.world_rules ?? root.worldRules ?? '').trim()
  const hasNations = Array.isArray(nations) && nations.length > 0
  const hasLocations = Array.isArray(locations) && locations.length > 0
  if (!hasNations && !hasLocations && !world_rules) return null
  if (isPlaceholderOnly(world_rules) && !hasNations && !hasLocations) return null
  const packed = {
    world_rules,
    nations: hasNations ? nations : [],
    locations: hasLocations ? locations : []
  }
  const society_json = JSON.stringify(packed)
  return {
    society_json,
    nations_json: JSON.stringify(packed.nations),
    locations_json: JSON.stringify(packed.locations),
    world_rules
  }
}

/** Dify END 常把 PARSE 的 String 输出命名为 society_jsonString 等 */
function pickWorkflowOutput(raw: Record<string, unknown>, snake: string): string {
  const camel = snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  const keys = [snake, `${snake}String`, camel, `${camel}String`]
  for (const k of keys) {
    const v = coerceJsonString(raw[k])
    if (v.trim()) return v
  }
  return ''
}

function isPlaceholderOnly(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (t === '……' || t === '...' || t === '[…]' || t === '…') return true
  if (/^\[…\]$/.test(t) || /^\[\.\.\.\]$/.test(t)) return true
  if (t.includes('[…]') && !t.includes('"id"')) return true
  return false
}

/** 诊断 END outputs 为何无法解析（便于配置 Dify） */
export function diagnoseSocietyOutputs(raw: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of ['society_json', 'nations_json', 'locations_json', 'world_rules', 'status']) {
    const v = pickWorkflowOutput(raw, key)
    if (!v.trim()) parts.push(`${key}=空`)
    else if (isPlaceholderOnly(v) || (key !== 'world_rules' && v.length < 12 && isPlaceholderOnly(v.slice(0, 20)))) {
      parts.push(`${key}=占位符未替换`)
    } else parts.push(`${key}=${v.length}字`)
  }
  const end = coerceJsonString(raw.end_outputs ?? raw.end_outputs_ ?? raw.ok_end_outputs)
  if (end.trim()) parts.push(`end_outputs=${end.length}字`)
  return parts.join('；')
}

/**
 * 从 Dify END / PARSE / 直连 LLM 等多种 outputs 形状提取社会层 JSON。
 */
export function extractSocietyOutputsFromDifyRaw(
  raw: Record<string, unknown>
): FlatSocietyOutputs | null {
  for (const key of ['structured_output', 'structuredOutput']) {
    const v = raw[key]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const packed = packSocietyFromRoot(v as Record<string, unknown>)
      if (packed) return packed
    }
  }

  if (Array.isArray(raw.locations) && raw.locations.length) {
    const packed = packSocietyFromRoot({
      locations: raw.locations,
      nations: Array.isArray(raw.nations) ? raw.nations : [],
      world_rules: String(raw.world_rules ?? raw.worldRules ?? '')
    })
    if (packed) return packed
  }

  const society_json = pickWorkflowOutput(raw, 'society_json')
  if (society_json.trim()) {
    const root = normalizeSocietyRoot(parseJsonLoose(society_json, null))
    if (root) {
      const packed = packSocietyFromRoot(root)
      if (packed) return packed
    }
  }

  for (const key of ['end_outputs', 'endOutputs', 'ok_end_outputs', 'okEndOutputs']) {
    const blob = coerceJsonString(raw[key])
    if (!blob.trim()) continue
    const end = parseJsonLoose<Record<string, unknown>>(blob, {})
    const inner = pickWorkflowOutput(end, 'society_json')
    if (inner.trim()) {
      const root = normalizeSocietyRoot(parseJsonLoose(inner, null))
      if (root) {
        const packed = packSocietyFromRoot(root)
        if (packed) return packed
      }
    }
    const wr = pickWorkflowOutput(end, 'world_rules')
    const nj = pickWorkflowOutput(end, 'nations_json')
    const lj = pickWorkflowOutput(end, 'locations_json')
    const nationsArr = parseJsonLoose<unknown[]>(nj, [])
    const locationsArr = parseJsonLoose<unknown[]>(lj, [])
    const hasNationItems = Array.isArray(nationsArr) && nationsArr.length > 0
    const hasLocationItems = Array.isArray(locationsArr) && locationsArr.length > 0
    if (
      hasNationItems ||
      hasLocationItems ||
      (wr.trim() && !isPlaceholderOnly(wr))
    ) {
      return {
        society_json: JSON.stringify({
          world_rules: wr,
          nations: hasNationItems ? nationsArr : [],
          locations: hasLocationItems ? locationsArr : []
        }),
        nations_json: hasNationItems ? nj : '[]',
        locations_json: hasLocationItems ? lj : '[]',
        world_rules: wr
      }
    }
  }

  const nations_json = pickWorkflowOutput(raw, 'nations_json')
  const locations_json = pickWorkflowOutput(raw, 'locations_json')
  const world_rules = pickWorkflowOutput(raw, 'world_rules')
  const nationsArr = parseJsonLoose<unknown[]>(nations_json, [])
  const locationsArr = parseJsonLoose<unknown[]>(locations_json, [])
  const hasNationItems = Array.isArray(nationsArr) && nationsArr.length > 0
  const hasLocationItems = Array.isArray(locationsArr) && locationsArr.length > 0
  if (hasNationItems || hasLocationItems || (world_rules.trim() && !isPlaceholderOnly(world_rules))) {
    return {
      society_json: JSON.stringify({
        world_rules: world_rules.trim(),
        nations: hasNationItems ? nationsArr : [],
        locations: hasLocationItems ? locationsArr : []
      }),
      nations_json: hasNationItems ? nations_json : '[]',
      locations_json: hasLocationItems ? locations_json : '[]',
      world_rules: world_rules.trim()
    }
  }

  for (const key of ['text', 'w2s_json', 'w2sJson', 'w2s', 'W2S', 'llm', 'output', 'result', 'answer']) {
    const blob = coerceJsonString(raw[key])
    if (!blob.trim()) continue
    const root = normalizeSocietyRoot(parseJsonLoose(blob, null))
    if (root) {
      const packed = packSocietyFromRoot(root)
      if (packed) return packed
    }
  }

  if (world_rules.trim()) {
    const root = normalizeSocietyRoot(parseJsonLoose(world_rules, null))
    if (root) {
      const packed = packSocietyFromRoot(root)
      if (packed) return packed
    }
  }

  return null
}

export function inferWorkflowStatus(raw: Record<string, unknown>): 'success' | 'error' {
  const s = raw.status
  if (s === 'success' || s === 'error') return s
  const map = coerceJsonString(raw.map_json ?? raw.mapJson)
  const loc = coerceJsonString(raw.locations_json ?? raw.locationsJson)
  if (map.trim() && loc.trim()) return 'success'
  if (raw.error_message || raw.errorMessage) return 'error'
  return 'error'
}
