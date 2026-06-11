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
} from '../../../src/types/api'
import type {
  WorldSocietyGenerateRequest,
  WorldSocietyGenerateResponse
} from '../../../src/types/world-gen'
import { runSequentialOutlineGeneration } from '../../services/outline-sequential.service'
import { runKnowledgeGeneration } from '../../services/knowledge-generation.service'
import { runLocalOutlineGenerationWithRetry } from './outline-local.service'
import { runLocalKnowledgeGenerationWithRetry } from './knowledge-local.service'
import { runLocalSocietyGeneration } from './society-local.service'
import { runLocalChapterGenerationWithRetry } from './chapter-local.service'
import { testAssistantLlm } from '../../services/llm-health.service'
import type { DifyInputProfile } from '../../services/dify-inputs'
import type { WorkflowKind, WorkflowRunner } from '../workflow-runner.types'

const NOT_READY = '内置 Local 引擎尚未实现该工作流，请在设置 → AI 中选择 Dify'

export const localWorkflowRunner: WorkflowRunner = {
  engineId: 'local',

  runOutlineGenerationWithRetry(inputs: OutlineGenerateInputs): Promise<GenerateOutlineResponse> {
    return runLocalOutlineGenerationWithRetry(inputs)
  },

  runKnowledgeGenerationWithRetry(
    inputs: KnowledgeGenerateInputs
  ): Promise<GenerateKnowledgeResponse> {
    return runLocalKnowledgeGenerationWithRetry(inputs)
  },

  runChapterWorkflow(
    inputs: ChapterGenerateInputs,
    _options?: { inputProfile?: DifyInputProfile }
  ): Promise<GenerateChapterResponse> {
    return runLocalChapterGenerationWithRetry(inputs)
  },

  runOutlineWorkflow(
    projectId: string,
    options: GenerateOutlineOptions,
    onProgress?: (progress: OutlineGenerationProgress) => void
  ): Promise<GenerateOutlineResponse> {
    return runSequentialOutlineGeneration(projectId, options, onProgress)
  },

  runKnowledgeWorkflow(
    projectId: string,
    options: GenerateKnowledgeOptions
  ): Promise<GenerateKnowledgeResponse> {
    return runKnowledgeGeneration(projectId, options)
  },

  runSocietyWorkflow(
    projectId: string,
    req: WorldSocietyGenerateRequest
  ): Promise<WorldSocietyGenerateResponse> {
    return runLocalSocietyGeneration(
      {
        config: req.config,
        nations: req.nations,
        territoryBriefJson: req.territoryBriefJson
      },
      projectId
    )
  },

  testConnection(_slot?: WorkflowKind): Promise<HealthCheckResponse> {
    return testAssistantLlm()
  }
}
