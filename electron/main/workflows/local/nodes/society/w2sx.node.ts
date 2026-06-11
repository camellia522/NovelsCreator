import { parseJsonLoose, stripThinking } from '../../../../utils/world-dify-parse'

export interface W2SXOutput {
  society_json: string
  world_rules: string
  nations_json: string
  locations_json: string
}

function normalizeRoot(parsed: unknown): Record<string, unknown> {
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        parsed = item
        break
      }
    }
    if (Array.isArray(parsed)) return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const obj = parsed as Record<string, unknown>
  for (const key of ['structured_output', 'structuredOutput', 'output', 'result', 'data', 'society', 'json']) {
    const inner = obj[key]
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const inObj = inner as Record<string, unknown>
      if ('nations' in inObj || 'locations' in inObj || 'world_rules' in inObj) return inObj
    }
    if (typeof inner === 'string' && inner.trim()) {
      const nested = normalizeRoot(parseJsonLoose(inner, {}))
      if (Object.keys(nested).length) return nested
    }
  }
  return obj
}

/** W2SX · 解析 W2S LLM 输出 */
export function runW2SXNode(kwargs: Record<string, unknown>): W2SXOutput {
  const structured = kwargs.structured_output
  let root: Record<string, unknown>
  if (structured != null && structured !== '') {
    root = normalizeRoot(
      typeof structured === 'object' ? structured : parseJsonLoose(structured, {})
    )
  } else {
    const raw = String(kwargs.w2s_json ?? kwargs.text ?? '').trim()
    root = normalizeRoot(parseJsonLoose(raw, {}))
  }

  const worldRules = stripThinking(String(root.world_rules ?? '')).trim()
  const nations = Array.isArray(root.nations) ? root.nations : []
  const locations = Array.isArray(root.locations) ? root.locations : []
  const society = { world_rules: worldRules, nations, locations }

  return {
    society_json: JSON.stringify(society),
    world_rules: worldRules,
    nations_json: JSON.stringify(nations),
    locations_json: JSON.stringify(locations)
  }
}
