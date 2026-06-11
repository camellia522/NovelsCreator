import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { AssistantChatResponse, AssistantSessionSnapshot } from '../../src/types/api'
import { writeJsonAtomic } from '../utils/atomic-json-write'

const SESSION_VERSION = 1

function sessionDir(projectId: string): string {
  return join(app.getPath('userData'), 'assistant-sessions', projectId)
}

function transcriptPath(projectId: string): string {
  return join(sessionDir(projectId), 'transcript.json')
}

export async function loadAssistantSession(
  projectId: string
): Promise<AssistantSessionSnapshot | null> {
  try {
    const raw = JSON.parse(await readFile(transcriptPath(projectId), 'utf-8')) as {
      version?: number
      threadId?: string
      messages?: AssistantSessionSnapshot['messages']
    }
    if (!raw.threadId || !Array.isArray(raw.messages)) return null
    return {
      threadId: raw.threadId,
      messages: raw.messages
    }
  } catch {
    return null
  }
}

export async function saveAssistantSession(
  projectId: string,
  snapshot: AssistantSessionSnapshot
): Promise<void> {
  await writeJsonAtomic(transcriptPath(projectId), {
    version: SESSION_VERSION,
    projectId,
    threadId: snapshot.threadId,
    messages: snapshot.messages,
    updatedAt: new Date().toISOString()
  })
}

function lastMessageMatches(
  messages: AssistantSessionSnapshot['messages'],
  role: 'user' | 'assistant' | 'error',
  content: string
): boolean {
  const last = messages[messages.length - 1]
  return last?.role === role && last.content === content
}

/** Main 进程在每次对话/恢复后追加 transcript（不依赖 renderer saveSession） */
export async function recordAssistantChatTurn(
  projectId: string,
  threadId: string,
  userMessage: string | undefined,
  response: AssistantChatResponse
): Promise<void> {
  const existing = await loadAssistantSession(projectId)
  const messages: AssistantSessionSnapshot['messages'] =
    existing?.threadId === threadId ? [...existing.messages] : []

  const userText = userMessage?.trim()
  if (userText && !lastMessageMatches(messages, 'user', userText)) {
    messages.push({ role: 'user', content: userText })
  }

  if (response.ok && response.reply?.trim()) {
    const reply = response.reply.trim()
    if (!lastMessageMatches(messages, 'assistant', reply)) {
      messages.push({ role: 'assistant', content: reply })
    }
  } else if (!response.ok && response.error?.trim()) {
    const errText = response.error.trim()
    if (!lastMessageMatches(messages, 'error', errText)) {
      messages.push({ role: 'error', content: errText })
    }
  }

  if (!messages.length) return

  await saveAssistantSession(projectId, { threadId, messages })
}

export async function clearAssistantSessionFiles(projectId: string): Promise<void> {
  await rm(sessionDir(projectId), { recursive: true, force: true })
}

/** 打开项目时解析应沿用的 threadId（无存档则返回 undefined） */
export async function resolveAssistantThreadId(
  projectId: string,
  requested?: string
): Promise<string | undefined> {
  if (requested) return requested
  const session = await loadAssistantSession(projectId)
  return session?.threadId
}
