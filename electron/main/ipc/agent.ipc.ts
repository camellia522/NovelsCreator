import { ipcMain } from 'electron'
import type {
  AssistantChatRequest,
  AssistantResumeRequest,
  AssistantSessionSnapshot
} from '../../src/types/api'
import {
  chatWithAssistant,
  clearAssistantThread,
  getAssistantPendingApproval,
  listAssistantSuggestions,
  loadAssistantSessionForProject,
  resumeAssistant,
  saveAssistantSessionForProject,
  streamChatWithAssistant,
  streamResumeAssistant
} from '../agent/novel-assistant.service'

export function registerAgentIpc(): void {
  ipcMain.handle('agent:chat', async (_e, req: AssistantChatRequest) => {
    return chatWithAssistant(req)
  })

  ipcMain.handle('agent:chatStream', async (event, req: AssistantChatRequest) => {
    return streamChatWithAssistant(req, (ev) => {
      event.sender.send('agent:streamEvent', ev)
    })
  })

  ipcMain.handle('agent:resumeStream', async (event, req: AssistantResumeRequest) => {
    return streamResumeAssistant(req, (ev) => {
      event.sender.send('agent:streamEvent', ev)
    })
  })

  ipcMain.handle('agent:resume', async (_e, req: AssistantResumeRequest) => {
    return resumeAssistant(req)
  })

  ipcMain.handle('agent:getPendingApproval', async (_e, projectId: string, threadId: string) => {
    return getAssistantPendingApproval(projectId, threadId)
  })

  ipcMain.handle('agent:clearThread', async (_e, projectId: string, threadId: string) => {
    await clearAssistantThread(projectId, threadId)
  })

  ipcMain.handle('agent:loadSession', async (_e, projectId: string) => {
    return loadAssistantSessionForProject(projectId)
  })

  ipcMain.handle(
    'agent:saveSession',
    async (_e, projectId: string, snapshot: AssistantSessionSnapshot) => {
      await saveAssistantSessionForProject(projectId, snapshot)
    }
  )

  ipcMain.handle('agent:listSuggestedActions', async (_e, projectId: string) => {
    return listAssistantSuggestions(projectId)
  })
}
