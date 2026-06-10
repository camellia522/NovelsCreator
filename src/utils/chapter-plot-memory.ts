import type {
  ChapterSummaryEntry,
  OutlineDocument,
  PlotMemoryDocument
} from '@/types/project'

function chapterNumericId(chapterId: string): number | null {
  const m = /^ch-(\d{3})$/.exec(chapterId.trim())
  if (!m) return null
  return parseInt(m[1], 10)
}

/** 按 outline 顺序取上一章 id */
export function findPreviousChapterId(
  outline: OutlineDocument,
  chapterId: string
): string | null {
  const ids: string[] = []
  for (const vol of outline.volumes ?? []) {
    for (const ch of vol.chapters ?? []) {
      if (ch.id?.trim()) ids.push(ch.id.trim())
    }
  }
  const idx = ids.indexOf(chapterId)
  if (idx <= 0) return null
  return ids[idx - 1]
}

export function findChapterInOutline(
  outline: OutlineDocument,
  chapterId: string
): { title: string; beats: { text: string }[] } | null {
  for (const vol of outline.volumes ?? []) {
    for (const ch of vol.chapters ?? []) {
      if (ch.id === chapterId) {
        return { title: ch.title, beats: ch.beats ?? [] }
      }
    }
  }
  return null
}

/** 格式化为 N1 可读的上一章摘要块 */
export function formatChapterSummaryForDify(entry: ChapterSummaryEntry): string {
  const parts: string[] = []
  const head = entry.title?.trim()
    ? `【${entry.chapterId}·${entry.title}】`
    : `【${entry.chapterId}】`
  parts.push(head)
  if (entry.summary?.trim()) parts.push(entry.summary.trim())
  if (entry.keyEvents?.length) {
    parts.push(`关键事件：${entry.keyEvents.join('；')}`)
  }
  if (entry.openThreads?.length) {
    parts.push(`未解线头：${entry.openThreads.join('；')}`)
  }
  return parts.join('\n')
}

export function getPreviousChapterSummaryText(
  memory: PlotMemoryDocument,
  outline: OutlineDocument,
  chapterId: string
): string {
  const prevId = findPreviousChapterId(outline, chapterId)
  if (!prevId) return ''
  const entry = memory.chapterSummaries.find((s) => s.chapterId === prevId)
  if (!entry?.summary?.trim()) return ''
  return formatChapterSummaryForDify(entry)
}

/** 未解伏笔提示，注入 brief 供 N1/N5 回收 */
export function buildOpenForeshadowingHint(memory: PlotMemoryDocument): string {
  const open = (memory.foreshadowing ?? []).filter((f) => !f.resolved && f.description?.trim())
  if (!open.length) return ''
  const lines = open.map((f) => `- ${f.id}: ${f.description.trim()}`)
  return `【待回收伏笔 · 本章须呼应或推进至少一条】\n${lines.join('\n')}`
}

export function isFirstOutlineChapter(chapterId: string): boolean {
  return chapterNumericId(chapterId) === 1
}
