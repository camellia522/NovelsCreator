import type { MemoryPatch } from '../../src/types/api'
import type {
  ChapterSummaryEntry,
  ForeshadowingEntry,
  OutlineDocument,
  PlotMemoryDocument
} from '../../src/types/project'
import { readChapterText, readOutline, readPlotMemory, saveChapterText, savePlotMemory } from './project-files.service'
import { syncPlotMemoryFromOutlineBeats } from '../utils/outline-plot-memory'
import { extractKeyEventsFromNovel, extractSummaryFromNovel, stripThinkBlocks } from '../utils/novel-text'
import { parseMemoryPatchFromRaw, coercePatchText } from '../utils/memory-patch-parse'
import { chapterSummaryNeedsBackfill, isSummaryUsable } from '../utils/chapter-summary'

export interface MemoryMergeResult {
  merged: boolean
  chapterId: string
  globalDeltaAdded: boolean
  chapterSummaryUpdated: boolean
  foreshadowingChanged: number
}

function isPatchEmpty(patch: MemoryPatch): boolean {
  const cs = patch.chapterSummary
  const csObj = cs && typeof cs === 'object' ? (cs as Record<string, unknown>) : null
  const hasDelta = Boolean(coercePatchText(patch.globalSummaryDelta))
  const hasSummary = Boolean(
    csObj &&
      (coercePatchText(csObj.summary ?? csObj.summaryText ?? csObj.content ?? csObj.text) ||
        (Array.isArray(csObj.keyEvents) && csObj.keyEvents.length) ||
        (Array.isArray(csObj.key_events) && csObj.key_events.length) ||
        (Array.isArray(csObj.openThreads) && csObj.openThreads.length) ||
        coercePatchText(csObj.title ?? csObj.chapterTitle))
  )
  const hasFs =
    Array.isArray(patch.foreshadowingUpdates) && patch.foreshadowingUpdates.length > 0
  return !hasDelta && !hasSummary && !hasFs
}

function parsePatch(raw: MemoryPatch | string | undefined): MemoryPatch | null {
  const patch = parseMemoryPatchFromRaw(raw)
  if (!patch || isPatchEmpty(patch)) return null
  return patch
}

function mergeChapterSummaryEntry(
  prev: ChapterSummaryEntry | undefined,
  incoming: ChapterSummaryEntry
): ChapterSummaryEntry {
  if (!prev) return incoming
  return {
    ...prev,
    ...incoming,
    title: incoming.title.trim() || prev.title,
    summary: incoming.summary.trim() || prev.summary,
    keyEvents: incoming.keyEvents.length ? incoming.keyEvents : prev.keyEvents,
    characterStates: incoming.characterStates.length
      ? incoming.characterStates
      : prev.characterStates,
    openThreads: incoming.openThreads.length ? incoming.openThreads : prev.openThreads,
    updatedAt: incoming.updatedAt ?? prev.updatedAt
  }
}

function normalizeChapterSummary(
  raw: Record<string, unknown>,
  fallbackChapterId: string,
  fallbackTitle?: string
): ChapterSummaryEntry {
  const keyEventsRaw = raw.keyEvents ?? raw.key_events
  return {
    chapterId: String(raw.chapterId ?? raw.chapter_id ?? fallbackChapterId),
    title:
      coercePatchText(raw.title ?? raw.chapterTitle ?? raw.chapter_title) ||
      fallbackTitle ||
      '',
    summary: (() => {
      const s = coercePatchText(raw.summary ?? raw.summaryText ?? raw.content ?? raw.text)
      return isSummaryUsable(s) ? s : ''
    })(),
    keyEvents: Array.isArray(keyEventsRaw) ? keyEventsRaw.map(String) : [],
    characterStates: Array.isArray(raw.characterStates)
      ? raw.characterStates.map((s) => {
          const o = s as Record<string, unknown>
          return {
            characterId: String(o.characterId ?? o.character_id ?? 'unknown'),
            name: String(o.name ?? ''),
            state: String(o.state ?? '')
          }
        })
      : [],
    openThreads: Array.isArray(raw.openThreads)
      ? raw.openThreads.map(String)
      : Array.isArray(raw.open_threads)
        ? raw.open_threads.map(String)
        : [],
    updatedAt: new Date().toISOString()
  }
}

function normalizeForeshadowing(raw: unknown, chapterId: string): ForeshadowingEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = String(o.id ?? '').trim()
  if (!id) return null
  return {
    id,
    description: String(o.description ?? ''),
    resolved: Boolean(o.resolved),
    plantedIn: o.plantedIn != null ? String(o.plantedIn) : chapterId
  }
}

function mergeForeshadowing(
  list: ForeshadowingEntry[],
  updates: unknown[],
  chapterId: string
): { next: ForeshadowingEntry[]; changed: number } {
  const next = [...list]
  let changed = 0
  for (const upd of updates) {
    const entry = normalizeForeshadowing(upd, chapterId)
    if (!entry) continue
    const idx = next.findIndex((f) => f.id === entry.id)
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...entry }
    } else {
      next.push(entry)
    }
    changed += 1
  }
  return { next, changed }
}

export async function applyMemoryPatch(
  chapterId: string,
  rawPatch: MemoryPatch | string | undefined,
  options?: { chapterTitle?: string }
): Promise<MemoryMergeResult> {
  const empty: MemoryMergeResult = {
    merged: false,
    chapterId,
    globalDeltaAdded: false,
    chapterSummaryUpdated: false,
    foreshadowingChanged: 0
  }

  const patch = parsePatch(rawPatch)
  if (!patch) return empty

  const doc = await readPlotMemory()
  let globalDeltaAdded = false
  let chapterSummaryUpdated = false
  let foreshadowingChanged = 0

  const delta = coercePatchText(patch.globalSummaryDelta)
  if (delta) {
    doc.globalSummary = doc.globalSummary?.trim()
      ? `${doc.globalSummary.trim()}\n${delta}`
      : delta
    globalDeltaAdded = true
  }

  if (patch.chapterSummary && typeof patch.chapterSummary === 'object') {
    const incoming = normalizeChapterSummary(
      patch.chapterSummary as Record<string, unknown>,
      chapterId,
      options?.chapterTitle
    )
    if (
      incoming.summary.trim() ||
      incoming.keyEvents.length ||
      incoming.openThreads.length ||
      incoming.title.trim()
    ) {
      const summaries = Array.isArray(doc.chapterSummaries) ? [...doc.chapterSummaries] : []
      const idx = summaries.findIndex((s) => s.chapterId === incoming.chapterId)
      const prev = idx >= 0 ? summaries[idx] : undefined
      const entry = mergeChapterSummaryEntry(prev, incoming)
      if (idx >= 0) summaries[idx] = entry
      else summaries.push(entry)
      doc.chapterSummaries = summaries
      if (entry.summary.trim()) {
        chapterSummaryUpdated = isSummaryUsable(entry.summary)
      }

      if (
        entry.openThreads.length &&
        (!Array.isArray(patch.foreshadowingUpdates) || patch.foreshadowingUpdates.length === 0)
      ) {
        const foreshadowing = Array.isArray(doc.foreshadowing) ? doc.foreshadowing : []
        const fromThreads = entry.openThreads.map((desc, i) => ({
          id: `fs-${chapterId}-${String(i + 1).padStart(2, '0')}`,
          description: desc,
          resolved: false,
          plantedIn: chapterId
        }))
        const mergedFs = mergeForeshadowing(foreshadowing, fromThreads, chapterId)
        doc.foreshadowing = mergedFs.next
        foreshadowingChanged += mergedFs.changed
      }
    }
  }

  if (Array.isArray(patch.foreshadowingUpdates) && patch.foreshadowingUpdates.length > 0) {
    const foreshadowing = Array.isArray(doc.foreshadowing) ? doc.foreshadowing : []
    const mergedFs = mergeForeshadowing(foreshadowing, patch.foreshadowingUpdates, chapterId)
    doc.foreshadowing = mergedFs.next
    foreshadowingChanged = mergedFs.changed
  }

  let merged =
    globalDeltaAdded || chapterSummaryUpdated || foreshadowingChanged > 0

  if (merged) {
    await savePlotMemory(doc)
  }

  return {
    merged,
    chapterId,
    globalDeltaAdded,
    chapterSummaryUpdated,
    foreshadowingChanged
  }
}

function chapterNeedsSummary(doc: PlotMemoryDocument, chapterId: string): boolean {
  const entry = doc.chapterSummaries.find((s) => s.chapterId === chapterId)
  return chapterSummaryNeedsBackfill(entry?.summary)
}

/** Dify 未返回摘要或摘要为空时，从正文提取并写入记忆库 */
export async function backfillChapterSummaryFromNovel(
  chapterId: string,
  chapterTitle: string,
  novelBody: string
): Promise<MemoryMergeResult> {
  const empty: MemoryMergeResult = {
    merged: false,
    chapterId,
    globalDeltaAdded: false,
    chapterSummaryUpdated: false,
    foreshadowingChanged: 0
  }

  const cleaned = stripThinkBlocks(novelBody)
  const summaryText = extractSummaryFromNovel(cleaned)
  if (!summaryText) return empty

  const doc = await readPlotMemory()
  if (!chapterNeedsSummary(doc, chapterId)) return empty

  const summaries = [...doc.chapterSummaries]
  const idx = summaries.findIndex((s) => s.chapterId === chapterId)
  const prev = idx >= 0 ? summaries[idx] : null

  const entry: ChapterSummaryEntry = mergeChapterSummaryEntry(prev ?? undefined, {
    chapterId,
    title: chapterTitle || prev?.title || chapterId,
    summary: summaryText,
    keyEvents:
      prev?.keyEvents?.length ? prev.keyEvents : extractKeyEventsFromNovel(cleaned),
    characterStates: prev?.characterStates ?? [],
    openThreads: prev?.openThreads ?? [],
    updatedAt: new Date().toISOString()
  })

  let globalDeltaAdded = false
  if (!doc.globalSummary?.trim()) {
    const delta = `【${chapterId}】${summaryText.slice(0, 120)}${summaryText.length > 120 ? '…' : ''}`
    doc.globalSummary = delta
    globalDeltaAdded = true
  }

  if (idx >= 0) summaries[idx] = entry
  else summaries.push(entry)
  doc.chapterSummaries = summaries

  await savePlotMemory(doc)

  return {
    merged: true,
    chapterId,
    globalDeltaAdded,
    chapterSummaryUpdated: true,
    foreshadowingChanged: 0
  }
}

export function mergeMemoryResults(a: MemoryMergeResult, b: MemoryMergeResult): MemoryMergeResult {
  return {
    merged: a.merged || b.merged,
    chapterId: b.chapterId || a.chapterId,
    globalDeltaAdded: a.globalDeltaAdded || b.globalDeltaAdded,
    chapterSummaryUpdated: a.chapterSummaryUpdated || b.chapterSummaryUpdated,
    foreshadowingChanged: a.foreshadowingChanged + b.foreshadowingChanged
  }
}

/** 扫描已有正文但缺摘要的章节并补全 */
export async function backfillMissingSummaries(): Promise<number> {
  const outline = await readOutline()
  let count = 0

  for (const vol of outline.volumes ?? []) {
    for (const ch of vol.chapters ?? []) {
      const doc = await readPlotMemory()
      if (!chapterNeedsSummary(doc, ch.id)) continue

      let novel = ''
      try {
        novel = await readChapterText(ch.id, 'novel')
      } catch {
        continue
      }
      const cleaned = stripThinkBlocks(novel)
      if (!cleaned) continue

      if (cleaned !== novel) {
        await saveChapterText(ch.id, 'novel', cleaned)
      }

      const result = await backfillChapterSummaryFromNovel(ch.id, ch.title, cleaned)
      if (result.merged) count += 1
    }
  }

  return count
}

export async function backfillChapterSummaryById(chapterId: string): Promise<MemoryMergeResult> {
  const outline = await readOutline()
  let title = chapterId
  for (const vol of outline.volumes ?? []) {
    for (const ch of vol.chapters ?? []) {
      if (ch.id === chapterId) title = ch.title
    }
  }
  const novel = await readChapterText(chapterId, 'novel')
  const cleaned = stripThinkBlocks(novel)
  if (!cleaned) {
    return {
      merged: false,
      chapterId,
      globalDeltaAdded: false,
      chapterSummaryUpdated: false,
      foreshadowingChanged: 0
    }
  }
  return backfillChapterSummaryFromNovel(chapterId, title, cleaned)
}

export async function ensureMemoryAfterGeneration(
  chapterId: string,
  chapterTitle: string,
  novelBody: string,
  rawPatch: MemoryPatch | string | undefined
): Promise<MemoryMergeResult> {
  let result = await applyMemoryPatch(chapterId, rawPatch, { chapterTitle })
  const cleaned = stripThinkBlocks(novelBody)

  const tryBackfill = async (body: string): Promise<void> => {
    if (!body.trim()) return
    const doc = await readPlotMemory()
    if (!chapterNeedsSummary(doc, chapterId)) return
    result = mergeMemoryResults(result, await backfillChapterSummaryFromNovel(chapterId, chapterTitle, body))
  }

  await tryBackfill(cleaned)
  if (chapterNeedsSummary(await readPlotMemory(), chapterId)) {
    const fromDisk = stripThinkBlocks(await readChapterText(chapterId, 'novel'))
    await tryBackfill(fromDisk)
  }

  const finalDoc = await readPlotMemory()
  const entry = finalDoc.chapterSummaries.find((s) => s.chapterId === chapterId)
  result.chapterSummaryUpdated = isSummaryUsable(entry?.summary)
  result.merged =
    result.merged ||
    result.globalDeltaAdded ||
    result.chapterSummaryUpdated ||
    result.foreshadowingChanged > 0

  return result
}

/** 大纲串行：用 outline beats 覆盖记忆并落盘，供下一章 Dify 读取 */
export async function syncAndSavePlotMemoryFromOutline(
  outline: OutlineDocument,
  nextChapterId: string
): Promise<void> {
  const memory = await readPlotMemory()
  const synced = syncPlotMemoryFromOutlineBeats(memory, outline, nextChapterId)
  await savePlotMemory(synced)
}

/** 大纲单章生成后写入剧情记忆，供下一章 O1 承接 */
export async function applyOutlineChapterToMemory(
  chapterId: string,
  chapterTitle: string,
  beats: { text: string }[]
): Promise<MemoryMergeResult> {
  const texts = beats.map((b) => b.text.trim()).filter(Boolean)
  const summary = texts.join('；')
  const keyEvents = texts.slice(0, 8)

  return applyMemoryPatch(chapterId, {
    chapterSummary: {
      chapterId,
      title: chapterTitle,
      summary,
      keyEvents,
      openThreads: [],
      characterStates: []
    }
  })
}
