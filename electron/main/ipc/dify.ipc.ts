import { ipcMain } from 'electron'
import type {
  ChapterGenerateInputs,
  GenerateChapterOptions,
  GenerateOutlineOptions,
  GenerateKnowledgeOptions,
  OutlineGenerationProgress
} from '../../src/types/api'
import { runChapterGenerationWithRetry } from '../services/dify.service'
import { runSequentialOutlineGeneration } from '../services/outline-sequential.service'
import { runKnowledgeGeneration } from '../services/knowledge-generation.service'
import {
  buildGenerationPayload,
  getCurrentProject,
  saveGeneratedChapter
} from '../services/project.service'
import { ensureMemoryAfterGeneration } from '../services/memory.service'
import { scanAppearedCharactersAfterChapter } from '../services/appeared-characters.service'
import { maybeAutoBackupAfterGeneration } from '../services/backup.service'
import { stripThinkBlocks } from '../utils/novel-text'
import { validateChapterWorkflowOutputs } from '../utils/chapter-output-validation'
import { setOutlineChapterStatus } from '../utils/outline-chapter-status'

export function registerDifyIpc(): void {
  ipcMain.handle(
    'dify:generateChapter',
    async (_e, options: GenerateChapterOptions) => {
      const project = getCurrentProject()
      if (!project) {
        return { ok: false, error: '请先打开或创建项目' }
      }

      const payload = await buildGenerationPayload(options.chapter_id, {
        useOutlineBeats: options.use_outline_beats !== false,
        generation_prompt_text: options.generation_prompt_text
      })

      console.info(
        `[dify] chapter=${options.chapter_id} snapshot=${payload.knowledge_snapshot.length} chars prev_summary=${payload.previous_chapter_summary.length} chars`
      )

      const inputs: ChapterGenerateInputs = {
        project_id: project.id,
        chapter_id: options.chapter_id,
        chapter_title: payload.chapter_title,
        outline_beats: payload.outline_beats,
        knowledge_snapshot: payload.knowledge_snapshot,
        plot_memory: payload.plot_memory,
        previous_chapter_summary: payload.previous_chapter_summary,
        video_platform_template: project.settings.videoPlatformTemplate ?? 'generic-v1',
        max_retry: 3,
        generation_prompt: options.generation_prompt ?? '',
        generation_prompt_text: payload.generation_prompt_text,
        retry_count: 0,
        retry_issues: '[]',
        retry_issues_formatted: '',
        estimated_duration_sec: 180,
        video_template_config: ''
      }

      const result = await runChapterGenerationWithRetry(inputs, {
        inputProfile: project.settings.dify?.inputProfile ?? 'v1.1'
      })
      if (!result.ok || !result.outputs) {
        return result
      }

      const out = result.outputs
      if (out.status === 'success') {
        const outputCheck = validateChapterWorkflowOutputs(out)
        for (const w of outputCheck.warnings) {
          console.warn(`[dify] chapter output warning: ${w}`)
        }
        if (!outputCheck.ok) {
          return {
            ok: false,
            error: outputCheck.errors.join('；'),
            outputs: out,
            workflowRunId: result.workflowRunId,
            outputWarnings: outputCheck.warnings
          }
        }

        const cleanedNovel = stripThinkBlocks(out.novel_body ?? '')
        await saveGeneratedChapter(
          options.chapter_id,
          cleanedNovel,
          stripThinkBlocks(out.video_script ?? ''),
          {
            chapterId: options.chapter_id,
            generatedAt: new Date().toISOString(),
            difyRunId: result.workflowRunId,
            retryCount: out.retry_count,
            workflowVersion: out.workflow_version
          }
        )
        await setOutlineChapterStatus(options.chapter_id, 'generated')
        const memoryMerged = await ensureMemoryAfterGeneration(
          options.chapter_id,
          payload.chapter_title,
          cleanedNovel,
          out.memory_patch
        )
        const appearedScan = await scanAppearedCharactersAfterChapter(
          options.chapter_id,
          cleanedNovel,
          out.memory_patch
        )
        const autoBackup = await maybeAutoBackupAfterGeneration()
        return {
          ...result,
          outputWarnings: outputCheck.warnings,
          memoryMerged: memoryMerged.merged,
          appearedScan,
          autoBackup: autoBackup ?? undefined,
          memoryUpdate: memoryMerged.merged
            ? {
                chapterId: memoryMerged.chapterId,
                globalDeltaAdded: memoryMerged.globalDeltaAdded,
                chapterSummaryUpdated: memoryMerged.chapterSummaryUpdated,
                foreshadowingChanged: memoryMerged.foreshadowingChanged
              }
            : undefined
        }
      }

      return result
    }
  )

  ipcMain.handle('dify:generateOutline', async (event, options: GenerateOutlineOptions) => {
    const project = getCurrentProject()
    if (!project) {
      return { ok: false, error: '请先打开或创建项目' }
    }

    const volumeId = options.volume_id?.trim() || 'vol-01'
    const total = Math.max(1, options.chapters_to_generate ?? 1)

    console.info(
      `[dify] outline sequential volume=${volumeId} chapters=${total} snapshot project=${project.id}`
    )

    const sendProgress = (p: OutlineGenerationProgress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('dify:outlineProgress', p)
      }
    }

    return runSequentialOutlineGeneration(project.id, options, sendProgress)
  })

  ipcMain.handle('dify:generateKnowledge', async (_e, options: GenerateKnowledgeOptions) => {
    const project = getCurrentProject()
    if (!project) {
      return { ok: false, error: '请先打开或创建项目' }
    }
    console.info(`[dify] knowledge generate project=${project.id} mode=${options.generation_mode ?? 'expand'}`)
    return runKnowledgeGeneration(project.id, options)
  })
}
