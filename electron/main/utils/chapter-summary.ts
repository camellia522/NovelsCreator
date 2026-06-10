/** 判断章摘要是否有效（非空、非 LLM 占位符） */
export function isSummaryUsable(text: string | undefined | null): boolean {
  const s = text?.trim() ?? ''
  if (!s) return false
  if (s.length < 12) {
    if (/^[.…·\-—_~～\s]+$/.test(s)) return false
    if (/^(无|暂无|待补充|略|null|n\/a)$/i.test(s)) return false
  }
  if (/^(\.{2,}|…+|——+|--+|~~+)$/.test(s)) return false
  if (/^(本章|本章讲述|本章主要|summary|chapter summary)/i.test(s) && s.length < 24) return false
  return true
}

export function chapterSummaryNeedsBackfill(text: string | undefined | null): boolean {
  return !isSummaryUsable(text)
}
