import type { OutlineChapter, OutlineDocument } from '@/types/project'
import { normalizeOutlineFromWorkflow } from './outline-output-parse'

function normalizeChapter(raw: OutlineChapter): OutlineChapter {
  return {
    id: raw.id,
    title: raw.title?.trim() || raw.id,
    status: raw.status ?? 'draft',
    beats: (raw.beats ?? []).map((b, i) => ({
      order: Number(b.order ?? i + 1),
      text: String(b.text ?? '').trim()
    }))
  }
}

/** 统计 outline_json 中章节总数 */
export function countChaptersInOutlineJson(outlineJson: string): number {
  const doc = normalizeOutlineFromWorkflow(outlineJson)
  if (!doc?.volumes?.length) return 0
  let n = 0
  for (const vol of doc.volumes) {
    n += vol.chapters?.length ?? 0
  }
  return n
}

/** 从工作流 outline_json 提取单章（单章模式应只有一章） */
export function extractGeneratedChapter(
  outlineJson: string,
  expectedChapterId?: string
): OutlineChapter | null {
  const doc = normalizeOutlineFromWorkflow(outlineJson)
  if (!doc?.volumes?.length) return null

  const chapters: OutlineChapter[] = []
  for (const vol of doc.volumes) {
    for (const ch of vol.chapters ?? []) {
      chapters.push(normalizeChapter(ch))
    }
  }
  if (!chapters.length) return null

  if (expectedChapterId) {
    const exact = chapters.find((c) => c.id === expectedChapterId)
    if (exact) return exact
  }
  return chapters[0]
}

export function appendChapterToVolume(
  doc: OutlineDocument,
  volumeId: string,
  chapter: OutlineChapter,
  volumeTitle?: string
): OutlineDocument {
  const volumes = [...(doc.volumes ?? [])]
  let vol = volumes.find((v) => v.id === volumeId)
  if (!vol) {
    vol = { id: volumeId, title: volumeTitle?.trim() || volumeId, chapters: [] }
    volumes.push(vol)
  } else if (volumeTitle?.trim()) {
    vol = { ...vol, title: volumeTitle.trim() }
    const idx = volumes.findIndex((v) => v.id === volumeId)
    volumes[idx] = vol
  }

  const chapters = [...(vol.chapters ?? [])]
  if (chapters.some((c) => c.id === chapter.id)) {
    const idx = chapters.findIndex((c) => c.id === chapter.id)
    chapters[idx] = chapter
  } else {
    chapters.push(chapter)
  }

  const volIdx = volumes.findIndex((v) => v.id === volumeId)
  volumes[volIdx] = { ...vol, chapters }

  return { volumes }
}
