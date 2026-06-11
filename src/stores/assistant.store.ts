import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  AssistantActivityStep,
  AssistantChatResponse,
  AssistantStreamEvent,
  AssistantSuggestion
} from '@/types/api'
import { useProjectStore } from '@/stores/project.store'
import { useOutlineStore } from '@/stores/outline.store'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useMemoryStore } from '@/stores/memory.store'
import { useEditorStore } from '@/stores/editor.store'

export interface AssistantMessage {
  role: 'user' | 'assistant' | 'error'
  content: string
  activities?: AssistantActivityStep[]
}

type AssistantPendingApproval = NonNullable<AssistantChatResponse['pendingApproval']>

function makeActivityId(toolCallId: string | undefined, toolName: string, index: number): string {
  return toolCallId ?? `${toolName}-${index}-${Date.now()}`
}

function applyStreamEvent(
  activities: AssistantActivityStep[],
  event: AssistantStreamEvent
): void {
  if (event.kind !== 'tool') return

  const status =
    event.phase === 'start'
      ? 'running'
      : event.phase === 'end'
        ? 'done'
        : event.phase === 'error'
          ? 'error'
          : 'waiting'

  if (event.toolCallId) {
    const byId = activities.findIndex((a) => a.id === event.toolCallId)
    if (byId >= 0) {
      const step = activities[byId]
      step.status = status
      step.label = event.label
      if (event.detail) step.detail = event.detail
      if (event.fileHint) step.fileHint = event.fileHint
      return
    }
  }

  const activeIdx = activities.findIndex(
    (a) =>
      a.toolName === event.toolName && (a.status === 'running' || a.status === 'waiting')
  )
  if (activeIdx >= 0) {
    const step = activities[activeIdx]
    const sameWaitingBatch =
      status !== 'waiting' ||
      step.status !== 'waiting' ||
      !event.detail ||
      step.detail === event.detail
    if (sameWaitingBatch) {
      step.status = status
      step.label = event.label
      if (event.detail) step.detail = event.detail
      if (event.fileHint) step.fileHint = event.fileHint
      if (event.toolCallId) step.id = event.toolCallId
      return
    }
  }

  activities.push({
    id: makeActivityId(event.toolCallId, event.toolName, activities.length),
    toolName: event.toolName,
    label: event.label,
    detail: event.detail,
    fileHint: event.fileHint,
    status
  })
}

function finalizeActivities(
  activities: AssistantActivityStep[],
  pendingToolName?: string
): void {
  for (const step of activities) {
    if (step.status === 'running' && pendingToolName && step.toolName === pendingToolName) {
      step.status = 'waiting'
      if (!step.label.includes('等待确认')) {
        step.label = `等待确认 · ${step.label.replace(/^(调用|写入|读取)\s*/, '')}`
      }
      continue
    }
    if (step.status === 'waiting' && pendingToolName && step.toolName === pendingToolName) {
      continue
    }
    if (step.status === 'running' || step.status === 'waiting') {
      step.status = 'error'
      if (!step.label.startsWith('已中断') && !step.label.startsWith('失败')) {
        step.label = `已中断 · ${step.label}`
      }
    }
  }
}

export const useAssistantStore = defineStore('assistant', () => {
  const threadId = ref<string | undefined>()
  const messages = ref<AssistantMessage[]>([])
  const suggestions = ref<AssistantSuggestion[]>([])
  const loading = ref(false)
  const isStreaming = ref(false)
  const pendingApproval = ref<AssistantPendingApproval | undefined>()
  const liveActivities = ref<AssistantActivityStep[]>([])

  async function syncPendingApprovalFromThread(
    projectId: string,
    id: string | undefined
  ): Promise<AssistantPendingApproval | undefined> {
    if (!id || !window.novelsCreator?.agent?.getPendingApproval) return undefined
    const value = await window.novelsCreator.agent.getPendingApproval(projectId, id)
    pendingApproval.value = value
    return value
  }

  async function reloadProjectDataAfterAssistant(): Promise<void> {
    const outline = useOutlineStore()
    const knowledge = useKnowledgeStore()
    const memory = useMemoryStore()
    const editor = useEditorStore()
    await Promise.all([outline.load(), knowledge.load(), memory.load(), editor.reloadOpenTabsFromDisk()])
  }

  function bindProjectMutatedListener(): () => void {
    if (!window.novelsCreator?.agent?.onProjectMutated) return () => {}
    return window.novelsCreator.agent.onProjectMutated(() => {
      void reloadProjectDataAfterAssistant()
    })
  }

  async function persistSession(): Promise<void> {
    const project = useProjectStore().current
    if (!project || !messages.value.length || !window.novelsCreator?.agent?.saveSession) return
    const tid = threadId.value
    if (!tid) return
    try {
      await window.novelsCreator.agent.saveSession(project.id, {
        threadId: tid,
        messages: messages.value.map((m) => ({
          role: m.role,
          content: m.content,
          activities: m.activities?.map((a) => ({ ...a }))
        }))
      })
    } catch (err) {
      console.warn('[assistant] persistSession failed:', err)
    }
  }

  async function loadSessionForProject(): Promise<void> {
    const project = useProjectStore().current
    if (!project?.id || !window.novelsCreator?.agent?.loadSession) return
    const session = await window.novelsCreator.agent.loadSession(project.id)
    if (!session) {
      threadId.value = undefined
      messages.value = []
      pendingApproval.value = undefined
      liveActivities.value = []
      void loadSuggestions()
      return
    }
    threadId.value = session.threadId
    messages.value = session.messages.map((m) => ({
      role: m.role,
      content: m.content,
      activities: m.activities ? [...m.activities] : undefined
    }))
    pendingApproval.value = undefined
    liveActivities.value = []
    await syncPendingApprovalFromThread(project.id, session.threadId)
    void loadSuggestions()
  }

  async function loadSuggestions(): Promise<void> {
    const project = useProjectStore().current
    if (!project || !window.novelsCreator?.agent) return
    suggestions.value = await window.novelsCreator.agent.listSuggestedActions(project.id)
  }

  function handleStreamEvent(event: AssistantStreamEvent, assistantIdx: number): void {
    if (event.threadId) threadId.value = event.threadId
    if (event.kind === 'text') {
      const msg = messages.value[assistantIdx]
      if (msg?.role === 'assistant') {
        msg.content += event.delta
      }
      return
    }
    applyStreamEvent(liveActivities.value, event)
    const msg = messages.value[assistantIdx]
    if (msg?.role === 'assistant') {
      if (!msg.activities) msg.activities = []
      applyStreamEvent(msg.activities, event)
    }
  }

  async function send(message: string): Promise<void> {
    const project = useProjectStore().current
    if (!project || !window.novelsCreator?.agent) {
      messages.value.push({ role: 'error', content: '请先打开项目' })
      return
    }
    const text = message.trim()
    if (!text) return

    messages.value.push({ role: 'user', content: text })
    loading.value = true
    isStreaming.value = Boolean(window.novelsCreator.agent.chatStream)
    pendingApproval.value = undefined
    liveActivities.value = []
    const assistantIdx = messages.value.length
    messages.value.push({ role: 'assistant', content: '', activities: [] })
    try {
      const res = window.novelsCreator.agent.chatStream
        ? await window.novelsCreator.agent.chatStream(
            {
              message: text,
              projectId: project.id,
              threadId: threadId.value
            },
            (event) => handleStreamEvent(event, assistantIdx)
          )
        : await window.novelsCreator.agent.chat({
            message: text,
            projectId: project.id,
            threadId: threadId.value
          })
      if (res.threadId) threadId.value = res.threadId
      if (!res.ok) {
        messages.value.splice(assistantIdx, 1)
        messages.value.push({ role: 'error', content: res.error ?? '助手请求失败' })
        return
      }
      const msg = messages.value[assistantIdx]
      if (msg?.role === 'assistant' && res.reply && !msg.content.trim()) {
        msg.content = res.reply
      } else if (msg?.role === 'assistant' && res.reply && res.reply.length > msg.content.length) {
        msg.content = res.reply
      }
      if (msg?.role === 'assistant' && !msg.content.trim() && !msg.activities?.length) {
        messages.value.splice(assistantIdx, 1)
      }
      pendingApproval.value = res.pendingApproval
      if (threadId.value) {
        await syncPendingApprovalFromThread(project.id, threadId.value)
      }
      if (res.hitlResumed && res.ok) {
        await reloadProjectDataAfterAssistant()
      }
    } catch (e) {
      const msg = messages.value[assistantIdx]
      if (msg?.role === 'assistant' && !msg.content.trim() && !msg.activities?.length) {
        messages.value.splice(assistantIdx, 1)
      }
      messages.value.push({
        role: 'error',
        content: e instanceof Error ? e.message : String(e)
      })
    } finally {
      const msg = messages.value[assistantIdx]
      const pendingTool = pendingApproval.value?.toolName
      if (msg?.activities?.length) finalizeActivities(msg.activities, pendingTool)
      finalizeActivities(liveActivities.value, pendingTool)
      loading.value = false
      isStreaming.value = false
      liveActivities.value = []
      await persistSession()
    }
  }

  async function resume(approved: boolean): Promise<void> {
    const project = useProjectStore().current
    if (!project || !threadId.value || !window.novelsCreator?.agent) return

    await syncPendingApprovalFromThread(project.id, threadId.value)
    const pending = pendingApproval.value
    if (!pending) {
      messages.value.push({
        role: 'error',
        content: '当前没有待确认操作（可能已执行完毕）。请清空对话后继续，或重新发送指令。'
      })
      return
    }
    const handled: AssistantPendingApproval = pending

    pendingApproval.value = undefined

    loading.value = true
    isStreaming.value = Boolean(window.novelsCreator.agent.resumeStream)
    liveActivities.value = []
    const assistantIdx = messages.value.length
    messages.value.push({ role: 'assistant', content: '', activities: [] })
    try {
      const res = window.novelsCreator.agent.resumeStream
        ? await window.novelsCreator.agent.resumeStream(
            {
              threadId: threadId.value,
              projectId: project.id,
              approved
            },
            (event) => handleStreamEvent(event, assistantIdx)
          )
        : await window.novelsCreator.agent.resume({
            threadId: threadId.value,
            projectId: project.id,
            approved
          })

      if (res.pendingApproval) {
        pendingApproval.value = res.pendingApproval
      } else if (threadId.value) {
        const next = await syncPendingApprovalFromThread(project.id, threadId.value)
        if (
          next &&
          next.toolName === handled.toolName &&
          next.description === handled.description &&
          (next.count ?? 1) === (handled.count ?? 1)
        ) {
          pendingApproval.value = undefined
        }
      }

      if (approved && res.ok) {
        await reloadProjectDataAfterAssistant()
      }
      const msg = messages.value[assistantIdx]
      if (msg?.role === 'assistant') {
        if (res.reply) msg.content = res.reply
        if (!msg.content.trim() && !msg.activities?.length) {
          messages.value.splice(assistantIdx, 1)
        }
      }
      if (!res.ok && res.error) {
        messages.value.push({ role: 'error', content: res.error })
        pendingApproval.value = undefined
      }
    } finally {
      const msg = messages.value[assistantIdx]
      const pendingTool = pendingApproval.value?.toolName
      if (msg?.activities?.length) finalizeActivities(msg.activities, pendingTool)
      finalizeActivities(liveActivities.value, pendingTool)
      loading.value = false
      isStreaming.value = false
      liveActivities.value = []
      await persistSession()
    }
  }

  async function clearThread(): Promise<void> {
    const project = useProjectStore().current
    if (project && threadId.value && window.novelsCreator?.agent) {
      await window.novelsCreator.agent.clearThread(project.id, threadId.value)
    }
    threadId.value = undefined
    messages.value = []
    pendingApproval.value = undefined
    liveActivities.value = []
  }

  function resetForProject(): void {
    void loadSessionForProject()
  }

  return {
    threadId,
    messages,
    suggestions,
    loading,
    isStreaming,
    pendingApproval,
    liveActivities,
    loadSuggestions,
    loadSessionForProject,
    send,
    resume,
    clearThread,
    resetForProject,
    reloadProjectDataAfterAssistant,
    bindProjectMutatedListener
  }
})
