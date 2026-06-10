/**
 * Dify 世界观工作流 JSON 解析（与 dify/world/code/world_w1_extract.py 对齐）
 */

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

function hasWorldKeys(d: Record<string, unknown>): boolean {
  return ['world_rules', 'worldRules', 'map', 'locations', 'map_image_prompt', 'mapImagePrompt'].some(
    (k) => k in d
  )
}

function hasSocietyKeys(d: Record<string, unknown>): boolean {
  return ['world_rules', 'worldRules', 'nations', 'locations', 'society_json', 'societyJson'].some(
    (k) => k in d
  )
}

/** Dify END 的 society_jsonString 等命名 */
export function pickWorkflowOutput(raw: Record<string, unknown>, snake: string): string {
  const camel = snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  const keys = [snake, `${snake}String`, camel, `${camel}String`]
  for (const k of keys) {
    const v = coerceJsonString(raw[k])
    if (v.trim()) return v
  }
  return ''
}

/** 解析 W2S / society_json 根对象（兼容嵌套 output/result） */
export function unwrapSocietyRoot(raw: unknown): Record<string, unknown> {
  let parsed = parseJsonLoose<unknown>(raw, {})
  if (Array.isArray(parsed)) {
    const first = parsed.find((x) => x && typeof x === 'object' && !Array.isArray(x))
    parsed = first ?? {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const obj = parsed as Record<string, unknown>
  if (hasSocietyKeys(obj)) return obj
  for (const key of ['structured_output', 'output', 'result', 'data', 'society', 'json', 'answer']) {
    const inner = obj[key]
    if (inner && typeof inner === 'object' && !Array.isArray(inner) && hasSocietyKeys(inner as Record<string, unknown>)) {
      return inner as Record<string, unknown>
    }
    if (typeof inner === 'string' && inner.trim()) {
      const nested = unwrapSocietyRoot(inner)
      if (Object.keys(nested).length) return nested
    }
  }
  if (typeof obj.text === 'string' && obj.text.trim()) {
    const nested = unwrapSocietyRoot(obj.text)
    if (Object.keys(nested).length) return nested
  }
  return obj
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

/** 从 W1 根对象、END 的 map_json 字符串或裸 map 对象取出地图文档 */
export function unwrapMapFromModelJson(raw: unknown): Record<string, unknown> {
  const direct = parseJsonLoose<Record<string, unknown>>(raw, {})
  if (direct.regions || direct.terrainCells) return direct

  const root = unwrapW1Root(raw)
  const map = root.map ?? root.map_json ?? root.mapJson
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    return map as Record<string, unknown>
  }
  if (root.regions || root.terrainCells) return root
  return direct
}

export function unwrapW1Root(raw: unknown): Record<string, unknown> {
  let parsed = parseJsonLoose<unknown>(raw, {})
  if (Array.isArray(parsed)) {
    const first = parsed.find((x) => x && typeof x === 'object' && !Array.isArray(x))
    parsed = first ?? {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }
  const obj = parsed as Record<string, unknown>
  if (hasWorldKeys(obj)) return obj

  for (const key of ['structured_output', 'output', 'result', 'data', 'json', 'answer']) {
    const inner = obj[key]
    if (inner && typeof inner === 'object' && !Array.isArray(inner) && hasWorldKeys(inner as Record<string, unknown>)) {
      return inner as Record<string, unknown>
    }
    if (typeof inner === 'string') {
      const nested = unwrapW1Root(inner)
      if (Object.keys(nested).length) return nested
    }
  }

  if (typeof obj.text === 'string' && obj.text.trim()) {
    const nested = unwrapW1Root(obj.text)
    if (Object.keys(nested).length) return nested
  }

  return obj
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
