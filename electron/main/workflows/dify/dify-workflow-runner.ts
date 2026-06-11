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
} from '../../../src/types/api'
import type {
  WorldSocietyGenerateRequest,
  WorldSocietyGenerateResponse
} from '../../../src/types/world-gen'
import {
  healthCheck,
  runChapterGenerationWithRetry,
  runKnowledgeGenerationWithRetry,
  runOutlineGenerationWithRetry
} from '../../services/dify.service'
import { runSequentialOutlineGeneration } from '../../services/outline-sequential.service'
import { runKnowledgeGeneration } from '../../services/knowledge-generation.service'
import { runTerritorySocietyLlm } from '../../services/world-society.service'
import type { DifyInputProfile } from '../../services/dify-inputs'
import type { WorkflowRunner } from '../workflow-runner.types'

export const difyWorkflowRunner: WorkflowRunner = {
  engineId: 'dify',

  runOutlineGenerationWithRetry(inputs: OutlineGenerateInputs): Promise<GenerateOutlineResponse> {
    return runOutlineGenerationWithRetry(inputs)
  },

  runKnowledgeGenerationWithRetry(
    inputs: KnowledgeGenerateInputs
  ): Promise<GenerateKnowledgeResponse> {
    return runKnowledgeGenerationWithRetry(inputs)
  },

  runChapterWorkflow(
    inputs: ChapterGenerateInputs,
    options?: { inputProfile?: DifyInputProfile }
  ): Promise<GenerateChapterResponse> {
    return runChapterGenerationWithRetry(inputs, options)
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

  async runSocietyWorkflow(
    projectId: string,
    req: WorldSocietyGenerateRequest
  ): Promise<WorldSocietyGenerateResponse> {
    return runTerritorySocietyLlm(
      {
        config: req.config,
        nations: req.nations,
        territoryBriefJson: req.territoryBriefJson
      },
      projectId
    )
  },

  testConnection(slot?: DifyWorkflowSlot): Promise<HealthCheckResponse> {
    return healthCheck({ slot: slot ?? 'chapter' })
  }
}
