import { parseLlmJson, unwrapLlmRoot } from '../../utils/outline-llm-json'

function normalizeVolumesDoc(parsed: Record<string, unknown>): { summary: string; doc: { volumes: unknown[] } } {
  const root = unwrapLlmRoot(parsed)
  const summary = String(root.outline_summary ?? '').trim()
  const outline = root.outline
  if (outline && typeof outline === 'object' && Array.isArray((outline as { volumes?: unknown[] }).volumes)) {
    return { summary, doc: outline as { volumes: unknown[] } }
  }
  if (Array.isArray(root.volumes)) {
    return { summary, doc: { volumes: root.volumes } }
  }
  return { summary, doc: { volumes: [] } }
}

function countChapters(doc: { volumes?: unknown[] }): number {
  let n = 0
  for (const vol of doc.volumes ?? []) {
    if (vol && typeof vol === 'object' && Array.isArray((vol as { chapters?: unknown[] }).chapters)) {
      n += (vol as { chapters: unknown[] }).chapters.length
    }
  }
  return n
}

function pickO1Raw(kwargs: Record<string, unknown>): unknown {
  const candidates: unknown[] = []
  for (const key of ['structured_output', 'o1_result', 'text', 'o1_text']) {
    const val = kwargs[key]
    if (val == null) continue
    if (typeof val === 'string' && ['null', 'none', ''].includes(val.trim().toLowerCase())) continue
    candidates.push(val)
  }
  let best: unknown = ''
  for (const val of candidates) {
    const { doc } = normalizeVolumesDoc(parseLlmJson(val))
    if (countChapters(doc) > 0) return val
    if (!best) best = val
  }
  return best
}

export interface O1XOutput {
  outline_summary: string
  outline_json: string
}

/** O1X · 解析 O1 LLM 输出 */
export function runO1XNode(kwargs: Record<string, unknown>): O1XOutput {
  const raw = pickO1Raw(kwargs)
  let { summary, doc } = normalizeVolumesDoc(parseLlmJson(raw))

  if (countChapters(doc) === 0) {
    for (const key of ['structured_output', 'o1_result', 'text', 'o1_text']) {
      const val = kwargs[key]
      if (val == null || val === raw) continue
      if (typeof val === 'string' && ['null', 'none', ''].includes(val.trim().toLowerCase())) continue
      const alt = normalizeVolumesDoc(parseLlmJson(val))
      if (countChapters(alt.doc) > 0) {
        summary = alt.summary || summary
        doc = alt.doc
        break
      }
    }
  }

  return {
    outline_summary: summary,
    outline_json: JSON.stringify(doc)
  }
}
