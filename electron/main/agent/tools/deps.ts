import type { WorkflowRunner } from '../../workflows/workflow-runner.types'
import { getCurrentProject } from '../../services/project.service'

export interface NovelAssistantToolDeps {
  projectId: string
  runner: WorkflowRunner
}

export function createProjectAssert(projectId: string) {
  return () => {
    const project = getCurrentProject()
    if (!project || project.id !== projectId) {
      throw new Error('当前项目未打开或已切换，请重新打开项目后再试')
    }
    return project
  }
}
