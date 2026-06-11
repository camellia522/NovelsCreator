import type {
  GenerateOutlineOptions,
  GenerateOutlineResponse,
  OutlineGenerateInputs,
  OutlineGenerationProgress
} from '../../src/types/api'
import { getWorkflowRunner } from '../workflows/workflow-runner.factory'
import { buildOutlineGenerationPayload } from './project.service'
import { readOutline, saveOutline } from './project-files.service'
import { syncAndSavePlotMemoryFromOutline } from './memory.service'
import { nextChapterId, resolveOutlineGenerationChapterId } from '../utils/outline-chapter-id'
import { appendChapterToVolume, countChaptersInOutlineJson, extractGeneratedChapter } from '../utils/outline-chapter-merge'
import { setOutlineChapterStatus } from '../utils/outline-chapter-status'
import { isOutlineValidationPassed } from '../utils/outline-bool-parse'
import { formatOutlineValidationIssues } from '@/utils/outline-validation-report'

export async function runSequentialOutlineGeneration(
  projectId: string,
  options: GenerateOutlineOptions,
  sendProgress?: (p: OutlineGenerationProgress) => void
): Promise<GenerateOutlineResponse> {
  const total = Math.max(1, options.chapters_to_generate ?? 1)
  const volumeId = options.volume_id?.trim() || 'vol-01'
  const generatedIds: string[] = []
  let lastSummary = ''
  let totalClientRetryRounds = 0
  let lastResult: GenerateOutlineResponse | null = null

  const progress = (p: OutlineGenerationProgress) => sendProgress?.(p)

  for (let i = 0; i < total; i++) {
    const outlineDoc = await readOutline()
    const nextId = resolveOutlineGenerationChapterId(outlineDoc, volumeId)

    progress({
      phase: 'chapter_start',
      index: i + 1,
      total,
      chapterId: nextId,
      volumeId,
      message: `开始生成 ${nextId}（${i + 1}/${total}）…`
    })

    const payload = await buildOutlineGenerationPayload({
      volume_id: volumeId,
      chapters_to_generate: 1,
      next_chapter_id: nextId,
      generation_mode: 'single_chapter',
      outline_brief: options.outline_brief,
      genre: options.genre,
      tone: options.tone,
      use_plot_memory: options.use_plot_memory
    })

    const inputs: OutlineGenerateInputs = {
      project_id: projectId,
      knowledge_snapshot: payload.knowledge_snapshot,
      plot_memory: payload.plot_memory,
      outline_brief: payload.outline_brief,
      target_volumes: payload.target_volumes,
      target_chapters: payload.target_chapters,
      genre: payload.genre,
      tone: payload.tone,
      volume_id: payload.volume_id,
      next_chapter_id: payload.next_chapter_id,
      generation_mode: payload.generation_mode,
      existing_volume_outline: payload.existing_volume_outline,
      max_retry: 3,
      retry_count: 0,
      retry_issues_formatted: ''
    }

    const runner = await getWorkflowRunner()
    const result = await runner.runOutlineGenerationWithRetry(inputs)
    totalClientRetryRounds += result.clientRetryRounds ?? 0
    lastResult = result

    if (!result.ok || !result.outputs) {
      progress({
        phase: 'chapter_failed',
        index: i + 1,
        total,
        chapterId: nextId,
        volumeId,
        message: result.error ?? 'Dify 请求失败'
      })
      return {
        ok: false,
        error: result.error ?? `第 ${i + 1} 章生成失败`,
        clientRetryRounds: totalClientRetryRounds,
        chaptersGenerated: generatedIds,
        failedAtChapter: nextId,
        sequential: true
      }
    }

    const out = result.outputs
    if (out.status === 'circuit_break') {
      return {
        ok: true,
        outputs: out,
        clientRetryRounds: totalClientRetryRounds,
        chaptersGenerated: generatedIds,
        outlineSaved: generatedIds.length > 0,
        sequential: true,
        error: generatedIds.length ? `已完成 ${generatedIds.length} 章后熔断` : undefined
      }
    }

    if (out.status !== 'success' || !out.outline_json?.trim()) {
      return {
        ok: false,
        outputs: out,
        error: `第 ${i + 1} 章未完成（status=${out.status ?? 'unknown'}）`,
        clientRetryRounds: totalClientRetryRounds,
        chaptersGenerated: generatedIds,
        failedAtChapter: nextId,
        sequential: true
      }
    }

    if (!isOutlineValidationPassed(out.validation_report)) {
      const issuesText = formatOutlineValidationIssues(
        out.validation_report,
        out.retry_issues_formatted
      )
      progress({
        phase: 'chapter_failed',
        index: i + 1,
        total,
        chapterId: nextId,
        volumeId,
        message: issuesText || '校验未通过'
      })
      return {
        ok: false,
        outputs: out,
        error: issuesText ? `第 ${i + 1} 章校验未通过：\n${issuesText}` : `第 ${i + 1} 章校验未通过`,
        clientRetryRounds: totalClientRetryRounds,
        chaptersGenerated: generatedIds,
        failedAtChapter: nextId,
        sequential: true
      }
    }

    const chapter = extractGeneratedChapter(out.outline_json, nextId)
    if (!chapter?.beats?.length) {
      const emptyHint =
        countChaptersInOutlineJson(out.outline_json) === 0
          ? 'O1X 未返回有效 volumes/chapters，请检查 Dify：O1 Structured Output、O1X→O1.text、O2/AGG→O1X.outline_json'
          : `第 ${i + 1} 章 outline_json 无法解析为有效章节`
      return {
        ok: false,
        outputs: out,
        error: emptyHint,
        clientRetryRounds: totalClientRetryRounds,
        chaptersGenerated: generatedIds,
        failedAtChapter: nextId,
        sequential: true
      }
    }

    chapter.id = nextId
    chapter.status = 'generated'
    const updated = appendChapterToVolume(outlineDoc, volumeId, chapter)
    await saveOutline(updated)

    progress({
      phase: 'chapter_done',
      index: i + 1,
      total,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      volumeId,
      message: `已写入 ${chapter.id}「${chapter.title}」`
    })

    const memoryNextId = nextChapterId(updated)
    await syncAndSavePlotMemoryFromOutline(updated, memoryNextId)
    progress({
      phase: 'memory_saved',
      index: i + 1,
      total,
      chapterId: chapter.id,
      volumeId,
      message: '剧情记忆已按大纲节拍同步，继续下一章'
    })

    generatedIds.push(chapter.id)
    lastSummary = out.outline_summary?.trim() || lastSummary
  }

  return {
    ok: true,
    outputs: lastResult?.outputs,
    outlineSaved: true,
    outlineSummary: lastSummary,
    clientRetryRounds: totalClientRetryRounds,
    chaptersGenerated: generatedIds,
    sequential: true
  }
}
