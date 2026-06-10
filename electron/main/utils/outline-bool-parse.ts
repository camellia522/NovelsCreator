/** 解析 Dify/PARSE 返回的布尔字段（可能是 bool 或 "true"/"false" 字符串） */
export function parseBoolish(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return ['true', '1', 'yes'].includes(value.trim().toLowerCase())
  }
  if (typeof value === 'number') return value !== 0
  return Boolean(value)
}

export function isOutlineValidationPassed(report: unknown): boolean {
  if (report == null) return true
  let parsed: Record<string, unknown>
  if (typeof report === 'string') {
    if (!report.trim()) return true
    try {
      parsed = JSON.parse(report) as Record<string, unknown>
    } catch {
      return true
    }
  } else if (typeof report === 'object') {
    parsed = report as Record<string, unknown>
  } else {
    return true
  }
  if (!('outline_valid' in parsed)) return true
  return parseBoolish(parsed.outline_valid)
}
