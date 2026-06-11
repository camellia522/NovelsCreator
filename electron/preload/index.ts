import { contextBridge, ipcRenderer } from 'electron'
import type { NovelsCreatorAPI, OutlineGenerationProgress, AssistantChatRequest, AssistantChatResponse, AssistantResumeRequest, AssistantSessionSnapshot, AssistantStreamEvent, AssistantSuggestion, SetAiAssistantPayload, SetAiEnginePayload, SetAiLocalPayload, TestAssistantLlmPayload } from '../../src/types/api'

function toWorldMapUrl(filePath: string): string {
  return `nc-map://${encodeURIComponent(filePath)}`
}
const api: NovelsCreatorAPI = {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    setDify: (dify) => ipcRenderer.invoke('config:setDify', dify),
    setAiEngine: (payload: SetAiEnginePayload) => ipcRenderer.invoke('config:setAiEngine', payload),
    setAiLocal: (payload: SetAiLocalPayload) => ipcRenderer.invoke('config:setAiLocal', payload),
    setAiAssistant: (payload: SetAiAssistantPayload) => ipcRenderer.invoke('config:setAiAssistant', payload),
    testAssistantLlm: (payload?: TestAssistantLlmPayload) =>
      ipcRenderer.invoke('config:testAssistantLlm', payload),
    testDify: (dify) => ipcRenderer.invoke('config:testDify', dify),
    setLayout: (layout) => ipcRenderer.invoke('config:setLayout', layout),
    setAppearance: (payload) => ipcRenderer.invoke('config:setAppearance', payload),
    setDefaultProjectsDir: (dir) => ipcRenderer.invoke('config:setDefaultProjectsDir', dir),
    clearWorkspaceLayout: () => ipcRenderer.invoke('config:clearWorkspaceLayout'),
    setAiOnboardingCompleted: (completed: boolean) =>
      ipcRenderer.invoke('config:setAiOnboardingCompleted', completed)
  },
  project: {
    create: (name, parentDir) => ipcRenderer.invoke('project:create', name, parentDir),
    open: (rootPath) => ipcRenderer.invoke('project:open', rootPath),
    close: () => ipcRenderer.invoke('project:close'),
    delete: (rootPath) => ipcRenderer.invoke('project:delete', rootPath),
    getCurrent: () => ipcRenderer.invoke('project:getCurrent'),
    pickDirectory: () => ipcRenderer.invoke('project:pickDirectory'),
    pickOpen: () => ipcRenderer.invoke('project:pickOpen'),
    getRecent: () => ipcRenderer.invoke('project:getRecent'),
    getOutline: () => ipcRenderer.invoke('project:getOutline'),
    saveOutline: (doc) => ipcRenderer.invoke('project:saveOutline', doc),
    getKnowledge: () => ipcRenderer.invoke('project:getKnowledge'),
    getMapImage: () => ipcRenderer.invoke('project:getMapImage') as Promise<string | null>,
    getMapImagePath: () => ipcRenderer.invoke('project:getMapImagePath') as Promise<string | null>,
    saveKnowledge: (doc) => ipcRenderer.invoke('project:saveKnowledge', doc),
    getPlotMemory: () => ipcRenderer.invoke('project:getPlotMemory'),
    savePlotMemory: (doc) => ipcRenderer.invoke('project:savePlotMemory', doc),
    getChapterText: (chapterId, kind) =>
      ipcRenderer.invoke('project:getChapterText', chapterId, kind),
    saveChapterText: (chapterId, kind, content) =>
      ipcRenderer.invoke('project:saveChapterText', chapterId, kind, content),
    backfillMissingSummaries: () => ipcRenderer.invoke('project:backfillMissingSummaries'),
    backfillChapterSummary: (chapterId: string) =>
      ipcRenderer.invoke('project:backfillChapterSummary', chapterId),
    scanAppearedCharacters: (chapterId: string, novelBody: string, memoryPatch?: unknown) =>
      ipcRenderer.invoke('project:scanAppearedCharacters', chapterId, novelBody, memoryPatch),
    promoteAppearedCharacters: (names: string[]) =>
      ipcRenderer.invoke('project:promoteAppearedCharacters', names),
    deleteChapterAssets: (chapterId: string) =>
      ipcRenderer.invoke('project:deleteChapterAssets', chapterId) as Promise<{
        ok: boolean
        deleted: boolean
      }>
  },
  ai: {
    generateChapter: (options) => ipcRenderer.invoke('ai:generateChapter', options),
    generateOutline: (options) => ipcRenderer.invoke('ai:generateOutline', options),
    generateKnowledge: (options) => ipcRenderer.invoke('ai:generateKnowledge', options),
    onOutlineProgress: (listener: (progress: OutlineGenerationProgress) => void) => {
      const handler = (_event: unknown, progress: OutlineGenerationProgress) => {
        listener(progress)
      }
      ipcRenderer.on('ai:outlineProgress', handler)
      return () => ipcRenderer.removeListener('ai:outlineProgress', handler)
    }
  },
  agent: {
    chat: (req: AssistantChatRequest) => ipcRenderer.invoke('agent:chat', req) as Promise<AssistantChatResponse>,
    chatStream: async (req: AssistantChatRequest, onEvent: (event: AssistantStreamEvent) => void) => {
      const handler = (_event: unknown, ev: AssistantStreamEvent) => onEvent(ev)
      ipcRenderer.on('agent:streamEvent', handler)
      try {
        return (await ipcRenderer.invoke('agent:chatStream', req)) as AssistantChatResponse
      } finally {
        ipcRenderer.removeListener('agent:streamEvent', handler)
      }
    },
    resumeStream: async (req: AssistantResumeRequest, onEvent: (event: AssistantStreamEvent) => void) => {
      const handler = (_event: unknown, ev: AssistantStreamEvent) => onEvent(ev)
      ipcRenderer.on('agent:streamEvent', handler)
      try {
        return (await ipcRenderer.invoke('agent:resumeStream', req)) as AssistantChatResponse
      } finally {
        ipcRenderer.removeListener('agent:streamEvent', handler)
      }
    },
    resume: (req: AssistantResumeRequest) => ipcRenderer.invoke('agent:resume', req) as Promise<AssistantChatResponse>,
    getPendingApproval: (projectId: string, threadId: string) =>
      ipcRenderer.invoke('agent:getPendingApproval', projectId, threadId) as Promise<
        AssistantChatResponse['pendingApproval']
      >,
    clearThread: (projectId: string, threadId: string) =>
      ipcRenderer.invoke('agent:clearThread', projectId, threadId),
    loadSession: (projectId: string) =>
      ipcRenderer.invoke('agent:loadSession', projectId) as Promise<AssistantSessionSnapshot | null>,
    saveSession: (projectId: string, snapshot: AssistantSessionSnapshot) =>
      ipcRenderer.invoke('agent:saveSession', projectId, snapshot),
    listSuggestedActions: (projectId: string) =>
      ipcRenderer.invoke('agent:listSuggestedActions', projectId) as Promise<AssistantSuggestion[]>,
    onProjectMutated: (listener: () => void) => {
      const handler = () => listener()
      ipcRenderer.on('agent:projectMutated', handler)
      return () => ipcRenderer.removeListener('agent:projectMutated', handler)
    }
  },
  dify: {
    generateChapter: (options) => ipcRenderer.invoke('dify:generateChapter', options),
    generateOutline: (options) => ipcRenderer.invoke('dify:generateOutline', options),
    generateKnowledge: (options) => ipcRenderer.invoke('dify:generateKnowledge', options),
    onOutlineProgress: (listener: (progress: OutlineGenerationProgress) => void) => {
      const handler = (_event: unknown, progress: OutlineGenerationProgress) => {
        listener(progress)
      }
      ipcRenderer.on('dify:outlineProgress', handler)
      return () => ipcRenderer.removeListener('dify:outlineProgress', handler)
    }
  },
  backup: {
    run: () => ipcRenderer.invoke('backup:run'),
    list: () => ipcRenderer.invoke('backup:list'),
    pickAndRestore: () => ipcRenderer.invoke('backup:pickAndRestore'),
    restore: (zipPath) => ipcRenderer.invoke('backup:restore', zipPath)
  },
  export: {
    chapter: (chapterId, exportType, format) =>
      ipcRenderer.invoke('export:chapter', chapterId, exportType, format),
    toProjectFolder: (chapterId) => ipcRenderer.invoke('export:toProjectFolder', chapterId),
    fullBook: (exportType, format) => ipcRenderer.invoke('export:fullBook', exportType, format)
  },
  world: {
    checkEngine: () => ipcRenderer.invoke('world:checkEngine'),
    generateNative: (config) =>
      ipcRenderer.invoke('world:generateNative', JSON.parse(JSON.stringify(config))),
    toLocalFileUrl: (filePath: string) => toWorldMapUrl(filePath),
    readMapFile: (filePath: string) => ipcRenderer.invoke('world:readMapFile', filePath),
    generateSociety: (req) => {
      const plain = JSON.parse(
        JSON.stringify({
          config: req.config,
          nations: req.nations,
          territoryBriefJson: req.territoryBriefJson
        })
      )
      return ipcRenderer.invoke('world:generateSociety', plain)
    }
  }
}

contextBridge.exposeInMainWorld('novelsCreator', api)
