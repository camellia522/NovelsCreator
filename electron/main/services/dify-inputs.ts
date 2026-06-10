import type { ChapterGenerateInputs } from '../../src/types/api'

/** 与 dify/chapter/fixtures/run-request-success.json 对齐 */
const V11_KEYS = [
  'project_id',
  'chapter_id',
  'chapter_title',
  'outline_beats',
  'knowledge_snapshot',
  'plot_memory',
  'previous_chapter_summary',
  'video_platform_template',
  'max_retry',
  'generation_prompt',
  'generation_prompt_text',
  'retry_count',
  'retry_issues',
  'retry_issues_formatted',
  'estimated_duration_sec',
  'video_template_config'
] as const

/** Dify START 常见必填数字字段（任何 profile 都必须带上） */
const ALWAYS_REQUIRED = [
  'estimated_duration_sec',
  'retry_count',
  'max_retry'
] as const

export type DifyInputProfile = 'v1.1' | 'core'

function toInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : fallback
}

export function deriveRetryIssuesJson(retryIssues?: string, formatted?: string): string {
  if (retryIssues?.trim()) return retryIssues.trim()
  if (!formatted?.trim()) return '[]'
  const lines = formatted
    .split('\n')
    .map((l) => l.replace(/^[-*#\d.]+\s*/, '').trim())
    .filter(Boolean)
  return JSON.stringify(lines, null, 0)
}

function pick(
  inputs: ChapterGenerateInputs,
  keys: readonly string[]
): Record<string, string | number> {
  const full: Record<string, string | number> = {
    project_id: String(inputs.project_id),
    chapter_id: String(inputs.chapter_id),
    chapter_title: String(inputs.chapter_title),
    outline_beats: String(inputs.outline_beats),
    knowledge_snapshot: String(inputs.knowledge_snapshot),
    plot_memory: String(inputs.plot_memory),
    previous_chapter_summary: String(inputs.previous_chapter_summary ?? ''),
    video_platform_template: String(inputs.video_platform_template ?? 'generic-v1'),
    max_retry: toInt(inputs.max_retry, 3),
    generation_prompt: String(inputs.generation_prompt ?? ''),
    generation_prompt_text: String(inputs.generation_prompt_text ?? ''),
    retry_count: toInt(inputs.retry_count, 0),
    retry_issues: deriveRetryIssuesJson(inputs.retry_issues, inputs.retry_issues_formatted),
    retry_issues_formatted: String(inputs.retry_issues_formatted ?? ''),
    estimated_duration_sec: toInt(inputs.estimated_duration_sec, 180),
    video_template_config: String(inputs.video_template_config ?? '')
  }

  const out: Record<string, string | number> = {}
  for (const key of keys) {
    const value = full[key]
    if (key === 'video_template_config' && (value === '' || value == null)) {
      continue
    }
    out[key] = value
  }
  return out
}

function mergeAlwaysRequired(out: Record<string, string | number>, full: Record<string, string | number>): void {
  for (const key of ALWAYS_REQUIRED) {
    const value = full[key]
    if (value !== undefined && value !== null && !Number.isNaN(value as number)) {
      out[key] = value
    }
  }
}

export function buildDifyWorkflowInputs(
  inputs: ChapterGenerateInputs,
  _profile: DifyInputProfile = 'v1.1'
): Record<string, string | number> {
  const full = pick(inputs, V11_KEYS)
  mergeAlwaysRequired(full, full)
  return full
}

/** 数字字段在「全文本 START」重试时仍保持 number，避免 required / 类型错误 */
export function stringifyWorkflowInputsKeepNumbers(
  inputs: Record<string, string | number>
): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(inputs)) {
    if (k === 'max_retry') out[k] = toInt(v, 3)
    else if (k === 'retry_count') out[k] = toInt(v, 0)
    else if (k === 'estimated_duration_sec') out[k] = toInt(v, 180)
    else out[k] = String(v)
  }
  return out
}

/** 全部转为字符串（仅作最后手段，部分旧画布） */
export function stringifyWorkflowInputs(
  inputs: Record<string, string | number>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(inputs)) {
    out[k] = String(v)
  }
  return out
}
