import { tool } from 'langchain'
import { z } from 'zod'
import type { ChapterGenerateInputs } from '../../../../src/types/api'
import type { WorkflowRunner } from '../../workflows/workflow-runner.types'
import {
  buildGenerationPayload,
  saveGeneratedChapter
} from '../../services/project.service'
import { ensureMemoryAfterGeneration } from '../../services/memory.service'
import {
  readKnowledge,
  readOutline,
  readPlotMemory
} from '../../services/project-files.service'
import { stripThinkBlocks } from '../../utils/novel-text'
import { validateChapterWorkflowOutputs } from '../../utils/chapter-output-validation'
import { setOutlineChapterStatus } from '../../utils/outline-chapter-status'
import { notifyAssistantProjectMutated } from '../project-mutate-notify'
import {
  formatSyncReportAppend,
  syncProjectAfterAssistantEdit
} from '../../services/project-consistency.service'
import { createProjectAssert, type NovelAssistantToolDeps } from './deps'
import { buildReadTools } from './read-tools'
import { buildWriteTools } from './write-tools'

export type { NovelAssistantToolDeps } from './deps'

export function buildNovelAssistantTools(deps: NovelAssistantToolDeps) {
  const assertProject = createProjectAssert(deps.projectId)

  const getProjectSummary = tool(
    async () => {
      const project = assertProject()
      return JSON.stringify(
        {
          id: project.id,
          name: project.name,
          rootPath: project.rootPath,
          videoPlatformTemplate: project.settings.videoPlatformTemplate ?? 'generic-v1'
        },
        null,
        2
      )
    },
    {
      name: 'get_project_summary',
      description: '获取当前项目元信息（名称、路径、模板）',
      schema: z.object({})
    }
  )

  const getKnowledgeSnapshot = tool(
    async () => {
      assertProject()
      const doc = await readKnowledge()
      const chars = doc.characters ?? []
      const protagonist = chars.find((c) => c.role === '主角' || c.role === 'protagonist')
      return JSON.stringify(
        {
          hint: '此为统计摘要。分析世界观/设定请调用 load_project_context 或 get_worldview。',
          worldTitle: doc.world?.title ?? '',
          worldRulesExcerpt: (doc.world?.rules ?? '').slice(0, 240),
          settingConstraintsExcerpt: (doc.world?.settingConstraints ?? '').slice(0, 400),
          protagonist: protagonist?.name ?? chars[0]?.name ?? '',
          characterCount: chars.length,
          factionCount: doc.factions?.length ?? 0,
          itemCount: doc.items?.length ?? 0,
          nationCount: doc.map?.nations?.length ?? 0,
          locationCount: doc.locations?.length ?? 0,
          regionCount: doc.map?.regions?.length ?? 0,
          nationNames: (doc.map?.nations ?? []).map((n) => n.name),
          characterIds: chars.slice(0, 20).map((c) => ({ id: c.id, name: c.name, role: c.role }))
        },
        null,
        2
      )
    },
    {
      name: 'get_knowledge_snapshot',
      description: '设定库统计摘要（非完整内容）。需要世界观/地点/国家详情时请用 get_worldview 或 load_project_context',
      schema: z.object({})
    }
  )

  const getOutlineExcerpt = tool(
    async ({ volumeId, chapterId }) => {
      assertProject()
      const outline = await readOutline()
      const volume = outline.volumes?.find((v) => v.id === volumeId)
      if (!volume) {
        return `未找到卷 ${volumeId}，现有卷：${outline.volumes?.map((v) => v.id).join(', ') || '无'}`
      }
      if (chapterId) {
        const chapter = volume.chapters?.find((c) => c.id === chapterId)
        if (!chapter) return `卷 ${volumeId} 中未找到章 ${chapterId}`
        return JSON.stringify(chapter, null, 2)
      }
      return JSON.stringify(
        {
          id: volume.id,
          title: volume.title,
          chapters: volume.chapters?.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status
          }))
        },
        null,
        2
      )
    },
    {
      name: 'get_outline_excerpt',
      description: '读取大纲卷或单章片段',
      schema: z.object({
        volumeId: z.string().describe('卷 id，如 vol-01'),
        chapterId: z.string().optional().describe('可选章 id')
      })
    }
  )

  const getPlotMemory = tool(
    async ({ limit }) => {
      assertProject()
      const memory = await readPlotMemory()
      const chapters = (memory.chapterSummaries ?? []).slice(-(limit ?? 5))
      const foreshadowing = (memory.foreshadowing ?? []).filter((f) => !f.resolved)
      return JSON.stringify(
        {
          globalSummary: memory.globalSummary,
          recentChapters: chapters,
          openForeshadowing: foreshadowing.slice(0, 20)
        },
        null,
        2
      )
    },
    {
      name: 'get_plot_memory',
      description: '读取剧情记忆（最近章节摘要与未回收伏笔）',
      schema: z.object({
        limit: z.number().int().min(1).max(20).optional().describe('最近章数，默认 5')
      })
    }
  )

  const generateChapter = tool(
    async ({ chapterId }) => {
      const project = assertProject()
      const payload = await buildGenerationPayload(chapterId, { useOutlineBeats: true })
      const inputs: ChapterGenerateInputs = {
        project_id: deps.projectId,
        chapter_id: chapterId,
        chapter_title: payload.chapter_title,
        outline_beats: payload.outline_beats,
        knowledge_snapshot: payload.knowledge_snapshot,
        plot_memory: payload.plot_memory,
        previous_chapter_summary: payload.previous_chapter_summary,
        video_platform_template: project.settings.videoPlatformTemplate ?? 'generic-v1',
        max_retry: 3,
        generation_prompt_text: payload.generation_prompt_text,
        retry_count: 0,
        retry_issues: '[]',
        retry_issues_formatted: '',
        estimated_duration_sec: 180,
        video_template_config: ''
      }
      const result = await deps.runner.runChapterWorkflow(inputs)
      if (!result.ok || !result.outputs) {
        return `生成失败：${result.error ?? '未知错误'}`
      }
      const out = result.outputs
      if (out.status === 'retry' || out.status === 'circuit_break') {
        return `生成未通过校验（${out.status}）：${out.retry_issues_formatted || '请检查大纲节拍与设定'}`
      }
      if (out.status !== 'success') {
        return `工作流返回异常状态：${out.status}`
      }
      const outputCheck = validateChapterWorkflowOutputs(out)
      if (!outputCheck.ok) {
        return `输出校验失败：${outputCheck.errors.join('；')}`
      }
      const cleanedNovel = stripThinkBlocks(out.novel_body ?? '')
      await saveGeneratedChapter(chapterId, cleanedNovel, stripThinkBlocks(out.video_script ?? ''), {
        chapterId,
        generatedAt: new Date().toISOString(),
        difyRunId: result.workflowRunId,
        retryCount: out.retry_count,
        workflowVersion: out.workflow_version
      })
      await setOutlineChapterStatus(chapterId, 'generated')
      const memoryMerged = await ensureMemoryAfterGeneration(
        chapterId,
        payload.chapter_title,
        cleanedNovel,
        out.memory_patch
      )
      const report = await syncProjectAfterAssistantEdit({
        chapterIdForAppearedScan: chapterId,
        novelBodyForAppearedScan: cleanedNovel
      })
      notifyAssistantProjectMutated()
      return (
        `章节「${payload.chapter_title}」已生成并落盘（正文 ${cleanedNovel.length} 字${
          memoryMerged.merged ? '，剧情记忆已更新' : ''
        }）。` + formatSyncReportAppend(report)
      )
    },
    {
      name: 'generate_chapter',
      description: '触发章节生成工作流（需用户确认）',
      schema: z.object({
        chapterId: z.string().describe('章 id，如 ch-001')
      })
    }
  )

  const generateOutline = tool(
    async ({ volumeId, chaptersToGenerate }) => {
      assertProject()
      const result = await deps.runner.runOutlineWorkflow(deps.projectId, {
        volume_id: volumeId,
        chapters_to_generate: chaptersToGenerate ?? 1
      })
      if (!result.ok) return `生成失败：${result.error ?? '未知错误'}`
      const report = await syncProjectAfterAssistantEdit()
      notifyAssistantProjectMutated()
      return `大纲生成完成。${formatSyncReportAppend(report)}`
    },
    {
      name: 'generate_outline',
      description: '触发大纲生成（需用户确认）',
      schema: z.object({
        volumeId: z.string().default('vol-01'),
        chaptersToGenerate: z.number().int().min(1).max(10).optional()
      })
    }
  )

  const generateKnowledge = tool(
    async ({ knowledge_brief, generation_mode, genre, tone }) => {
      assertProject()
      const brief = knowledge_brief.trim()
      if (!brief) {
        return '错误：knowledge_brief 不能为空。请描述要生成/补充的世界观、人物、势力、道具等需求。'
      }
      const result = await deps.runner.runKnowledgeWorkflow(deps.projectId, {
        knowledge_brief: brief,
        generation_mode: generation_mode ?? 'expand',
        genre,
        tone
      })
      if (!result.ok) return `生成失败：${result.error ?? '未知错误'}`
      const report = await syncProjectAfterAssistantEdit()
      notifyAssistantProjectMutated()
      const counts = result.mergedCounts
      const countLine = counts
        ? `新增/更新：${counts.characters} 人物、${counts.factions} 势力、${counts.items} 道具。`
        : ''
      const summaryLine = result.knowledgeSummary
        ? `摘要：${result.knowledgeSummary.slice(0, 200)}${result.knowledgeSummary.length > 200 ? '…' : ''}`
        : ''
      return `知识库生成完成。${countLine}${summaryLine}${formatSyncReportAppend(report)}`
    },
    {
      name: 'generate_knowledge',
      description:
        '调用知识库生成工作流，批量创建/扩展 world、characters、factions、items 并写入 knowledge.json（需用户确认）。必须传入 knowledge_brief，将具体设定需求写进 brief。',
      schema: z.object({
        knowledge_brief: z
          .string()
          .describe(
            '创作 brief（必填）：要生成或补充的世界观、人物（姓名/身份/关系）、势力、道具、冲突等。可将用户已设计的设定原文或结构化描述粘贴于此。'
          ),
        generation_mode: z
          .enum(['bootstrap', 'expand'])
          .optional()
          .describe('expand=在已有设定上扩展（默认）；bootstrap=brief 约束下从零搭建'),
        genre: z.string().optional().describe('类型标签，如「玄幻」「科幻」；省略则从项目设定推断'),
        tone: z.string().optional().describe('基调，如「热血」「黑暗」；省略则从项目设定推断')
      })
    }
  )

  const generateSociety = tool(
    async () => {
      return '社会层生成需地图领土数据，请在世界生成向导中操作；助手暂不支持直接调用。'
    },
    {
      name: 'generate_society',
      description: '触发社会层生成（需用户确认，当前为占位）',
      schema: z.object({})
    }
  )

  return [
    ...buildReadTools(deps),
    getProjectSummary,
    getKnowledgeSnapshot,
    getOutlineExcerpt,
    getPlotMemory,
    ...buildWriteTools(deps),
    generateChapter,
    generateOutline,
    generateKnowledge,
    generateSociety
  ]
}
