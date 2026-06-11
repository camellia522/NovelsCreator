const THINK_RE = /<(?:redacted_)?think(?:ing)?>[\s\S]*?<\/(?:redacted_)?think(?:ing)?>/gi

export function stripThinkBlocks(text: string): string {
  let out = (text || '').replace(THINK_RE, '').trim()
  const low = out.toLowerCase()
  for (const tag of ['redacted_thinking', 'thinking', 'think']) {
    const openTag = `<${tag}>`
    const idx = low.indexOf(openTag)
    if (idx < 0) continue
    const closeTag = `</${tag}>`
    const closeIdx = low.indexOf(closeTag, idx)
    if (closeIdx < 0) return ''
    out = (out.slice(0, idx) + out.slice(closeIdx + closeTag.length)).trim()
  }
  return out.trim()
}

export function parseLlmJson(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (raw == null) return {}
  let text = stripThinkBlocks(String(raw).trim())
  if (!text || ['null', 'none', '{}'].includes(text.toLowerCase())) return {}
  if (text.startsWith('```')) {
    const lines = text.split('\n')
    text = (lines.length > 2 ? lines.slice(1, -1) : lines).join('\n').trim()
  }
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    /* fall through */
  }
  const start = text.indexOf('{')
  if (start < 0) return {}
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1))
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
        } catch {
          return {}
        }
      }
    }
  }
  return {}
}

export function unwrapLlmRoot(parsed: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['structured_output', 'structuredOutput', 'output', 'result', 'data', 'json']) {
    const inner = parsed[key]
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const obj = inner as Record<string, unknown>
      if ('outline' in obj || 'outline_summary' in obj || 'volumes' in obj) return obj
    }
    if (typeof inner === 'string' && inner.trim()) {
      const nested = unwrapLlmRoot(parseLlmJson(inner))
      if (Object.keys(nested).length) return nested
    }
  }
  return parsed
}

export function toInt(value: unknown, fallback = 0): number {
  if (value == null || String(value).trim().toLowerCase() in { null: 1, none: 1, '': 1 }) {
    return fallback
  }
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

export function asBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.trim().toLowerCase())
  if (typeof value === 'number') return value !== 0
  return Boolean(value)
}
