import { validateChapterGenerationPreflight } from '@/utils/chapter-preflight'
import { validateMergedKnowledge } from '@/utils/knowledge-dify-merge'
import { prepareKnowledgeForOutline, validateKnowledgeForOutline } from '@/utils/outline-preflight'
import type { OutlineDocument } from '../../src/types/project'
import { syncPlotMemoryFromOutlineBeats } from '../utils/outline-plot-memory'
import { scanAppearedCharactersAfterChapter } from './appeared-characters.service'
import { getCurrentProject } from './project.service'
import {
  readKnowledge,
  readOutline,
  readPlotMemory,
  saveKnowledge,
  savePlotMemory
} from './project-files.service'
import { withProjectFilesLock } from './project-file-mutex'

/** 同步全部已落盘章节的 beats → 剧情记忆（num < 999） */
const FULL_OUTLINE_MEMORY_SYNC_CHAPTER = 'ch-999'

export interface ProjectSyncReport {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: string
}

function collectAllChapterIds(outline: OutlineDocument): string[] {
  const ids: string[] = []
  for (const vol of outline.volumes ?? []) {
    for (const ch of vol.chapters ?? []) {
      if (ch.id?.trim()) ids.push(ch.id)
    }
  }
  return ids
}

function buildSyncSummary(errors: string[], warnings: string[]): string {
  const parts: string[] = ['已同步：知识库 world/map 约束刷新；大纲 beats → 剧情记忆对齐。']
  if (errors.length) {
    parts.push(`仍须修复（否则生成易 retry/熔断）：${errors.slice(0, 5).join('；')}`)
  }
  if (warnings.length) {
    parts.push(`建议：${warnings.slice(0, 3).join('；')}`)
  }
  return parts.join(' ')
}

/**
 * 助手写盘后的统一一致性同步，降低后续工作流 N2/O2 校验驳回率。
 */
export async function syncProjectAfterAssistantEdit(options?: {
  chapterIdForAppearedScan?: string
  novelBodyForAppearedScan?: string
}): Promise<ProjectSyncReport> {
  const project = getCurrentProject()
  if (!project) {
    return {
      ok: false,
      errors: ['未打开项目'],
      warnings: [],
      summary: '未打开项目，跳过同步'
    }
  }

  return withProjectFilesLock(project.rootPath, async () => {
    const outline = await readOutline()
    let knowledge = await readKnowledge()
    let memory = await readPlotMemory()

    prepareKnowledgeForOutline(knowledge)
    await saveKnowledge(knowledge)

    memory = syncPlotMemoryFromOutlineBeats(memory, outline, FULL_OUTLINE_MEMORY_SYNC_CHAPTER)
    await savePlotMemory(memory)

    if (options?.chapterIdForAppearedScan && options.novelBodyForAppearedScan?.trim()) {
      await scanAppearedCharactersAfterChapter(
        options.chapterIdForAppearedScan,
        options.novelBodyForAppearedScan
      )
    }

    knowledge = await readKnowledge()
    memory = await readPlotMemory()

    const mergedCheck = validateMergedKnowledge(knowledge)
    const knowledgeCheck = validateKnowledgeForOutline(knowledge)

    const errors = [...mergedCheck.errors, ...knowledgeCheck.errors]
    const warnings = [...knowledgeCheck.warnings]

    for (const chapterId of collectAllChapterIds(outline)) {
      const pf = validateChapterGenerationPreflight(chapterId, outline, knowledge, memory, {
        useOutlineBeats: true
      })
      warnings.push(...pf.warnings)
      if (!pf.ok) {
        for (const err of pf.errors) {
          warnings.push(`[${chapterId}] ${err}`)
        }
      }
    }

    const ok = mergedCheck.ok && knowledgeCheck.ok
    return {
      ok,
      errors,
      warnings,
      summary: buildSyncSummary(errors, warnings)
    }
  })
}

export function formatSyncReportAppend(report: ProjectSyncReport): string {
  if (report.ok && !report.warnings.length) {
    return `\n\n【同步】${report.summary}`
  }
  if (report.ok) {
    return `\n\n【同步】${report.summary}`
  }
  return `\n\n【同步警告】${report.summary}`
}
