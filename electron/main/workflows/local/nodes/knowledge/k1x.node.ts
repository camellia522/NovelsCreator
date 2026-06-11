import { parseLlmJson, unwrapLlmRoot } from '../../utils/outline-llm-json'

export interface K1XOutput {
  knowledge_summary: string
  knowledge_json: string
}

function normalizeKnowledgeDoc(parsed: Record<string, unknown>): {
  summary: string
  doc: { world: Record<string, unknown>; characters: unknown[]; factions: unknown[]; items: unknown[] }
} {
  const root = unwrapLlmRoot(parsed)
  const summary = String(root.knowledge_summary ?? '').trim()
  const knowledge = root.knowledge
  if (knowledge && typeof knowledge === 'object' && !Array.isArray(knowledge)) {
    const k = knowledge as Record<string, unknown>
    return {
      summary,
      doc: {
        world: (k.world && typeof k.world === 'object' ? k.world : {}) as Record<string, unknown>,
        characters: Array.isArray(k.characters) ? k.characters : [],
        factions: Array.isArray(k.factions) ? k.factions : [],
        items: Array.isArray(k.items) ? k.items : []
      }
    }
  }
  return {
    summary,
    doc: {
      world: (root.world && typeof root.world === 'object' ? root.world : {}) as Record<string, unknown>,
      characters: Array.isArray(root.characters) ? root.characters : [],
      factions: Array.isArray(root.factions) ? root.factions : [],
      items: Array.isArray(root.items) ? root.items : []
    }
  }
}

function countNamedCharacters(doc: {
  characters?: { name?: string }[]
}): number {
  let n = 0
  for (const c of doc.characters ?? []) {
    if (c && typeof c === 'object' && String(c.name ?? '').trim()) n++
  }
  return n
}

function pickK1Raw(kwargs: Record<string, unknown>): unknown {
  const candidates: unknown[] = []
  for (const key of ['structured_output', 'k1_result', 'text', 'k1_text']) {
    const val = kwargs[key]
    if (val == null) continue
    if (typeof val === 'string' && ['null', 'none', ''].includes(val.trim().toLowerCase())) continue
    candidates.push(val)
  }
  let best: unknown = ''
  for (const val of candidates) {
    const { doc } = normalizeKnowledgeDoc(parseLlmJson(val))
    if (countNamedCharacters(doc) > 0) return val
    if (!best) best = val
  }
  return best
}

/** K1X · 解析 K1 LLM 输出 */
export function runK1XNode(kwargs: Record<string, unknown>): K1XOutput {
  const raw = pickK1Raw(kwargs)
  let { summary, doc } = normalizeKnowledgeDoc(parseLlmJson(raw))

  if (countNamedCharacters(doc) === 0) {
    for (const key of ['structured_output', 'k1_result', 'text', 'k1_text']) {
      const val = kwargs[key]
      if (val == null || val === raw) continue
      const alt = normalizeKnowledgeDoc(parseLlmJson(val))
      if (countNamedCharacters(alt.doc) > 0) {
        summary = alt.summary || summary
        doc = alt.doc
        break
      }
    }
  }

  return {
    knowledge_summary: summary,
    knowledge_json: JSON.stringify(doc)
  }
}
