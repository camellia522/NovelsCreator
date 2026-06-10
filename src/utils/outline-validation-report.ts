export interface OutlineValidationIssue {
  severity?: string
  location?: string
  message?: string
}

export interface OutlineValidationReport {
  outline_valid?: boolean
  outline_issues?: OutlineValidationIssue[]
  structure_score?: number
  beat_quality_score?: number
  lore_consistency_score?: number
  chapter_count_ok?: boolean
  volume_balance_ok?: boolean
}

export function parseOutlineValidationReport(raw: unknown): OutlineValidationReport | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      return parseOutlineValidationReport(JSON.parse(trimmed))
    } catch {
      return null
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as OutlineValidationReport
  }
  return null
}

export function formatOutlineValidationIssues(
  report: unknown,
  fallbackFormatted?: string
): string {
  const formatted = fallbackFormatted?.trim()
  if (formatted) return formatted

  const parsed = parseOutlineValidationReport(report)
  const issues = parsed?.outline_issues ?? []
  if (!issues.length) return ''

  return issues
    .slice(0, 12)
    .map((item) => {
      if (typeof item === 'string') return `- ${item}`
      const severity = item.severity ?? 'warn'
      const location = item.location ?? ''
      const message = item.message ?? ''
      return `- [${severity}] ${location}: ${message}`.replace(': :', ':')
    })
    .join('\n')
}
