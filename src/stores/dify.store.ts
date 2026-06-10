import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  GenerateChapterOptions,
  GenerateChapterResponse,
  GenerateKnowledgeOptions,
  GenerateKnowledgeResponse,
  GenerateOutlineOptions,
  GenerateOutlineResponse,
  OutlineGenerationProgress,
  OutlineWorkflowOutputs,
  WorkflowOutputs
} from '@/types/api'
import { useUiStore } from '@/stores/ui.store'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useOutlineStore } from '@/stores/outline.store'
import { useMemoryStore } from '@/stores/memory.store'
import { flushProjectPersist } from '@/utils/project-persist'
import { humanizeDifyError } from '@/utils/dify-error-message'
import { formatOutlineValidationIssues } from '@/utils/outline-validation-report'

export interface ConsoleLine {
  time: string
  level: 'info' | 'error' | 'success'
  message: string
}

function isSummaryUsable(text: string | undefined | null): boolean {
  const s = text?.trim() ?? ''
  if (!s) return false
  if (s.length < 12 && /^[.…·\-—_~～\s]+$/.test(s)) return false
  if (/^(\.{2,}|…+)$/.test(s)) return false
  return true
}

export const useDifyStore = defineStore('dify', () => {
  const running = ref(false)
  const outlineRunning = ref(false)
  const knowledgeRunning = ref(false)
  const lastOutputs = ref<WorkflowOutputs | null>(null)
  const lastOutlineOutputs = ref<OutlineWorkflowOutputs | null>(null)
  const outlineProgress = ref<OutlineGenerationProgress | null>(null)
  const lastError = ref('')
  const consoleLines = ref<ConsoleLine[]>([])

  function log(level: ConsoleLine['level'], message: string): void {
    consoleLines.value.unshift({
      time: new Date().toLocaleTimeString(),
      level,
      message
    })
    if (consoleLines.value.length > 200) {
      consoleLines.value.length = 200
    }
  }

  async function generateChapter(options: GenerateChapterOptions): Promise<GenerateChapterResponse> {
    if (!window.novelsCreator?.dify?.generateChapter) {
      const msg = '未检测到桌面应用接口，请在 NovelsCreator（Electron）中运行后再生成章节'
      lastError.value = msg
      log('error', msg)
      return { ok: false, error: msg }
    }

    running.value = true
    lastError.value = ''
    const startedAt = Date.now()
    log('info', `开始生成 ${options.chapter_id}…`)
    const layout = useLayoutStore()
    layout.expandBottomPanel()
    try {
      await flushProjectPersist()
      const result = await window.novelsCreator.dify.generateChapter(options)
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
      if (result.ok && result.outputs) {
        lastOutputs.value = result.outputs
        const retryNote =
          result.outputs.retry_count > 0
            ? ` · 内部修订 ${result.outputs.retry_count} 次`
            : ''
        log(
          'success',
          `完成 status=${result.outputs.status} retry=${result.outputs.retry_count}${retryNote} · ${elapsedSec}s`
        )

        for (const w of result.outputWarnings ?? []) {
          log('info', `校验提示：${w}`)
        }
        if (result.outputs.retry_count > 0 && result.outputs.retry_issues_formatted?.trim()) {
          log('info', `修订原因：${result.outputs.retry_issues_formatted.trim().slice(0, 320)}`)
        }

        if (result.outputs.status === 'success') {
          const memory = useMemoryStore()
          const ui = useUiStore()
          const knowledge = useKnowledgeStore()
          if (result.memoryMerged && result.memoryUpdate) {
            const u = result.memoryUpdate
            await memory.applyGenerationUpdate(options.chapter_id, u)
            layout.setActivity('memory')
            const summaryOk = isSummaryUsable(
              memory.getChapterSummary(options.chapter_id)?.summary
            )
            log(
              'success',
              `剧情记忆已更新：${u.chapterId}（章摘要${summaryOk ? '已更新' : '—'} · 全局${u.globalDeltaAdded ? '已追加' : '—'} · 伏笔${u.foreshadowingChanged}条）`
            )
            if (!summaryOk) {
              log('info', `${options.chapter_id} 章摘要仍为空，请点「补全缺失摘要」或检查正文是否已落盘`)
            }
          } else {
            await memory.load()
            const summary = memory.getChapterSummary(options.chapter_id)?.summary?.trim()
            if (summary) {
              await memory.applyGenerationUpdate(options.chapter_id, {
                chapterId: options.chapter_id,
                globalDeltaAdded: Boolean(memory.doc?.globalSummary?.trim()),
                chapterSummaryUpdated: true,
                foreshadowingChanged: 0
              })
              layout.setActivity('memory')
              log(
                'success',
                `剧情记忆已更新：${options.chapter_id}（Dify 未返回 memory_patch，已从正文自动提取章摘要）`
              )
            } else if (result.outputs.memory_patch) {
              log('info', 'Dify 返回了 memory_patch 但内容为空，且未能从正文提取摘要')
            } else {
              log(
                'info',
                'Dify 未返回 memory_patch；若正文已生成，请打开「剧情记忆」点「补全缺失摘要」或重新加载项目'
              )
            }
          }

          await memory.load()
          if (result.appearedScan?.newCount) {
            const names = result.appearedScan.newNames.join('、')
            log(
              'info',
              `发现 ${result.appearedScan.newCount} 个未登记人名：${names} → 请在「设定 → 已出现」勾选加入角色库`
            )
            layout.setActivity('knowledge')
            ui.openKnowledgeTab('appeared')
          } else if (result.appearedScan?.pendingCount) {
            await knowledge.loadIfEmpty()
            layout.setActivity('knowledge')
            ui.openKnowledgeTab('appeared')
          }
        }

        if (result.outputs.status === 'circuit_break') {
          useUiStore().showCircuitBreak(options.chapter_id, result.outputs)
        }

        if (result.autoBackup?.ok) {
          log('info', result.autoBackup.message)
        }

        await useOutlineStore().load()
      } else {
        lastError.value = humanizeDifyError(result.error ?? '未知错误')
        log('error', lastError.value)
      }
      return result
    } catch (e) {
      lastError.value = humanizeDifyError(e instanceof Error ? e.message : String(e))
      log('error', lastError.value)
      return { ok: false, error: lastError.value }
    } finally {
      running.value = false
    }
  }

  async function generateOutline(options: GenerateOutlineOptions): Promise<GenerateOutlineResponse> {
    if (!window.novelsCreator?.dify?.generateOutline) {
      const msg = '未检测到桌面应用接口，请在 NovelsCreator（Electron）中运行后再生成大纲'
      lastError.value = msg
      log('error', msg)
      return { ok: false, error: msg }
    }

    outlineRunning.value = true
    lastError.value = ''
    outlineProgress.value = null
    const total = options.chapters_to_generate ?? 1
    log('info', `开始串行生成大纲：${options.volume_id} 追加 ${total} 章…`)
    const layout = useLayoutStore()
    layout.expandBottomPanel()

    const unsubProgress = window.novelsCreator.dify.onOutlineProgress?.((p) => {
      outlineProgress.value = p
      if (p.phase === 'chapter_start') {
        log('info', p.message ?? `第 ${p.index}/${p.total} 章…`)
      } else if (p.phase === 'chapter_done') {
        log('success', p.message ?? `${p.chapterId} 已写入大纲`)
      } else if (p.phase === 'memory_saved') {
        log('success', p.message ?? `${p.chapterId} 记忆已更新`)
      } else if (p.phase === 'chapter_failed') {
        log('error', p.message ?? '章节生成失败')
      }
    })

    try {
      await flushProjectPersist()
      const result = await window.novelsCreator.dify.generateOutline(options)
      if (result.ok && result.outputs) {
        lastOutlineOutputs.value = result.outputs
        const rounds = result.clientRetryRounds ?? 0
        const generated = result.chaptersGenerated ?? []
        if (generated.length) {
          log(
            'success',
            `串行完成：${options.volume_id} 新增 ${generated.length} 章（${generated.join(', ')}）${rounds ? ` · 重试 ${rounds} 轮` : ''}`
          )
        } else if (rounds > 0) {
          log('info', `大纲经 ${rounds} 轮客户端重试后 status=${result.outputs.status}`)
        }
        if (result.outlineSaved && generated.length) {
          const outline = useOutlineStore()
          await outline.load()
          await useMemoryStore().load()
          layout.setActivity('outline')
        } else if (result.outputs.status === 'success' && !result.outlineSaved) {
          lastError.value = humanizeDifyError(result.error ?? '大纲解析或校验失败')
          log('error', lastError.value)
        }
        if (result.outputs.status === 'circuit_break') {
          const issues = formatOutlineValidationIssues(
            result.outputs.validation_report,
            result.outputs.retry_issues_formatted
          )
          log('error', issues ? `大纲生成熔断：\n${issues}` : '大纲生成熔断')
          useUiStore().showOutlineCircuitBreak(result.outputs)
        }
      } else {
        lastError.value = humanizeDifyError(result.error ?? '未知错误')
        log('error', lastError.value)
        if (result.chaptersGenerated?.length) {
          const failedAt = result.failedAtChapter
          const resumeHint = failedAt
            ? `已保存 ${result.chaptersGenerated.join(', ')}；修复 Dify 后重新生成将从 ${failedAt} 继续（不会覆盖已有章）。`
            : `已保存 ${result.chaptersGenerated.join(', ')}；可重新打开「AI 生成大纲」继续追加。`
          log('info', `部分完成：${resumeHint}`)
          await useOutlineStore().load()
          await useMemoryStore().load()
          layout.setActivity('outline')
        }
      }
      return result
    } catch (e) {
      lastError.value = humanizeDifyError(e instanceof Error ? e.message : String(e))
      log('error', lastError.value)
      return { ok: false, error: lastError.value }
    } finally {
      unsubProgress?.()
      outlineRunning.value = false
      outlineProgress.value = null
    }
  }

  async function generateKnowledge(
    options: GenerateKnowledgeOptions
  ): Promise<GenerateKnowledgeResponse> {
    if (!window.novelsCreator?.dify?.generateKnowledge) {
      const msg = '未检测到桌面应用接口，请在 NovelsCreator（Electron）中运行后再生成知识库'
      lastError.value = msg
      log('error', msg)
      return { ok: false, error: msg }
    }

    knowledgeRunning.value = true
    lastError.value = ''
    log('info', `开始 AI 生成知识库（${options.generation_mode ?? 'expand'}）…`)
    const layout = useLayoutStore()
    layout.expandBottomPanel()

    try {
      await flushProjectPersist()
      const result = await window.novelsCreator.dify.generateKnowledge(options)
      if (result.ok && result.outputs) {
        const rounds = result.clientRetryRounds ?? 0
        const counts = result.mergedCounts
        const countText = counts
          ? `人物 +${counts.characters} · 势力 +${counts.factions} · 道具 +${counts.items}`
          : ''
        log(
          'success',
          `知识库已更新${countText ? `（${countText}）` : ''}${rounds ? ` · 重试 ${rounds} 轮` : ''}`
        )
        if (result.knowledgeSummary?.trim()) {
          log('info', result.knowledgeSummary.trim().slice(0, 320))
        }
        await useKnowledgeStore().load()
        layout.setActivity('knowledge')
      } else {
        lastError.value = humanizeDifyError(result.error ?? '未知错误')
        log('error', lastError.value)
        if (result.outputs?.status === 'circuit_break') {
          const issues = formatOutlineValidationIssues(
            result.outputs.validation_report,
            result.outputs.retry_issues_formatted
          )
          log('error', issues ? `知识库生成熔断：\n${issues}` : '知识库生成熔断')
          useUiStore().showKnowledgeCircuitBreak(result.outputs)
        }
      }
      return result
    } catch (e) {
      lastError.value = humanizeDifyError(e instanceof Error ? e.message : String(e))
      log('error', lastError.value)
      return { ok: false, error: lastError.value }
    } finally {
      knowledgeRunning.value = false
    }
  }

  return {
    running,
    outlineRunning,
    knowledgeRunning,
    lastOutputs,
    lastOutlineOutputs,
    outlineProgress,
    lastError,
    consoleLines,
    log,
    generateChapter,
    generateOutline,
    generateKnowledge
  }
})
