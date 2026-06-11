import { loadConfig } from '../services/config.service'
import { difyWorkflowRunner } from './dify/dify-workflow-runner'
import { localWorkflowRunner } from './local/local-workflow-runner'
import type { WorkflowRunner } from './workflow-runner.types'

export async function getWorkflowRunner(): Promise<WorkflowRunner> {
  const config = await loadConfig()
  if (config.ai?.engine === 'local') {
    return localWorkflowRunner
  }
  return difyWorkflowRunner
}
