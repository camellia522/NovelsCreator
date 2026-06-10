import type { OutlineGenerateInputs } from '../../src/types/api'



const OUTLINE_KEYS = [

  'project_id',

  'knowledge_snapshot',

  'plot_memory',

  'outline_brief',

  'target_volumes',

  'target_chapters',

  'genre',

  'tone',

  'volume_id',

  'next_chapter_id',

  'generation_mode',

  'existing_volume_outline',

  'max_retry',

  'retry_count',

  'retry_issues_formatted'

] as const



function toInt(value: unknown, fallback: number): number {

  const n = Number(value)

  return Number.isFinite(n) ? Math.round(n) : fallback

}



export function buildOutlineWorkflowInputs(

  inputs: OutlineGenerateInputs

): Record<string, string | number> {

  const full: Record<string, string | number> = {

    project_id: String(inputs.project_id),

    knowledge_snapshot: String(inputs.knowledge_snapshot),

    plot_memory: String(inputs.plot_memory ?? ''),

    outline_brief: String(inputs.outline_brief ?? ''),

    target_volumes: String(inputs.target_volumes ?? '1'),

    target_chapters: String(inputs.target_chapters ?? '1'),

    genre: String(inputs.genre ?? ''),

    tone: String(inputs.tone ?? ''),

    volume_id: String(inputs.volume_id ?? 'vol-01'),

    next_chapter_id: String(inputs.next_chapter_id ?? ''),

    generation_mode: String(inputs.generation_mode ?? 'single_chapter'),

    existing_volume_outline: String(inputs.existing_volume_outline ?? ''),

    max_retry: toInt(inputs.max_retry, 3),

    retry_count: toInt(inputs.retry_count, 0),

    retry_issues_formatted: String(inputs.retry_issues_formatted ?? '')

  }

  const out: Record<string, string | number> = {}

  for (const key of OUTLINE_KEYS) {

    out[key] = full[key]

  }

  return out

}



export function stringifyOutlineWorkflowInputs(

  inputs: Record<string, string | number>

): Record<string, string> {

  const out: Record<string, string> = {}

  for (const [k, v] of Object.entries(inputs)) {

    out[k] = String(v)

  }

  return out

}

