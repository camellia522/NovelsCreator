import { randomUUID } from 'node:crypto'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages'
import { Command, isInterrupted } from '@langchain/langgraph'
import { PersistingMemorySaver } from './persisting-checkpointer'
import {
  clearAssistantSessionFiles,
  loadAssistantSession,
  recordAssistantChatTurn,
  resolveAssistantThreadId,
  saveAssistantSession
} from './assistant-session.store'
import { createMiddleware } from 'langchain'
import { createDeepAgent, registerHarnessProfile, StateBackend } from 'deepagents'
import { getAssistantLlmCredentials } from '../services/config.service'
import { getWorkflowRunner } from '../workflows/workflow-runner.factory'
import { loadAssistantSystemPrompt } from './prompts/assistant-system'
import { buildNovelAssistantTools } from './tools'
import { formatLlmError } from '../utils/llm-error'
import type {
  AssistantChatResponse,
  AssistantResumeRequest,
  AssistantStreamEvent,
  AssistantSessionSnapshot,
  AssistantSuggestion,
  AssistantToolActivityEvent
} from '../../src/types/api'
import { formatAssistantToolActivity, truncateAssistantPreview } from '../../../src/constants/assistant-tool-labels'

const sharedCheckpointer = new PersistingMemorySaver()
const agentCache = new Map<string, ReturnType<typeof createDeepAgent>>()

const HARNESS_FS_TOOLS_BLOCK = [
  'ls',
  'glob',
  'grep',
  'read_file',
  'write_file',
  'edit_file',
  'execute',
  'task'
] as const

let harnessProfilesRegistered = false

function ensureNovelAssistantHarnessProfiles(): void {
  if (harnessProfilesRegistered) return
  harnessProfilesRegistered = true
  const profile = { excludedTools: [...HARNESS_FS_TOOLS_BLOCK] }
  registerHarnessProfile('openai', profile)
  registerHarnessProfile('anthropic', profile)
}

/** 禁用 Harness 虚拟 FS / 子 agent；保留 write_todos 供计划展示 */
const BLOCKED_HARNESS_TOOLS = new Set<string>(HARNESS_FS_TOOLS_BLOCK)

const SUGGESTIONS: AssistantSuggestion[] = [
  { id: 'foreshadow', label: '检查伏笔', prompt: '有哪些尚未回收的伏笔？' },
  { id: 'chapter', label: '生成本章', prompt: '根据大纲，下一章可以怎么写？' },
  { id: 'outline', label: '大纲建议', prompt: '当前卷的大纲结构有什么可以改进的地方？' }
]

const APPROVAL_MESSAGE_RE = /^(同意|确认|好的|可以|批准|执行|写入|继续|是的|嗯|yes|ok|approve|y)$/i
const REJECT_MESSAGE_RE = /^(取消|不要|拒绝|算了|不行|否|no|reject|n)$/i

type HitlActionRequest = {
  name?: string
  args?: Record<string, unknown>
  description?: string
}

type HitlInterruptPayload = {
  actionRequests?: HitlActionRequest[]
  action_requests?: HitlActionRequest[]
}

function cacheKey(projectId: string, baseUrl: string, model: string): string {
  // 末尾版本号：变更 agent 配置时 bump，避免复用旧实例
  return `${projectId}:${baseUrl}:${model}:assistant-v10`
}

function createNovelAssistantToolFilterMiddleware() {
  return createMiddleware({
    name: '_NovelAssistantToolFilter',
    wrapModelCall: async (request, handler) => {
      const tools = request.tools?.filter((t) => !BLOCKED_HARNESS_TOOLS.has(String(t.name)))
      return handler({ ...request, tools })
    }
  })
}

async function getOrCreateAgent(projectId: string) {
  ensureNovelAssistantHarnessProfiles()
  const creds = await getAssistantLlmCredentials()
  if (!creds.apiKey) {
    throw new Error(
      '未配置助手 API Key。请在 设置 → AI → 小说助手 填写 OpenAI 兼容 API Key（与 Dify 工作流 Key 不同）。'
    )
  }

  const key = cacheKey(projectId, creds.baseUrl, creds.model)
  const existing = agentCache.get(key)
  if (existing) return existing

  const runner = await getWorkflowRunner()
  const model = new ChatOpenAI({
    model: creds.model,
    apiKey: creds.apiKey,
    configuration: { baseURL: creds.baseUrl }
  })

  const agent = createDeepAgent({
    model,
    tools: buildNovelAssistantTools({ projectId, runner }),
    middleware: [createNovelAssistantToolFilterMiddleware()],
    systemPrompt: await loadAssistantSystemPrompt(projectId),
    backend: () => new StateBackend(),
    checkpointer: sharedCheckpointer,
    permissions: [
      { operations: ['read'], paths: ['/large_tool_results/**'] },
      { operations: ['read', 'write', 'edit', 'glob', 'grep'], paths: ['/**'], mode: 'deny' }
    ],
    interruptOn: {
      read_chapter_text: false,
      read_character: false,
      write_chapter_text: true,
      patch_outline_chapter: true,
      patch_knowledge: true,
      update_character: true,
      update_characters: true,
      update_plot_memory: true,
      generate_chapter: true,
      generate_outline: true,
      generate_knowledge: true,
      generate_society: true
    }
  })

  agentCache.set(key, agent)
  return agent
}

function extractTextFromMessage(msg: unknown): string {
  if (!msg || typeof msg !== 'object') return ''
  const m = msg as { content?: unknown; _getType?: () => string }
  const type = m._getType?.() ?? (msg instanceof AIMessage ? 'ai' : '')
  if (type !== 'ai' && !(msg instanceof AIMessage)) return ''
  const content = m.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : 'text' in part ? String(part.text) : ''))
      .join('')
  }
  return ''
}

function extractStreamDelta(chunk: unknown): string {
  if (Array.isArray(chunk)) {
    return extractTextFromMessage(chunk[0])
  }
  return extractTextFromMessage(chunk)
}

function extractReply(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = extractTextFromMessage(messages[i])
    if (text) return text
  }
  return ''
}

function summarizeToolArgs(name: string, args: Record<string, unknown>): string {
  if (name === 'patch_outline_chapter') {
    const chapterId = args.chapterId ?? args.chapter_id
    const beats = args.beats
    const beatCount = Array.isArray(beats) ? beats.length : undefined
    const title = args.title
    const parts = [
      chapterId ? `章 ${chapterId}` : '',
      title ? `标题「${String(title).slice(0, 40)}」` : '',
      beatCount !== undefined ? `${beatCount} 个节拍` : ''
    ].filter(Boolean)
    return parts.join('，') || JSON.stringify(args).slice(0, 160)
  }
  if (name === 'generate_knowledge') {
    const brief = args.knowledge_brief ?? args.knowledgeBrief
    if (typeof brief === 'string' && brief.trim()) {
      const mode = args.generation_mode ?? args.generationMode ?? 'expand'
      return truncateAssistantPreview(`模式 ${mode} · ${brief.trim()}`)
    }
  }
  if (name === 'patch_knowledge') {
    const parts: string[] = []
    const chars = args.characters
    const factions = args.factions
    const items = args.items
    if (Array.isArray(chars) && chars.length) parts.push(`${chars.length} 人物`)
    if (Array.isArray(factions) && factions.length) parts.push(`${factions.length} 势力`)
    if (Array.isArray(items) && items.length) parts.push(`${items.length} 道具`)
    if (args.world && typeof args.world === 'object') parts.push('world')
    return parts.join('、') || 'knowledge.json'
  }
  if (name === 'update_characters') {
    const updates = args.updates
    if (Array.isArray(updates) && updates.length) {
      const ids = updates
        .map((u) => {
          const row = u as Record<string, unknown>
          return String(row.characterId ?? row.character_id ?? '')
        })
        .filter(Boolean)
      const head = ids.slice(0, 4).join(', ')
      return `${updates.length} 人${head ? `：${head}` : ''}${ids.length > 4 ? '…' : ''}`
    }
  }
  if (name === 'update_character') {
    const id = args.characterId ?? args.character_id
    const n = args.name
    return [id, n].filter(Boolean).join(' · ') || '单人物'
  }
  const json = JSON.stringify(args)
  return truncateAssistantPreview(json)
}

function describeActionRequest(req: HitlActionRequest): string {
  if (req.name && req.args && typeof req.args === 'object') {
    return truncateAssistantPreview(summarizeToolArgs(req.name, req.args))
  }
  if (req.description?.trim()) {
    return truncateAssistantPreview(req.description.trim())
  }
  return req.name ?? ''
}

function extractHitlActionRequestsFromPayload(value: unknown): HitlActionRequest[] {
  if (!value || typeof value !== 'object') return []
  const payload = value as HitlInterruptPayload
  const requests = payload.actionRequests ?? payload.action_requests
  if (!Array.isArray(requests)) return []
  return requests.filter((r): r is HitlActionRequest => Boolean(r?.name))
}

function extractHitlActionRequests(source: unknown): HitlActionRequest[] {
  if (!source || typeof source !== 'object') return []
  const record = source as Record<string, unknown>

  if (isInterrupted(record)) {
    const all: HitlActionRequest[] = []
    for (const intr of record.__interrupt__ ?? []) {
      const batch = extractHitlActionRequestsFromPayload(
        (intr as { value?: unknown })?.value
      )
      if (batch.length) all.push(...batch)
    }
    if (all.length) return all
  }

  const tasks = record.tasks as Array<{ interrupts?: Array<{ value?: unknown }> }> | undefined
  if (tasks?.length) {
    const all: HitlActionRequest[] = []
    for (const task of tasks) {
      for (const intr of task.interrupts ?? []) {
        const batch = extractHitlActionRequestsFromPayload(intr.value)
        if (batch.length) all.push(...batch)
      }
    }
    if (all.length) return all
  }

  const values = record.values
  if (values && typeof values === 'object') {
    return extractHitlActionRequests(values)
  }

  return []
}

function buildPendingApproval(
  requests: HitlActionRequest[]
): AssistantChatResponse['pendingApproval'] | undefined {
  if (!requests.length) return undefined
  const items = requests.map((req) => ({
    toolName: req.name!,
    description: describeActionRequest(req)
  }))
  if (items.length === 1) {
    return { ...items[0], count: 1, items }
  }
  const uniqueTools = [...new Set(items.map((i) => i.toolName))]
  const toolName = uniqueTools.length === 1 ? uniqueTools[0] : 'batch'
  const summary = uniqueTools
    .map((t) => {
      const n = items.filter((i) => i.toolName === t).length
      return n > 1 ? `${t} ×${n}` : t
    })
    .join('、')
  return {
    toolName,
    description: `${items.length} 项待确认：${summary}`,
    count: items.length,
    items
  }
}

function parseHitlInterruptValue(value: unknown): AssistantChatResponse['pendingApproval'] | undefined {
  return buildPendingApproval(extractHitlActionRequestsFromPayload(value))
}

function extractPendingApproval(source: unknown): AssistantChatResponse['pendingApproval'] | undefined {
  return buildPendingApproval(extractHitlActionRequests(source))
}

function buildHitlDecisions(approved: boolean, count: number): Array<
  | { type: 'approve' }
  | { type: 'reject'; message: string }
> {
  const n = Math.max(1, count)
  return Array.from({ length: n }, () =>
    approved
      ? { type: 'approve' as const }
      : {
          type: 'reject' as const,
          message: '用户已取消该操作，请勿重试除非用户明确要求。'
        }
  )
}

async function getPendingActionRequestsForThread(
  agent: ReturnType<typeof createDeepAgent>,
  threadId: string
): Promise<HitlActionRequest[]> {
  const state = await agent.getState({ configurable: { thread_id: threadId } })
  const fromState = extractHitlActionRequests(state)
  if (fromState.length) return fromState
  return extractHitlActionRequests(state.values)
}

async function getPendingApprovalForThread(
  agent: ReturnType<typeof createDeepAgent>,
  threadId: string
): Promise<AssistantChatResponse['pendingApproval'] | undefined> {
  const requests = await getPendingActionRequestsForThread(agent, threadId)
  return buildPendingApproval(requests)
}

async function maybeResumeFromChatMessage(
  agent: ReturnType<typeof createDeepAgent>,
  projectId: string,
  threadId: string | undefined,
  message: string,
  onEvent?: StreamHandler
): Promise<AssistantChatResponse | null> {
  if (!threadId) return null
  const trimmed = message.trim()
  const approved = APPROVAL_MESSAGE_RE.test(trimmed)
  const rejected = REJECT_MESSAGE_RE.test(trimmed)
  if (!approved && !rejected) return null

  const pending = await getPendingApprovalForThread(agent, threadId)
  if (!pending) return null

  const res = await streamResumeAssistant({ threadId, projectId, approved }, onEvent)
  return { ...res, hitlResumed: true }
}

type ToolStreamPayload = {
  event: 'on_tool_start' | 'on_tool_end' | 'on_tool_error' | 'on_tool_event'
  toolCallId?: string
  name: string
  input?: unknown
  output?: unknown
  error?: unknown
}

type StreamHandler = (event: AssistantStreamEvent) => void

function parseAgentStreamChunk(chunk: unknown): { messageDelta?: string; tool?: ToolStreamPayload } {
  if (Array.isArray(chunk)) {
    let mode: string | undefined
    let data: unknown

    if (typeof chunk[0] === 'string' && ['messages', 'tools', 'values', 'updates'].includes(chunk[0])) {
      mode = chunk[0]
      data = chunk[1]
    } else if (chunk.length >= 3 && typeof chunk[1] === 'string') {
      mode = chunk[1]
      data = chunk[2]
    } else {
      const delta = extractStreamDelta(chunk)
      return delta ? { messageDelta: delta } : {}
    }

    if (mode === 'messages') {
      const delta = extractStreamDelta(data)
      return delta ? { messageDelta: delta } : {}
    }
    if (mode === 'tools' && data && typeof data === 'object' && 'event' in data) {
      return { tool: data as ToolStreamPayload }
    }
    return {}
  }

  const delta = extractStreamDelta(chunk)
  return delta ? { messageDelta: delta } : {}
}

function emitToolActivity(
  threadId: string,
  payload: ToolStreamPayload,
  onEvent?: StreamHandler
): void {
  if (!onEvent) return
  const phase =
    payload.event === 'on_tool_start'
      ? 'start'
      : payload.event === 'on_tool_end'
        ? 'end'
        : payload.event === 'on_tool_error'
          ? 'error'
          : undefined
  if (!phase) return

  const formatted = formatAssistantToolActivity(
    payload.name,
    payload.input ?? (phase === 'end' ? {} : undefined),
    phase
  )
  const detailFromError =
    phase === 'error' && payload.error != null
      ? String(payload.error).slice(0, 160)
      : undefined
  const event: AssistantToolActivityEvent = {
    threadId,
    kind: 'tool',
    phase,
    toolCallId: payload.toolCallId,
    toolName: payload.name,
    label: formatted.label,
    detail: detailFromError ?? (formatted.detail || undefined),
    fileHint: formatted.fileHint
  }
  onEvent(event)
}

function emitWaitingApproval(
  threadId: string,
  pending: { toolName: string; description: string },
  onEvent?: StreamHandler
): void {
  if (!onEvent) return
  const formatted = formatAssistantToolActivity(pending.toolName, pending.description, 'waiting')
  onEvent({
    threadId,
    kind: 'tool',
    phase: 'waiting',
    toolName: pending.toolName,
    label: formatted.label,
    detail: pending.description || formatted.detail,
    fileHint: formatted.fileHint
  })
}

function emitWaitingApprovals(
  threadId: string,
  pending: NonNullable<AssistantChatResponse['pendingApproval']>,
  onEvent?: StreamHandler
): void {
  if (!onEvent) return
  const items = pending.items?.length ? pending.items : [pending]
  for (const item of items) {
    emitWaitingApproval(threadId, item, onEvent)
  }
}

async function consumeAgentStream(
  agent: ReturnType<typeof createDeepAgent>,
  input: Parameters<ReturnType<typeof createDeepAgent>['stream']>[0],
  threadId: string,
  onEvent?: StreamHandler
): Promise<AssistantChatResponse> {
  const stream = await agent.stream(input, {
    configurable: { thread_id: threadId },
    streamMode: ['messages', 'tools']
  })

  for await (const chunk of stream) {
    const parsed = parseAgentStreamChunk(chunk)
    if (parsed.messageDelta && onEvent) {
      onEvent({ threadId, kind: 'text', delta: parsed.messageDelta })
    }
    if (parsed.tool) {
      emitToolActivity(threadId, parsed.tool, onEvent)
    }
  }

  const state = await agent.getState({ configurable: { thread_id: threadId } })
  const values = (state.values ?? {}) as Record<string, unknown>
  const messages = (values.messages ?? []) as BaseMessage[]
  const pendingApproval =
    extractPendingApproval(state) ?? extractPendingApproval(state.values) ?? extractPendingApproval(values)
  if (pendingApproval) {
    emitWaitingApprovals(threadId, pendingApproval, onEvent)
  }
  return {
    ok: true,
    threadId,
    reply: extractReply(messages),
    pendingApproval
  }
}

async function runAssistantTurn(
  agent: ReturnType<typeof createDeepAgent>,
  threadId: string,
  message: string,
  onEvent?: StreamHandler
): Promise<AssistantChatResponse> {
  if (onEvent) {
    return consumeAgentStream(
      agent,
      { messages: [new HumanMessage(message)] },
      threadId,
      onEvent
    )
  }

  const result = await agent.invoke(
    { messages: [new HumanMessage(message)] },
    { configurable: { thread_id: threadId } }
  )
  const messages = (result.messages ?? []) as BaseMessage[]
  const state = await agent.getState({ configurable: { thread_id: threadId } })
  const pendingApproval =
    extractPendingApproval(result) ??
    extractPendingApproval(state) ??
    extractPendingApproval(state.values)
  return {
    ok: true,
    threadId,
    reply: extractReply(messages),
    pendingApproval
  }
}

async function persistAssistantTurn(
  projectId: string,
  threadId: string | undefined,
  userMessage: string | undefined,
  response: AssistantChatResponse
): Promise<AssistantChatResponse> {
  if (threadId) {
    try {
      await recordAssistantChatTurn(projectId, threadId, userMessage, response)
    } catch (err) {
      console.warn('[assistant-session] record turn failed:', err)
    }
  }
  return response
}

export async function chatWithAssistant(req: {
  message: string
  projectId: string
  threadId?: string
}): Promise<AssistantChatResponse> {
  let threadId: string | undefined
  try {
    const agent = await getOrCreateAgent(req.projectId)
    threadId =
      (await resolveAssistantThreadId(req.projectId, req.threadId)) ?? randomUUID()
    const resumed = await maybeResumeFromChatMessage(agent, req.projectId, threadId, req.message)
    if (resumed) {
      return persistAssistantTurn(req.projectId, resumed.threadId ?? threadId, req.message, resumed)
    }
    const res = await runAssistantTurn(agent, threadId, req.message)
    return persistAssistantTurn(req.projectId, res.threadId ?? threadId, req.message, res)
  } catch (err) {
    const creds = await getAssistantLlmCredentials().catch(() => ({ baseUrl: '' }))
    const res: AssistantChatResponse = {
      ok: false,
      error: formatLlmError(err, creds.baseUrl)
    }
    return persistAssistantTurn(req.projectId, threadId, req.message, res)
  }
}

export async function streamChatWithAssistant(
  req: { message: string; projectId: string; threadId?: string },
  onEvent: StreamHandler
): Promise<AssistantChatResponse> {
  let threadId: string | undefined
  try {
    const agent = await getOrCreateAgent(req.projectId)
    threadId =
      (await resolveAssistantThreadId(req.projectId, req.threadId)) ?? randomUUID()
    const resumed = await maybeResumeFromChatMessage(
      agent,
      req.projectId,
      threadId,
      req.message,
      onEvent
    )
    if (resumed) {
      return persistAssistantTurn(req.projectId, resumed.threadId ?? threadId, req.message, resumed)
    }
    const res = await runAssistantTurn(agent, threadId, req.message, onEvent)
    return persistAssistantTurn(req.projectId, res.threadId ?? threadId, req.message, res)
  } catch (err) {
    const creds = await getAssistantLlmCredentials().catch(() => ({ baseUrl: '' }))
    const res: AssistantChatResponse = {
      ok: false,
      error: formatLlmError(err, creds.baseUrl)
    }
    return persistAssistantTurn(req.projectId, threadId, req.message, res)
  }
}

export async function getAssistantPendingApproval(
  projectId: string,
  threadId: string
): Promise<AssistantChatResponse['pendingApproval']> {
  const agent = await getOrCreateAgent(projectId)
  return (await getPendingApprovalForThread(agent, threadId)) ?? undefined
}

export async function resumeAssistant(req: AssistantResumeRequest): Promise<AssistantChatResponse> {
  return streamResumeAssistant(req)
}

export async function streamResumeAssistant(
  req: AssistantResumeRequest,
  onEvent?: StreamHandler
): Promise<AssistantChatResponse> {
  try {
    const agent = await getOrCreateAgent(req.projectId)
    const config = { configurable: { thread_id: req.threadId } }
    const requests = await getPendingActionRequestsForThread(agent, req.threadId)
    if (!requests.length) {
      const res: AssistantChatResponse = {
        ok: false,
        error: '当前会话没有待确认的操作（可能已执行或已过期，请清空对话后重试）。',
        pendingApproval: undefined
      }
      return persistAssistantTurn(req.projectId, req.threadId, undefined, res)
    }

    const decisions = buildHitlDecisions(req.approved, requests.length)

    if (onEvent) {
      const res = await consumeAgentStream(
        agent,
        new Command({ resume: { decisions } }),
        req.threadId,
        onEvent
      )
      return persistAssistantTurn(req.projectId, req.threadId, undefined, res)
    }

    const result = await agent.invoke(new Command({ resume: { decisions } }), config)
    const messages = (result.messages ?? []) as BaseMessage[]
    const state = await agent.getState(config)
    const nextPending =
      extractPendingApproval(result) ??
      extractPendingApproval(state) ??
      extractPendingApproval(state.values)
    const res: AssistantChatResponse = {
      ok: true,
      threadId: req.threadId,
      reply: extractReply(messages),
      pendingApproval: nextPending
    }
    return persistAssistantTurn(req.projectId, req.threadId, undefined, res)
  } catch (err) {
    const creds = await getAssistantLlmCredentials().catch(() => ({ baseUrl: '' }))
    const res: AssistantChatResponse = {
      ok: false,
      error: formatLlmError(err, creds.baseUrl)
    }
    return persistAssistantTurn(req.projectId, req.threadId, undefined, res)
  }
}

export async function loadAssistantSessionForProject(
  projectId: string
): Promise<AssistantSessionSnapshot | null> {
  return loadAssistantSession(projectId)
}

export async function saveAssistantSessionForProject(
  projectId: string,
  snapshot: AssistantSessionSnapshot
): Promise<void> {
  await saveAssistantSession(projectId, snapshot)
}

export async function clearAssistantThread(projectId: string, threadId: string): Promise<void> {
  await clearAssistantSessionFiles(projectId)
  await sharedCheckpointer.deleteThread(threadId)
}

export function listAssistantSuggestions(_projectId: string): AssistantSuggestion[] {
  return SUGGESTIONS
}

/** 清除 agent 实例缓存（配置变更后调用） */
export function invalidateAssistantCache(): void {
  agentCache.clear()
}
