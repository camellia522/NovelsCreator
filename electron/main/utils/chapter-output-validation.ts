import type { WorkflowOutputs } from '../../src/types/api'
import { parseMemoryPatchFromRaw } from './memory-patch-parse'

export interface ChapterOutputValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const MIN_NOVEL_BODY_CHARS = 400

function stripThink(text: string): string {
  return text.replace(/<(?:redacted_)?think>[\s\S]*?<\/(?:redacted_)?think>/gi, '').trim()
}

/** Dify 返回 success 后的客户端硬校验，防止空正文/残缺记忆落盘 */
export function validateChapterWorkflowOutputs(outputs: WorkflowOutputs): ChapterOutputValidation {
  const errors: string[] = []
  const warnings: string[] = []

  const body = stripThink(outputs.novel_body ?? '')
  if (body.length < MIN_NOVEL_BODY_CHARS) {
    errors.push(`正文过短（${body.length} 字，要求 ≥${MIN_NOVEL_BODY_CHARS}），未写入章节文件`)
  }

  if (outputs.retry_count > 0) {
    const issues = outputs.retry_issues_formatted?.trim()
    warnings.push(
      issues
        ? `工作流内部修订 ${outputs.retry_count} 次：${issues.slice(0, 280)}${issues.length > 280 ? '…' : ''}`
        : `工作流内部修订 ${outputs.retry_count} 次（首稿未过 N2 校验）`
    )
  }

  const report = outputs.validation_report
  if (report && typeof report === 'object') {
    if (report.outline_valid === false || report.lore_valid === false) {
      warnings.push('validation_report 标记 outline/lore 未通过，但 status 为 success，请人工复核正文')
    }
    const issues = report.issues ?? []
    if (issues.length) {
      warnings.push(`校验备注：${issues.slice(0, 3).join('；')}`)
    }
  }

  const patch = parseMemoryPatchFromRaw(outputs.memory_patch)
  if (!patch) {
    warnings.push('Dify 未返回有效 memory_patch，将尝试从正文自动提取章摘要')
  } else {
    const cs = patch.chapterSummary
    const summary =
      cs && typeof cs === 'object'
        ? String((cs as Record<string, unknown>).summary ?? '').trim()
        : ''
    if (!summary) {
      warnings.push('memory_patch 缺少 chapterSummary.summary，将尝试从正文补全')
    }
    const openThreads =
      cs && typeof cs === 'object' && Array.isArray((cs as Record<string, unknown>).openThreads)
        ? ((cs as Record<string, unknown>).openThreads as unknown[]).filter(Boolean)
        : []
    const fsUpdates = patch.foreshadowingUpdates ?? []
    if (openThreads.length && !fsUpdates.length) {
      warnings.push(
        `memory_patch 含 ${openThreads.length} 条 openThreads 但未写 foreshadowingUpdates，客户端将自动登记伏笔`
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}
