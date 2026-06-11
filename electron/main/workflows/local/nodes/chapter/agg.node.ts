import { asBool, parseLlmJson, toInt } from '../../utils/outline-llm-json'

export interface ChapterAggOutput {
  route: 'continue' | 'retry' | 'circuit_break'
  retry_count: number
  retry_issues: string
  retry_issues_formatted: string
  merged_issues_for_polish: string
  outline_valid: boolean
  lore_valid: boolean
}

/** AGG · Validation Aggregate + Retry Router */
export function runChapterAggNode(kwargs: Record<string, unknown>): ChapterAggOutput {
  const o = parseLlmJson(String(kwargs.outline_result ?? kwargs.outline_text ?? ''))
  const l = parseLlmJson(String(kwargs.lore_result ?? kwargs.lore_text ?? ''))

  const outlineValid = asBool(o.outline_valid)
  const loreValid = asBool(l.lore_valid)

  const outlineIssues = Array.isArray(o.outline_issues) ? o.outline_issues : []
  const loreIssues = Array.isArray(l.lore_issues) ? l.lore_issues : []
  const mergedIssues = [...outlineIssues, ...loreIssues]

  const retryIssuesJson = JSON.stringify(mergedIssues)
  const mergedIssuesForPolish =
    mergedIssues.length > 0
      ? mergedIssues.map((x) => `- ${String(x)}`).join('\n')
      : '（无）'

  const retryCount = toInt(kwargs.retry_count, 0)
  const maxRetry = toInt(kwargs.max_retry, 3)

  let route: ChapterAggOutput['route']
  let newRetryCount: number
  if (outlineValid && loreValid) {
    route = 'continue'
    newRetryCount = retryCount
  } else if (retryCount < maxRetry) {
    route = 'retry'
    newRetryCount = retryCount + 1
  } else {
    route = 'circuit_break'
    newRetryCount = retryCount
  }

  return {
    route,
    retry_count: newRetryCount,
    retry_issues: retryIssuesJson,
    retry_issues_formatted: mergedIssuesForPolish,
    merged_issues_for_polish: mergedIssuesForPolish,
    outline_valid: outlineValid,
    lore_valid: loreValid
  }
}
