import type { DifyWorkflowSlot } from '@/constants/dify-workflows'
import type {
  ChapterGenerateInputs,
  GenerateChapterResponse,
  GenerateKnowledgeOptions,
  GenerateKnowledgeResponse,
  GenerateOutlineOptions,
  GenerateOutlineResponse,
  HealthCheckResponse,
  KnowledgeGenerateInputs,
  OutlineGenerateInputs,
  OutlineGenerationProgress
} from '../../src/types/api'
import type {
  WorldSocietyGenerateRequest,
  WorldSocietyGenerateResponse
} from '../../src/types/world-gen'
import type { DifyInputProfile } from '../services/dify-inputs'

export type WorkflowKind = DifyWorkflowSlot

export type AiEngineId = 'local' | 'dify'

export interface WorkflowRunner {
  readonly engineId: AiEngineId
  runOutlineGenerationWithRetry(inputs: OutlineGenerateInputs): Promise<GenerateOutlineResponse>
  runKnowledgeGenerationWithRetry(
    inputs: KnowledgeGenerateInputs
  ): Promise<GenerateKnowledgeResponse>
  runChapterWorkflow(
    inputs: ChapterGenerateInputs,
    options?: { inputProfile?: DifyInputProfile }
  ): Promise<GenerateChapterResponse>
  runOutlineWorkflow(
    projectId: string,
    options: GenerateOutlineOptions,
    onProgress?: (progress: OutlineGenerationProgress) => void
  ): Promise<GenerateOutlineResponse>
  runKnowledgeWorkflow(
    projectId: string,
    options: GenerateKnowledgeOptions
  ): Promise<GenerateKnowledgeResponse>
  runSocietyWorkflow(
    projectId: string,
    req: WorldSocietyGenerateRequest
  ): Promise<WorldSocietyGenerateResponse>
  testConnection(slot?: WorkflowKind): Promise<HealthCheckResponse>
}
