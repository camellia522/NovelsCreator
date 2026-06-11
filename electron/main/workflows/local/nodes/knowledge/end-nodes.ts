import { parseLlmJson, toInt } from '../../utils/outline-llm-json'

function asJsonStr(raw: unknown, fallback = '{}'): string {
  if (raw == null) return fallback
  if (typeof raw === 'object') return JSON.stringify(raw)
  const text = String(raw).trim()
  return text || fallback
}

function asBoolStr(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') {
    return ['true', '1', 'yes'].includes(value.trim().toLowerCase()) ? 'true' : 'false'
  }
  return value ? 'true' : 'false'
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

export function runKnowledgeEndOkNode(kwargs: Record<string, unknown>): { end_outputs: string } {
  const knowledgeSummary = String(kwargs.knowledge_summary ?? '').trim()
  const knowledgeJson = String(kwargs.knowledge_json ?? '{}')
  const validationReport = kwargs.validation_report ?? '{}'
  const retryCount = toInt(kwargs.retry_count, 0)
  const doc = parseLlmJson(knowledgeJson)
  const endOutputs = {
    status: 'success',
    circuit_break: false,
    human_action_required: false,
    retry_count: retryCount,
    knowledge_summary: knowledgeSummary,
    knowledge_json: JSON.stringify(doc),
    validation_report: parseLlmJson(validationReport),
    workflow_version: 'novel-knowledge-generation-v1'
  }
  return { end_outputs: JSON.stringify(endOutputs) }
}

export function runKnowledgeRetryEndNode(kwargs: Record<string, unknown>): { end_outputs: string } {
  const endOutputs = {
    status: 'retry',
    circuit_break: false,
    human_action_required: false,
    retry_count: toInt(kwargs.retry_count, 0),
    knowledge_summary: String(kwargs.knowledge_summary ?? '').trim(),
    knowledge_json: asJsonStr(kwargs.knowledge_json, '{}'),
    retry_issues_formatted: String(kwargs.retry_issues_formatted ?? ''),
    validation_report: asJsonStr(kwargs.validation_report, '{}'),
    workflow_version: 'novel-knowledge-generation-v1'
  }
  return { end_outputs: JSON.stringify(endOutputs) }
}

export function runKnowledgeCircuitBreakNode(kwargs: Record<string, unknown>): { end_outputs: string } {
  const endOutputs = {
    status: 'circuit_break',
    circuit_break: true,
    human_action_required: true,
    retry_count: toInt(kwargs.retry_count, 0),
    knowledge_summary: String(kwargs.knowledge_summary ?? '').trim(),
    knowledge_json: asJsonStr(kwargs.knowledge_json, '{}'),
    validation_report: asJsonStr(kwargs.validation_report, '{}'),
    workflow_version: 'novel-knowledge-generation-v1'
  }
  return { end_outputs: JSON.stringify(endOutputs) }
}

export function runKnowledgeParseEndOutputs(kwargs: Record<string, unknown>): Record<string, unknown> {
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
  let knowledgeJson = o.knowledge_json ?? '{}'
  if (typeof knowledgeJson === 'object') knowledgeJson = JSON.stringify(knowledgeJson)

  return {
    status: String(o.status ?? ''),
    circuit_break: asBoolStr(o.circuit_break ?? false),
    human_action_required: asBoolStr(o.human_action_required ?? false),
    retry_count: toInt(o.retry_count, 0),
    knowledge_summary: String(o.knowledge_summary ?? ''),
    knowledge_json: String(knowledgeJson),
    validation_report: JSON.stringify(report),
    retry_issues_formatted: String(o.retry_issues_formatted ?? ''),
    workflow_version: String(o.workflow_version ?? '')
  }
}
