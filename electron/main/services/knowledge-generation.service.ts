import type { GenerateKnowledgeOptions, GenerateKnowledgeResponse } from '../../src/types/api'
import { prepareKnowledgeForOutline } from '@/utils/outline-preflight'
import {
  countKnowledgePayload,
  mergeKnowledgeDocument,
  parseKnowledgeJson,
  validateMergedKnowledge
} from '@/utils/knowledge-dify-merge'
import { refreshWorldSettingConstraints } from '@/utils/world-setting-catalog'
import { readKnowledge, saveKnowledge } from './project-files.service'
import { getCurrentProject } from './project.service'
import { buildKnowledgeGenerationPayload } from './knowledge-dify.service'
import { getWorkflowRunner } from '../workflows/workflow-runner.factory'

export async function runKnowledgeGeneration(
  projectId: string,
  options: GenerateKnowledgeOptions
): Promise<GenerateKnowledgeResponse> {
  const brief = options.knowledge_brief?.trim()
  if (!brief) {
    return { ok: false, error: '请填写创作 brief（世界观/人物/势力需求）' }
  }

  const payload = await buildKnowledgeGenerationPayload(options)
  const runner = await getWorkflowRunner()
  const result = await runner.runKnowledgeGenerationWithRetry({
    project_id: projectId,
    knowledge_brief: payload.knowledge_brief,
    existing_knowledge_snapshot: payload.existing_knowledge_snapshot,
    genre: payload.genre,
    tone: payload.tone,
    era: payload.era,
    scene: payload.scene,
    generation_mode: payload.generation_mode,
    max_retry: 3,
    retry_count: 0,
    retry_issues_formatted: ''
  })

  if (!result.ok || !result.outputs) {
    return result
  }

  const out = result.outputs
  if (out.status === 'circuit_break') {
    return {
      ...result,
      ok: false,
      error: out.retry_issues_formatted?.trim() || '知识库生成熔断'
    }
  }

  if (out.status !== 'success' || !out.knowledge_json?.trim()) {
    return {
      ...result,
      ok: false,
      error: `知识库生成未完成（status=${out.status ?? 'unknown'}）`
    }
  }

  const parsed = parseKnowledgeJson(out.knowledge_json)
  if (!parsed) {
    return {
      ...result,
      ok: false,
      error: 'knowledge_json 无法解析，请检查 K1X 节点输出'
    }
  }

  const existing = await readKnowledge()
  const merged = mergeKnowledgeDocument(existing, parsed, payload.generation_mode)
  prepareKnowledgeForOutline(merged)
  refreshWorldSettingConstraints(merged.world, merged.map)

  const validation = validateMergedKnowledge(merged)
  if (!validation.ok) {
    return {
      ...result,
      ok: false,
      error: validation.errors.join('；')
    }
  }

  await saveKnowledge(merged)

  const counts = countKnowledgePayload(parsed)
  return {
    ...result,
    knowledgeSaved: true,
    knowledgeSummary: out.knowledge_summary?.trim(),
    mergedCounts: counts
  }
}
