import { parseMemoryPatchFromRaw } from '../../../../utils/memory-patch-parse'
import { toInt } from '../../utils/outline-llm-json'

const WORKFLOW_VERSION = 'novel-chapter-generation-v1.1'

function pickRaw(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (c == null) continue
    if (typeof c === 'object') return JSON.stringify(c)
    const text = String(c).trim()
    if (text && !['None', 'null'].includes(text)) return text
  }
  return ''
}

function normalizeMemoryPatch(raw: unknown): Record<string, unknown> {
  return (parseMemoryPatchFromRaw(raw) ?? {}) as Record<string, unknown>
}

export function runChapterEndOkNode(kwargs: Record<string, unknown>): { end_outputs: string } {
  const patch = normalizeMemoryPatch(kwargs.memory_patch)
  const endOutputs = {
    status: 'success',
    circuit_break: false,
    human_action_required: false,
    retry_count: toInt(kwargs.retry_count, 0),
    novel_body: String(kwargs.novel_body ?? ''),
    video_script: String(kwargs.video_script ?? ''),
    memory_patch: patch,
    validation_report: {
      outline_valid: kwargs.outline_valid !== false,
      lore_valid: kwargs.lore_valid !== false,
      issues: []
    },
    workflow_version: WORKFLOW_VERSION
  }
  return { end_outputs: JSON.stringify(endOutputs) }
}

export function runChapterRetryEndNode(kwargs: Record<string, unknown>): { end_outputs: string } {
  let issues: unknown[] = []
  try {
    issues = JSON.parse(String(kwargs.retry_issues ?? '[]'))
    if (!Array.isArray(issues)) issues = []
  } catch {
    issues = []
  }
  const endOutputs = {
    status: 'retry',
    circuit_break: false,
    human_action_required: false,
    retry_count: toInt(kwargs.retry_count, 0),
    draft_text: String(kwargs.draft_text ?? ''),
    retry_issues_formatted: String(kwargs.retry_issues_formatted ?? ''),
    validation_report: {
      outline_valid: kwargs.outline_valid !== false,
      lore_valid: kwargs.lore_valid !== false,
      issues
    },
    workflow_version: WORKFLOW_VERSION
  }
  return { end_outputs: JSON.stringify(endOutputs) }
}

export function runChapterCircuitBreakNode(kwargs: Record<string, unknown>): { end_outputs: string } {
  let issues: unknown[] = []
  try {
    issues = JSON.parse(String(kwargs.retry_issues ?? '[]'))
    if (!Array.isArray(issues)) issues = []
  } catch {
    issues = []
  }
  const endOutputs = {
    status: 'circuit_break',
    circuit_break: true,
    human_action_required: true,
    retry_count: toInt(kwargs.retry_count, 0),
    draft_text: String(kwargs.draft_text ?? ''),
    validation_report: {
      outline_valid: kwargs.outline_valid !== false,
      lore_valid: kwargs.lore_valid !== false,
      issues
    },
    workflow_version: WORKFLOW_VERSION
  }
  return { end_outputs: JSON.stringify(endOutputs) }
}

export function runChapterParseEndOutputs(kwargs: Record<string, unknown>): Record<string, unknown> {
  const raw = pickRaw(
    kwargs.re_end_outputs,
    kwargs.cb_end_outputs,
    kwargs.ok_end_outputs,
    kwargs.end_outputs
  )
  const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}

  const memoryPatch = normalizeMemoryPatch(o.memory_patch)
  let validationReport = o.validation_report ?? {}
  if (typeof validationReport === 'string') {
    try {
      validationReport = JSON.parse(validationReport)
    } catch {
      validationReport = {}
    }
  }

  return {
    status: String(o.status ?? ''),
    circuit_break: Boolean(o.circuit_break),
    human_action_required: Boolean(o.human_action_required),
    retry_count: toInt(o.retry_count, 0),
    novel_body: String(o.novel_body ?? ''),
    video_script: String(o.video_script ?? ''),
    draft_text: String(o.draft_text ?? ''),
    retry_issues_formatted: String(o.retry_issues_formatted ?? ''),
    memory_patch: JSON.stringify(memoryPatch),
    validation_report: JSON.stringify(validationReport),
    workflow_version: String(o.workflow_version ?? WORKFLOW_VERSION)
  }
}
