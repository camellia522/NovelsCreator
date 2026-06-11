import type { IpcMainInvokeEvent } from 'electron'
import type {
  ChapterGenerateInputs,
  GenerateChapterOptions,
  GenerateKnowledgeOptions,
  GenerateOutlineOptions,
  OutlineGenerationProgress
} from '../../src/types/api'
import { getWorkflowRunner } from '../workflows/workflow-runner.factory'
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

export async function handleGenerateChapter(_e: IpcMainInvokeEvent, options: GenerateChapterOptions) {
  const project = getCurrentProject()
  if (!project) {
    return { ok: false, error: '请先打开或创建项目' }
  }

  const runner = await getWorkflowRunner()
  const payload = await buildGenerationPayload(options.chapter_id, {
    useOutlineBeats: options.use_outline_beats !== false,
    generation_prompt_text: options.generation_prompt_text
  })

  console.info(
    `[ai/${runner.engineId}] chapter=${options.chapter_id} snapshot=${payload.knowledge_snapshot.length} chars prev_summary=${payload.previous_chapter_summary.length} chars`
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

  const result = await runner.runChapterWorkflow(inputs, {
    inputProfile: project.settings.dify?.inputProfile ?? 'v1.1'
  })
  if (!result.ok || !result.outputs) {
    return result
  }

  const out = result.outputs
  if (out.status === 'success') {
    const outputCheck = validateChapterWorkflowOutputs(out)
    for (const w of outputCheck.warnings) {
      console.warn(`[ai] chapter output warning: ${w}`)
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

export async function handleGenerateOutline(
  event: IpcMainInvokeEvent,
  options: GenerateOutlineOptions
) {
  const project = getCurrentProject()
  if (!project) {
    return { ok: false, error: '请先打开或创建项目' }
  }

  const runner = await getWorkflowRunner()
  const volumeId = options.volume_id?.trim() || 'vol-01'
  const total = Math.max(1, options.chapters_to_generate ?? 1)

  console.info(
    `[ai/${runner.engineId}] outline sequential volume=${volumeId} chapters=${total} project=${project.id}`
  )

  const sendProgress = (p: OutlineGenerationProgress) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('ai:outlineProgress', p)
      event.sender.send('dify:outlineProgress', p)
    }
  }

  return runner.runOutlineWorkflow(project.id, options, sendProgress)
}

export async function handleGenerateKnowledge(
  _e: IpcMainInvokeEvent,
  options: GenerateKnowledgeOptions
) {
  const project = getCurrentProject()
  if (!project) {
    return { ok: false, error: '请先打开或创建项目' }
  }

  const runner = await getWorkflowRunner()
  console.info(
    `[ai/${runner.engineId}] knowledge generate project=${project.id} mode=${options.generation_mode ?? 'expand'}`
  )

  return runner.runKnowledgeWorkflow(project.id, options)
}
