import type { AppearedCharacterEntry } from './project'
import type { DifyWorkflowKeys, DifyWorkflowSlot } from '@/constants/dify-workflows'

export interface ScanAppearedResult {
  newNames: string[]
  newCount: number
  pendingCount: number
  appearedCharacters: AppearedCharacterEntry[]
}

export type WorkflowStatus = 'success' | 'retry' | 'circuit_break' | 'error'

export interface OutlineValidationIssue {
  severity?: string
  location?: string
  message?: string
}

export interface ValidationReport {
  outline_valid?: boolean
  lore_valid?: boolean
  /** 章节工作流 */
  issues?: string[]
  /** 大纲 O2 结构化校验 */
  outline_issues?: OutlineValidationIssue[]
  structure_score?: number
  beat_quality_score?: number
  lore_consistency_score?: number
  chapter_count_ok?: boolean
  volume_balance_ok?: boolean
}

export interface MemoryPatch {
  chapterSummary?: Record<string, unknown>
  globalSummaryDelta?: string
  foreshadowingUpdates?: unknown[]
}

export interface MemoryUpdateInfo {
  chapterId: string
  globalDeltaAdded: boolean
  chapterSummaryUpdated: boolean
  foreshadowingChanged: number
}

export interface WorkflowOutputs {
  status: WorkflowStatus
  circuit_break?: boolean
  human_action_required?: boolean
  retry_count: number
  novel_body?: string
  video_script?: string
  draft_text?: string
  retry_issues_formatted?: string
  retry_issues?: string
  memory_patch?: MemoryPatch | string
  validation_report?: ValidationReport | string
  workflow_version?: string
}

export interface ChapterGenerateInputs {
  project_id: string
  chapter_id: string
  chapter_title: string
  outline_beats: string
  knowledge_snapshot: string
  plot_memory: string
  previous_chapter_summary?: string
  video_platform_template: string
  max_retry: number
  generation_prompt?: string
  generation_prompt_text?: string
  retry_count?: number
  retry_issues_formatted?: string
  /** Dify START 部分画布使用 retry_issues（JSON 数组字符串），与 formatted 并存 */
  retry_issues?: string
  estimated_duration_sec?: number
  video_template_config?: string
}

export interface DifyAppConfig {
  baseUrl: string
  apiKey: string
}

/** 各工作流独立 API Key（明文仅存在于加密 secrets 文件） */
export interface DifyWorkflowKeyPublic {
  /** 已配置时为 ********，否则空串 */
  apiKey: string
  configured: boolean
}

export interface DifySettingsPublic {
  baseUrl: string
  workflows: Record<DifyWorkflowSlot, DifyWorkflowKeyPublic>
}

export interface SetDifyConfigPayload {
  baseUrl: string
  workflows: Partial<DifyWorkflowKeys>
}

export interface TestDifyPayload {
  slot?: DifyWorkflowSlot
  baseUrl?: string
  apiKey?: string
}

export type AiEngineId = 'dify' | 'local'

export interface AiLocalConfigPublic {
  baseUrl: string
  model: string
  reasoningModel?: string
  /** 已配置时为 ******** */
  apiKey: string
  configured: boolean
}

export interface AiAssistantConfigPublic {
  model: string
  baseUrl: string
  /** 已配置时为 ******** */
  apiKey: string
  configured: boolean
}

export interface AiSettingsPublic {
  engine: AiEngineId
  onboardingCompleted?: boolean
  local?: AiLocalConfigPublic
  assistant?: AiAssistantConfigPublic
}

export interface SetAiEnginePayload {
  engine: AiEngineId
}

export interface SetAiLocalPayload {
  baseUrl: string
  model: string
  reasoningModel?: string
  apiKey?: string
}

export interface SetAiAssistantPayload {
  model?: string
  baseUrl?: string
  apiKey?: string
}

export interface TestAssistantLlmPayload {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export interface AppConfig {
  dify: Pick<DifyAppConfig, 'baseUrl'>
  ai?: {
    engine: AiEngineId
    onboardingCompleted?: boolean
    local?: {
      baseUrl: string
      model: string
      reasoningModel?: string
    }
    assistant?: {
      model?: string
      baseUrl?: string
    }
    /** 用户曾清空 API Key 时为 true，不再使用打包内置的环境变量 Key */
    llmKeyCleared?: boolean
  }
  recentProjects: string[]
  defaultProjectsDir?: string
  appearance?: AppearancePrefs
  workspaceLayout?: WorkspaceLayoutPrefs
  autoBackup?: {
    lastAt?: Record<string, string>
    genSinceBackup?: Record<string, number>
  }
}

export type ThemeId = 'dark' | 'light' | 'system'

export interface AppearancePrefs {
  theme: ThemeId
  editorFontSize: number
  editorLineNumbers: boolean
}

export interface SetAppearancePayload {
  theme?: ThemeId
  editorFontSize?: number
  editorLineNumbers?: boolean
}

export type WorkspaceActivityId = 'explorer' | 'outline' | 'knowledge' | 'memory' | 'assistant'

export interface WorkspaceLayoutPrefs {
  activity?: WorkspaceActivityId
  sidePanelVisible?: boolean
  bottomPanelCollapsed?: boolean
  bottomPanelHeight?: number
  sidePanelWidth?: number
}

export interface ProjectMeta {
  id: string
  name: string
  createdAt: string
  rootPath: string
  settings: {
    videoPlatformTemplate: string
    dify?: {
      workflowId?: string
      /** v1.1=含 retry_count 等；core=旧版 START 最小字段集 */
      inputProfile?: 'v1.1' | 'core'
    }
  }
  /** 打开项目时若触发每日自动备份，Main 附带提示文案 */
  autoBackupMessage?: string
}

export interface GenerateChapterRequest {
  inputs: ChapterGenerateInputs
}

export interface GenerateChapterResponse {
  ok: boolean
  outputs?: WorkflowOutputs
  error?: string
  workflowRunId?: string
  memoryMerged?: boolean
  memoryUpdate?: MemoryUpdateInfo
  /** 正文落盘前校验产生的非致命提示（如内部 retry、memory_patch 缺字段） */
  outputWarnings?: string[]
  appearedScan?: ScanAppearedResult
  /** 累计生成达阈值时的自动备份结果 */
  autoBackup?: { ok: boolean; message: string }
}

export interface HealthCheckResponse {
  ok: boolean
  message: string
}

export interface AssistantChatRequest {
  message: string
  projectId: string
  threadId?: string
}

export interface AssistantChatResponse {
  ok: boolean
  threadId?: string
  reply?: string
  error?: string
  /** Harness 等待用户确认 generate_* / write_* */
  pendingApproval?: {
    toolName: string
    description: string
    /** 并行待确认工具数（>1 时须一次性批准全部） */
    count?: number
    items?: Array<{ toolName: string; description: string }>
  }
  /** 本次响应由文字「同意/取消」触发了 HITL resume */
  hitlResumed?: boolean
}

export interface AssistantStreamChunk {
  threadId: string
  kind: 'text'
  delta: string
}

export type AssistantToolActivityPhase = 'start' | 'end' | 'error' | 'waiting'

export interface AssistantToolActivityEvent {
  threadId: string
  kind: 'tool'
  phase: AssistantToolActivityPhase
  toolCallId?: string
  toolName: string
  label: string
  detail?: string
  fileHint?: string
}

export type AssistantStreamEvent = AssistantStreamChunk | AssistantToolActivityEvent

export interface AssistantActivityStep {
  id: string
  toolName: string
  label: string
  detail?: string
  fileHint?: string
  status: 'running' | 'done' | 'error' | 'waiting'
}

export interface AssistantSessionSnapshot {
  threadId: string
  messages: Array<{
    role: 'user' | 'assistant' | 'error'
    content: string
    activities?: AssistantActivityStep[]
  }>
}

export interface AssistantResumeRequest {
  threadId: string
  projectId: string
  approved: boolean
}

export interface AssistantSuggestion {
  id: string
  label: string
  prompt: string
}

export interface GenerateChapterOptions {
  chapter_id: string
  use_outline_beats?: boolean
  generation_prompt?: string
  generation_prompt_text?: string
}

export interface OutlineGenerateInputs {
  project_id: string
  knowledge_snapshot: string
  plot_memory: string
  outline_brief?: string
  target_volumes?: string
  target_chapters?: string
  genre?: string
  tone?: string
  /** 目标卷 id，如 vol-01 */
  volume_id?: string
  /** 单章模式：待生成的章 id */
  next_chapter_id?: string
  /** single_chapter | full */
  generation_mode?: string
  /** 本卷已有章节 JSON，供 O1 承接 */
  existing_volume_outline?: string
  max_retry?: number
  retry_count?: number
  retry_issues_formatted?: string
}

export interface OutlineWorkflowOutputs {
  status: WorkflowStatus
  circuit_break?: boolean
  human_action_required?: boolean
  retry_count: number
  outline_summary?: string
  outline_json?: string
  validation_report?: ValidationReport | string
  retry_issues_formatted?: string
  workflow_version?: string
}

export interface GenerateOutlineOptions {
  /** 写入哪一卷（如 vol-01） */
  volume_id: string
  /** 本次串行生成的章数 */
  chapters_to_generate?: number
  outline_brief?: string
  genre?: string
  tone?: string
  /** 是否传入剧情记忆（false=仅知识库；true=仅前序已落盘章节摘要） */
  use_plot_memory?: boolean
}

export type OutlineGenerationPhase =
  | 'chapter_start'
  | 'chapter_done'
  | 'memory_saved'
  | 'chapter_failed'

export interface OutlineGenerationProgress {
  phase: OutlineGenerationPhase
  index: number
  total: number
  volumeId?: string
  chapterId?: string
  chapterTitle?: string
  message?: string
}

export interface GenerateOutlineResponse {
  ok: boolean
  outputs?: OutlineWorkflowOutputs
  error?: string
  workflowRunId?: string
  outlineSaved?: boolean
  outlineSummary?: string
  /** 客户端对 Dify retry 路由的累计轮次（不含首次） */
  clientRetryRounds?: number
  /** 串行模式：已成功追加的章 id */
  chaptersGenerated?: string[]
  failedAtChapter?: string
  sequential?: boolean
}

export type KnowledgeGenerationMode = 'bootstrap' | 'expand'

export interface KnowledgeGenerateInputs {
  project_id: string
  knowledge_brief: string
  existing_knowledge_snapshot: string
  genre?: string
  tone?: string
  era?: string
  scene?: string
  generation_mode?: KnowledgeGenerationMode
  max_retry?: number
  retry_count?: number
  retry_issues_formatted?: string
}

export interface KnowledgeWorkflowOutputs {
  status: WorkflowStatus
  circuit_break?: boolean
  human_action_required?: boolean
  retry_count: number
  knowledge_summary?: string
  knowledge_json?: string
  validation_report?: ValidationReport | string
  retry_issues_formatted?: string
  workflow_version?: string
}

export interface GenerateKnowledgeOptions {
  knowledge_brief?: string
  generation_mode?: KnowledgeGenerationMode
  genre?: string
  tone?: string
}

export interface GenerateKnowledgeResponse {
  ok: boolean
  outputs?: KnowledgeWorkflowOutputs
  error?: string
  workflowRunId?: string
  knowledgeSaved?: boolean
  knowledgeSummary?: string
  clientRetryRounds?: number
  mergedCounts?: { characters: number; factions: number; items: number }
}

export type {
  OutlineDocument,
  OutlineChapter,
  OutlineVolume,
  OutlineBeat,
  KnowledgeDocument,
  KnowledgeWorld,
  KnowledgeCharacter,
  WorldMapDocument,
  WorldLocation,
  PlotMemoryDocument
} from './project'

import type {
  OutlineDocument,
  KnowledgeDocument,
  PlotMemoryDocument
} from './project'

export interface NovelsCreatorAPI {
  config: {
    get: () => Promise<
      AppConfig & {
        dify: DifySettingsPublic
        ai: AiSettingsPublic
        /** 至少一个工作流已配置 Key */
        hasApiKey?: boolean
      }
    >
    setDify: (payload: SetDifyConfigPayload) => Promise<void>
    setAiEngine: (payload: SetAiEnginePayload) => Promise<void>
    setAiLocal: (payload: SetAiLocalPayload) => Promise<void>
    setAiAssistant: (payload: SetAiAssistantPayload) => Promise<void>
    testAssistantLlm: (payload?: TestAssistantLlmPayload) => Promise<HealthCheckResponse>
    testDify: (payload?: TestDifyPayload) => Promise<HealthCheckResponse>
    setLayout: (layout: WorkspaceLayoutPrefs) => Promise<void>
    setAppearance: (payload: SetAppearancePayload) => Promise<void>
    setDefaultProjectsDir: (dir: string | undefined) => Promise<void>
    clearWorkspaceLayout: () => Promise<void>
    setAiOnboardingCompleted: (completed: boolean) => Promise<void>
  }
  project: {
    create: (name: string, parentDir?: string) => Promise<ProjectMeta>
    open: (rootPath: string) => Promise<ProjectMeta>
    close: () => Promise<void>
    delete: (rootPath: string) => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>
    getCurrent: () => Promise<ProjectMeta | null>
    pickDirectory: () => Promise<string | null>
    pickOpen: () => Promise<string | null>
    getRecent: () => Promise<string[]>
    getOutline: () => Promise<OutlineDocument>
    saveOutline: (doc: OutlineDocument) => Promise<OutlineDocument>
    getKnowledge: () => Promise<KnowledgeDocument>
    getMapImage: () => Promise<string | null>
    getMapImagePath: () => Promise<string | null>
    saveKnowledge: (doc: KnowledgeDocument) => Promise<KnowledgeDocument>
    getPlotMemory: () => Promise<PlotMemoryDocument>
    savePlotMemory: (doc: PlotMemoryDocument) => Promise<PlotMemoryDocument>
    getChapterText: (chapterId: string, kind: 'novel' | 'video') => Promise<string>
    saveChapterText: (chapterId: string, kind: 'novel' | 'video', content: string) => Promise<void>
    backfillMissingSummaries: () => Promise<number>
    backfillChapterSummary: (chapterId: string) => Promise<MemoryUpdateInfo>
    scanAppearedCharacters: (
      chapterId: string,
      novelBody: string,
      memoryPatch?: unknown
    ) => Promise<ScanAppearedResult>
    promoteAppearedCharacters: (names: string[]) => Promise<{ promoted: string[]; skipped: string[] }>
    deleteChapterAssets: (chapterId: string) => Promise<{ ok: boolean; deleted: boolean }>
  }
  backup: {
    run: () => Promise<{ ok: boolean; message: string; path?: string }>
    list: () => Promise<
      Array<{ name: string; path: string; mtime: string; size: number }>
    >
    pickAndRestore: () => Promise<{ ok: boolean; message: string }>
    restore: (zipPath: string) => Promise<{ ok: boolean; message: string }>
  }
  ai: {
    generateChapter: (options: GenerateChapterOptions) => Promise<GenerateChapterResponse>
    generateOutline: (options: GenerateOutlineOptions) => Promise<GenerateOutlineResponse>
    generateKnowledge: (options: GenerateKnowledgeOptions) => Promise<GenerateKnowledgeResponse>
    onOutlineProgress: (
      listener: (progress: OutlineGenerationProgress) => void
    ) => () => void
  }
  agent: {
    chat: (req: AssistantChatRequest) => Promise<AssistantChatResponse>
    chatStream: (
      req: AssistantChatRequest,
      onEvent: (event: AssistantStreamEvent) => void
    ) => Promise<AssistantChatResponse>
    resumeStream: (
      req: AssistantResumeRequest,
      onEvent: (event: AssistantStreamEvent) => void
    ) => Promise<AssistantChatResponse>
    resume: (req: AssistantResumeRequest) => Promise<AssistantChatResponse>
    getPendingApproval: (
      projectId: string,
      threadId: string
    ) => Promise<AssistantChatResponse['pendingApproval']>
    clearThread: (projectId: string, threadId: string) => Promise<void>
    loadSession: (projectId: string) => Promise<AssistantSessionSnapshot | null>
    saveSession: (projectId: string, snapshot: AssistantSessionSnapshot) => Promise<void>
    listSuggestedActions: (projectId: string) => Promise<AssistantSuggestion[]>
    onProjectMutated: (listener: () => void) => () => void
  }
  /** @deprecated Use ai.* */
  dify: {
    generateChapter: (options: GenerateChapterOptions) => Promise<GenerateChapterResponse>
    generateOutline: (options: GenerateOutlineOptions) => Promise<GenerateOutlineResponse>
    generateKnowledge: (options: GenerateKnowledgeOptions) => Promise<GenerateKnowledgeResponse>
    onOutlineProgress: (
      listener: (progress: OutlineGenerationProgress) => void
    ) => () => void
  }
  export: {
    chapter: (
      chapterId: string,
      exportType: 'novel' | 'video' | 'both',
      format: 'txt' | 'md'
    ) => Promise<{ ok: boolean; message: string; path?: string }>
    toProjectFolder: (chapterId: string) => Promise<{ ok: boolean; message: string }>
    fullBook: (
      exportType: 'novel' | 'video',
      format: 'txt' | 'md'
    ) => Promise<{
      ok: boolean
      message: string
      path?: string
      chapterCount?: number
      skipped?: string[]
    }>
  }
  world: {
    checkEngine: () => Promise<import('./world-gen').WorldEngineCheckResponse>
    generateNative: (
      config: import('./world-gen').WorldGenConfig
    ) => Promise<import('./world-gen').WorldEngineNativeGenerateResponse>
    toLocalFileUrl: (filePath: string) => string
    readMapFile: (filePath: string) => Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }>
    generateSociety: (
      req: import('./world-gen').WorldSocietyGenerateRequest
    ) => Promise<import('./world-gen').WorldSocietyGenerateResponse>
  }
}
