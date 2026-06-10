import type { ChapterSummaryEntry } from '@/types/project'

const CHAPTER_BLOCK_RE = /^【(ch-\d{3})(?:\s|】)/

/** 由章摘要列表生成概览用 globalSummary 节选 */
export function buildGlobalSummaryFromChapterSummaries(
  summaries: ChapterSummaryEntry[]
): string {
  return [...summaries]
    .sort((a, b) => a.chapterId.localeCompare(b.chapterId))
    .map((s) => {
      const title = s.title?.trim() || s.chapterId
      const body = (s.summary ?? '').slice(0, 120)
      return `【${s.chapterId} ${title}】${body}${(s.summary?.length ?? 0) > 120 ? '…' : ''}`
    })
    .join('\n')
}

/** 移除 globalSummary 中已不存在章节的 【ch-xxx …】 行，保留其余追加段落 */
export function pruneGlobalSummaryChapterBlocks(
  globalSummary: string,
  validChapterIds: Iterable<string>
): string {
  const ids = new Set(validChapterIds)
  return globalSummary
    .split('\n')
    .filter((line) => {
      const m = CHAPTER_BLOCK_RE.exec(line.trim())
      if (!m) return true
      return ids.has(m[1])
    })
    .join('\n')
    .trim()
}
