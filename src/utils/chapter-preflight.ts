import type { KnowledgeDocument, OutlineDocument, PlotMemoryDocument } from '@/types/project'
import {
  findChapterInOutline,
  findPreviousChapterId,
  getPreviousChapterSummaryText,
  isFirstOutlineChapter
} from '@/utils/chapter-plot-memory'
import { prepareKnowledgeForOutline, validateKnowledgeForOutline } from '@/utils/outline-preflight'

export interface ChapterPreflightResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export interface ChapterPreflightOptions {
  useOutlineBeats: boolean
}

/** 落盘/送 Dify 前校验章节生成必要条件 */
export function validateChapterGenerationPreflight(
  chapterId: string,
  outline: OutlineDocument,
  knowledge: KnowledgeDocument,
  memory: PlotMemoryDocument,
  options: ChapterPreflightOptions
): ChapterPreflightResult {
  const errors: string[] = []
  const warnings: string[] = []

  prepareKnowledgeForOutline(knowledge)
  const knowledgeCheck = validateKnowledgeForOutline(knowledge)
  errors.push(...knowledgeCheck.errors)
  warnings.push(...knowledgeCheck.warnings)

  const ch = findChapterInOutline(outline, chapterId)
  if (!ch) {
    errors.push(`大纲中找不到章节 ${chapterId}`)
    return { ok: false, errors, warnings }
  }

  const beats = ch.beats.map((b) => b.text.trim()).filter(Boolean)
  if (options.useOutlineBeats) {
    if (!beats.length) {
      errors.push(
        `${chapterId} 无有效大纲节拍：请在大纲面板编辑 beats，或取消「使用大纲节拍」`
      )
    } else if (beats.length < 2) {
      warnings.push(`${chapterId} 仅 ${beats.length} 条节拍，建议至少 2–4 条以降低 N2a 驳回率`)
    }
  } else if (!beats.length) {
    warnings.push(`${chapterId} 未使用大纲节拍且 beats 为空，正文易跑题；建议填写 beats 或写详细 Brief`)
  }

  const prevId = findPreviousChapterId(outline, chapterId)
  if (prevId) {
    const prevSummary = getPreviousChapterSummaryText(memory, outline, chapterId)
    const prevCh = findChapterInOutline(outline, prevId)
    const prevBeats = prevCh?.beats.map((b) => b.text.trim()).filter(Boolean) ?? []
    if (!prevSummary.trim() && !prevBeats.length) {
      errors.push(
        `上一章 ${prevId} 缺少剧情摘要且大纲 beats 为空：请先生成 ${prevId} 或填写其 beats`
      )
    }
  } else if (!isFirstOutlineChapter(chapterId)) {
    warnings.push(`${chapterId} 无法解析上一章序号，previous_chapter_summary 将为空`)
  }

  const openFs = (memory.foreshadowing ?? []).filter((f) => !f.resolved)
  if (openFs.length >= 3 && !isFirstOutlineChapter(chapterId)) {
    warnings.push(`当前有 ${openFs.length} 条未解伏笔，正文须至少呼应一条以免 N2b 连续性驳回`)
  }

  return { ok: errors.length === 0, errors, warnings }
}
