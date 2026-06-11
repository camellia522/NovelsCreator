import { parseLlmJson, stripThinkBlocks, toInt } from '../../utils/outline-llm-json'

function parseJson(raw: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (raw == null) return fallback
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  const text = stripThinkBlocks(String(raw).trim())
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function normalizeOutlineDoc(raw: unknown): { summary: string; doc: { volumes: unknown[] } } {
  const parsed = parseJson(raw, {})
  const summary = String(parsed.outline_summary ?? '').trim()
  const outline = parsed.outline
  if (outline && typeof outline === 'object' && Array.isArray((outline as { volumes?: unknown[] }).volumes)) {
    return { summary, doc: outline as { volumes: unknown[] } }
  }
  if (Array.isArray(parsed.volumes)) {
    return { summary, doc: { volumes: parsed.volumes } }
  }
  return { summary, doc: { volumes: [] } }
}

function asJsonStr(raw: unknown, fallback = '{}'): string {
  if (raw == null) return fallback
  if (typeof raw === 'object') return JSON.stringify(raw)
  const text = String(raw).trim()
  return text || fallback
}

function compactVolumesJson(raw: unknown): string {
  const parsed = parseJson(raw, {})
  const outline = parsed.outline
  if (outline && typeof outline === 'object' && Array.isArray((outline as { volumes?: unknown[] }).volumes)) {
    return JSON.stringify(outline)
  }
  if (Array.isArray(parsed.volumes)) return JSON.stringify({ volumes: parsed.volumes })
  return JSON.stringify({ volumes: [] })
}

function extractSummary(outlineJson: unknown, outlineSummary: string): string {
  if (outlineSummary.trim()) return outlineSummary.trim()
  const parsed = parseJson(outlineJson, {})
  return String(parsed.outline_summary ?? '').trim()
}

export function runEndOkNode(kwargs: Record<string, unknown>): { end_outputs: string } {
  let outlineSummary = String(kwargs.outline_summary ?? '').trim()
  const outlineJson = kwargs.outline_json ?? '{}'
  const validationReport = kwargs.validation_report ?? '{}'
  const retryCount = toInt(kwargs.retry_count, 0)

  const extracted = normalizeOutlineDoc(outlineJson)
  if (!outlineSummary) outlineSummary = extracted.summary

  const report = parseJson(validationReport, {})
  const endOutputs = {
    status: 'success',
    circuit_break: false,
    human_action_required: false,
    retry_count: retryCount,
    outline_summary: outlineSummary,
    outline_json: JSON.stringify(extracted.doc),
    validation_report: report,
    workflow_version: 'novel-outline-generation-v1'
  }
  return { end_outputs: JSON.stringify(endOutputs) }
}

export function runRetryEndNode(kwargs: Record<string, unknown>): { end_outputs: string } {
  const outlineJson = compactVolumesJson(kwargs.outline_json ?? '{}')
  const outlineSummary = extractSummary(outlineJson, String(kwargs.outline_summary ?? ''))
  const retryCount = toInt(kwargs.retry_count, 0)
  const endOutputs = {
    status: 'retry',
    circuit_break: false,
    human_action_required: false,
    retry_count: retryCount,
    outline_summary: outlineSummary,
    outline_json: outlineJson,
    retry_issues_formatted: String(kwargs.retry_issues_formatted ?? ''),
    validation_report: asJsonStr(kwargs.validation_report, '{}'),
    workflow_version: 'novel-outline-generation-v1'
  }
  return { end_outputs: JSON.stringify(endOutputs) }
}

export function runCircuitBreakNode(kwargs: Record<string, unknown>): { end_outputs: string } {
  const outlineJson = compactVolumesJson(kwargs.outline_json ?? '{}')
  const outlineSummary = extractSummary(outlineJson, String(kwargs.outline_summary ?? ''))
  const retryCount = toInt(kwargs.retry_count, 0)
  const endOutputs = {
    status: 'circuit_break',
    circuit_break: true,
    human_action_required: true,
    retry_count: retryCount,
    outline_summary: outlineSummary,
    outline_json: outlineJson,
    validation_report: asJsonStr(kwargs.validation_report, '{}'),
    workflow_version: 'novel-outline-generation-v1'
  }
  return { end_outputs: JSON.stringify(endOutputs) }
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

function asBoolStr(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') {
    return ['true', '1', 'yes'].includes(value.trim().toLowerCase()) ? 'true' : 'false'
  }
  return value ? 'true' : 'false'
}

/** PARSE · 扁平化 end_outputs */
export function runParseEndOutputs(kwargs: Record<string, unknown>): Record<string, unknown> {
  const raw = pickRaw(
    kwargs.re_end_outputs,
    kwargs.cb_end_outputs,
    kwargs.ok_end_outputs,
    kwargs.end_outputs
  )
  const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  let report = o.validation_report ?? {}
  if (typeof report === 'string') {
    try {
      report = JSON.parse(report)
    } catch {
      report = {}
    }
  }
  let outlineJson = o.outline_json ?? '{}'
  if (typeof outlineJson === 'object') outlineJson = JSON.stringify(outlineJson)

  return {
    status: String(o.status ?? ''),
    circuit_break: asBoolStr(o.circuit_break ?? false),
    human_action_required: asBoolStr(o.human_action_required ?? false),
    retry_count: toInt(o.retry_count, 0),
    outline_summary: String(o.outline_summary ?? ''),
    outline_json: String(outlineJson),
    validation_report: JSON.stringify(report),
    retry_issues_formatted: String(o.retry_issues_formatted ?? ''),
    workflow_version: String(o.workflow_version ?? '')
  }
}
