import { asBool, parseLlmJson, stripThinkBlocks, toInt } from '../../utils/outline-llm-json'

export interface AggOutput {
  route: 'continue' | 'retry' | 'circuit_break'
  retry_count: number
  retry_issues_formatted: string
  outline_valid: boolean
  validation_report: string
  outline_json: string
}

function pickValidateResult(kwargs: Record<string, unknown>): unknown {
  for (const key of ['validate_result', 'validate_text', 'text', 'o2_result']) {
    const val = kwargs[key]
    if (val == null) continue
    if (typeof val === 'string' && ['null', 'none', ''].includes(val.trim().toLowerCase())) continue
    return val
  }
  return '{}'
}

function normalizeOutlineJson(raw: unknown): string {
  if (raw == null) return '{}'
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    if (Array.isArray(obj.volumes)) return JSON.stringify({ volumes: obj.volumes })
    const outline = obj.outline
    if (outline && typeof outline === 'object' && Array.isArray((outline as { volumes?: unknown[] }).volumes)) {
      return JSON.stringify(outline)
    }
  }
  const text = String(raw).trim()
  if (!text || ['null', 'none'].includes(text.toLowerCase())) return '{}'
  if (
    text.includes('outline_summary') ||
    text.toLowerCase().includes('redacted_think') ||
    text.toLowerCase().includes('<think')
  ) {
    const parsed = parseLlmJson(text)
    const outline = parsed.outline
    if (outline && typeof outline === 'object' && Array.isArray((outline as { volumes?: unknown[] }).volumes)) {
      return JSON.stringify(outline)
    }
    if (Array.isArray(parsed.volumes)) return JSON.stringify({ volumes: parsed.volumes })
  }
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.volumes)) {
      return JSON.stringify(parsed)
    }
  } catch {
    /* fall through */
  }
  return JSON.stringify({ volumes: [] })
}

function countChapters(outlineJson: string): number {
  try {
    const doc = JSON.parse(outlineJson) as { volumes?: { chapters?: unknown[] }[] }
    let n = 0
    for (const vol of doc.volumes ?? []) {
      if (vol?.chapters) n += vol.chapters.length
    }
    return n
  } catch {
    return 0
  }
}

function countTotalBeats(outlineJson: string): number {
  try {
    const doc = JSON.parse(outlineJson) as {
      volumes?: { chapters?: { beats?: unknown[] }[] }[]
    }
    let n = 0
    for (const vol of doc.volumes ?? []) {
      for (const ch of vol?.chapters ?? []) {
        if (ch?.beats) n += ch.beats.length
      }
    }
    return n
  } catch {
    return 0
  }
}

function structureOk(outlineJson: string): boolean {
  return countChapters(outlineJson) > 0 && countTotalBeats(outlineJson) >= 2
}

function o1xEmptyOutputs(retryCount: number, maxRetry: number, outlineJson: string): AggOutput {
  const issue =
    '- [hard] global: O1X outline_json 无有效章节/beats（volumes 为空或 beats=0）。' +
    '常见原因：① O1 只写了 outline_summary 未填 outline.volumes；' +
    '② O1X 未绑 O1.structured_output；' +
    '③ O2 的 outline_json 误绑 O1X.outline_summary 或 O1.text。' +
    '请检查 O1 Structured Output Schema 与 O1X/O2 绑定。'
  const newRetry = retryCount < maxRetry ? retryCount + 1 : retryCount
  const route = retryCount < maxRetry ? 'retry' : 'circuit_break'
  const report = {
    outline_valid: false,
    outline_issues: [
      {
        severity: 'hard',
        location: 'global',
        message: 'O1X 未返回有效章节结构，见 retry_issues_formatted'
      }
    ],
    structure_score: 0,
    beat_quality_score: 0,
    lore_consistency_score: 0,
    chapter_count_ok: false,
    volume_balance_ok: false
  }
  return {
    route,
    retry_count: newRetry,
    retry_issues_formatted: issue,
    outline_valid: false,
    validation_report: JSON.stringify(report),
    outline_json: outlineJson
  }
}

function emptyOutputs(retryCount: number, outlineJson: string): AggOutput {
  return {
    route: 'retry',
    retry_count: retryCount,
    retry_issues_formatted: '- [hard] global: O2 未返回有效校验 JSON（validate_result 为空）',
    outline_valid: false,
    validation_report: '{}',
    outline_json: outlineJson
  }
}

/** AGG · 校验聚合与路由 */
export function runAggNode(kwargs: Record<string, unknown>): AggOutput {
  try {
    const validateResult = pickValidateResult(kwargs)
    const rawOutline = kwargs.outline_json ?? kwargs.o1_result ?? '{}'
    const outlineJson = normalizeOutlineJson(rawOutline)
    const retryCount = toInt(kwargs.retry_count, 0)
    const maxRetry = toInt(kwargs.max_retry, 3)

    if (!structureOk(outlineJson)) {
      return o1xEmptyOutputs(retryCount, maxRetry, outlineJson)
    }

    const v = parseLlmJson(validateResult)
    if (!Object.keys(v).length) {
      const out = emptyOutputs(retryCount, outlineJson)
      if (retryCount >= maxRetry) {
        out.route = 'circuit_break'
      } else {
        out.retry_count = retryCount + 1
      }
      return out
    }

    const valid = asBool(v.outline_valid)
    const issues = Array.isArray(v.outline_issues) ? v.outline_issues : []

    let route: AggOutput['route']
    let newRetry: number
    if (valid) {
      route = 'continue'
      newRetry = retryCount
    } else if (retryCount < maxRetry) {
      route = 'retry'
      newRetry = retryCount + 1
    } else {
      route = 'circuit_break'
      newRetry = retryCount
    }

    const formatted: string[] = []
    for (const item of issues.slice(0, 12)) {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        formatted.push(
          `- [${o.severity ?? 'warn'}] ${o.location ?? ''}: ${o.message ?? ''}`
        )
      } else {
        formatted.push(`- ${String(item)}`)
      }
    }

    return {
      route,
      retry_count: newRetry,
      retry_issues_formatted: formatted.join('\n'),
      outline_valid: valid,
      validation_report: JSON.stringify(v),
      outline_json: outlineJson
    }
  } catch {
    return emptyOutputs(toInt(kwargs.retry_count, 0), '{}')
  }
}
