import type { KnowledgeGenerateInputs } from '../../src/types/api'

const KNOWLEDGE_KEYS = [
  'project_id',
  'knowledge_brief',
  'existing_knowledge_snapshot',
  'genre',
  'tone',
  'era',
  'scene',
  'generation_mode',
  'max_retry',
  'retry_count',
  'retry_issues_formatted'
] as const

function toInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : fallback
}

export function buildKnowledgeWorkflowInputs(
  inputs: KnowledgeGenerateInputs
): Record<string, string | number> {
  const full: Record<string, string | number> = {
    project_id: String(inputs.project_id),
    knowledge_brief: String(inputs.knowledge_brief ?? ''),
    existing_knowledge_snapshot: String(inputs.existing_knowledge_snapshot ?? '{}'),
    genre: String(inputs.genre ?? ''),
    tone: String(inputs.tone ?? ''),
    era: String(inputs.era ?? ''),
    scene: String(inputs.scene ?? ''),
    generation_mode: String(inputs.generation_mode ?? 'expand'),
    max_retry: toInt(inputs.max_retry, 3),
    retry_count: toInt(inputs.retry_count, 0),
    retry_issues_formatted: String(inputs.retry_issues_formatted ?? '')
  }
  return full
}

export function stringifyKnowledgeWorkflowInputs(
  inputs: Record<string, string | number>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of KNOWLEDGE_KEYS) {
    out[key] = String(inputs[key] ?? '')
  }
  return out
}
