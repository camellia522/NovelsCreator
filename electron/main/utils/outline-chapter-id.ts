import type { OutlineChapter, OutlineDocument } from '@/types/project'

/** 新建项目 scaffold 中的占位 beats */
const PLACEHOLDER_BEAT_TEXTS = new Set([
  '开篇建立场景与主角状态',
  '引入本章核心冲突'
])

/** 判断是否为未 AI 填充的占位章（含空 beats / 默认模板） */
export function isPlaceholderChapter(ch: OutlineChapter): boolean {
  const beats = ch.beats ?? []
  if (beats.length === 0) return true
  if (
    beats.length <= 2 &&
    beats.every((b) => PLACEHOLDER_BEAT_TEXTS.has(String(b.text ?? '').trim()))
  ) {
    return true
  }
  return false
}

/** 从 ch-001 解析数字部分，取全局最大序号 */
export function maxChapterNumericId(doc: OutlineDocument): number {
  let max = 0
  for (const vol of doc.volumes ?? []) {
    for (const ch of vol.chapters ?? []) {
      const m = /^ch-(\d{3})$/.exec(ch.id)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
  }
  return max
}

export function nextChapterId(doc: OutlineDocument): string {
  return `ch-${String(maxChapterNumericId(doc) + 1).padStart(3, '0')}`
}

/**
 * 串行生成时下一章 id：目标卷内若有占位章则先填充该章，否则新建全局下一章。
 */
export function resolveOutlineGenerationChapterId(
  doc: OutlineDocument,
  volumeId: string
): string {
  const vol = doc.volumes?.find((v) => v.id === volumeId)
  for (const ch of vol?.chapters ?? []) {
    if (isPlaceholderChapter(ch)) return ch.id
  }
  return nextChapterId(doc)
}
