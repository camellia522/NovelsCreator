import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChapterGenerateInputs } from '../../../../src/types/api'
import type { P0Output } from '../nodes/chapter/p0.node'
import { renderOutlineTemplate } from './outline-template'

const PROMPT_DIR = join(process.cwd(), 'dify', 'chapter', 'prompts')

let cachedAuthorSystem: string | null = null
let cachedValidatorSystem: string | null = null
const promptCache = new Map<string, { systemTpl: string; userTpl: string }>()

function splitSystemUser(md: string): { systemTpl: string; userTpl: string } {
  const sysMarker = '## System'
  const userMarker = '## User'
  const sysStart = md.indexOf(sysMarker)
  const userStart = md.indexOf(userMarker)
  if (sysStart < 0 || userStart < 0) {
    return { systemTpl: md.trim(), userTpl: '' }
  }
  return {
    systemTpl: md.slice(sysStart + sysMarker.length, userStart).trim(),
    userTpl: md.slice(userStart + userMarker.length).trim()
  }
}

async function readPrompt(name: string): Promise<{ systemTpl: string; userTpl: string }> {
  const hit = promptCache.get(name)
  if (hit) return hit
  const raw = await readFile(join(PROMPT_DIR, name), 'utf-8')
  const parsed = splitSystemUser(raw)
  promptCache.set(name, parsed)
  return parsed
}

async function getAuthorSystem(): Promise<string> {
  if (cachedAuthorSystem) return cachedAuthorSystem
  const raw = await readFile(join(PROMPT_DIR, '_global-system.md'), 'utf-8')
  const start = raw.indexOf('## 一、创作类节点')
  const end = raw.indexOf('## 二、校验类节点')
  cachedAuthorSystem = end > start ? raw.slice(start, end).replace(/^##[^\n]+\n/, '').trim() : raw.trim()
  return cachedAuthorSystem
}

async function getValidatorSystem(): Promise<string> {
  if (cachedValidatorSystem) return cachedValidatorSystem
  const raw = await readFile(join(PROMPT_DIR, '_global-system.md'), 'utf-8')
  const start = raw.indexOf('## 二、校验类节点')
  cachedValidatorSystem = start >= 0 ? raw.slice(start).replace(/^##[^\n]+\n/, '').trim() : raw.trim()
  return cachedValidatorSystem
}

function injectGlobalSystem(systemTpl: string, author: string, validator: string): string {
  return systemTpl
    .replace(/\{\{\s*GLOBAL_AUTHOR_SYSTEM\s*\}\}/g, author)
    .replace(/\{\{\s*GLOBAL_VALIDATOR_SYSTEM\s*\}\}/g, validator)
}

function baseVars(
  inputs: ChapterGenerateInputs,
  p0: P0Output,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    project_id: inputs.project_id,
    chapter_id: inputs.chapter_id,
    chapter_title: inputs.chapter_title,
    outline_beats: inputs.outline_beats,
    knowledge_snapshot: inputs.knowledge_snapshot,
    plot_memory: inputs.plot_memory,
    previous_chapter_summary: inputs.previous_chapter_summary ?? '',
    generation_prompt_text: inputs.generation_prompt_text ?? '',
    video_platform_template: inputs.video_platform_template ?? 'generic-v1',
    video_template_config: inputs.video_template_config ?? '',
    estimated_duration_sec: String(inputs.estimated_duration_sec ?? 180),
    retry_count: String(inputs.retry_count ?? 0),
    retry_issues_formatted: inputs.retry_issues_formatted ?? '',
    merged_context: p0.merged_context,
    effective_beats: p0.effective_beats,
    has_wizard: p0.has_wizard,
    chapter_goal: p0.chapter_goal,
    ...extra
  }
}

async function buildMessages(
  file: string,
  vars: Record<string, string>,
  useValidator = false
): Promise<{ system: string; user: string }> {
  const { systemTpl, userTpl } = await readPrompt(file)
  const author = await getAuthorSystem()
  const validator = await getValidatorSystem()
  const system = injectGlobalSystem(
    systemTpl,
    author,
    useValidator ? validator : author
  )
  return {
    system: renderOutlineTemplate(system, vars),
    user: renderOutlineTemplate(userTpl, vars)
  }
}

export async function buildN1Messages(
  inputs: ChapterGenerateInputs,
  p0: P0Output
): Promise<{ system: string; user: string }> {
  return buildMessages('n1-draft.md', baseVars(inputs, p0))
}

export async function buildN2aMessages(
  inputs: ChapterGenerateInputs,
  p0: P0Output,
  draftText: string
): Promise<{ system: string; user: string }> {
  return buildMessages(
    'n2a-outline-validate.md',
    baseVars(inputs, p0, { draft_text: draftText }),
    true
  )
}

export async function buildN2bMessages(
  inputs: ChapterGenerateInputs,
  p0: P0Output,
  draftText: string
): Promise<{ system: string; user: string }> {
  return buildMessages(
    'n2b-lore-validate.md',
    baseVars(inputs, p0, { draft_text: draftText }),
    true
  )
}

export async function buildN3Messages(
  inputs: ChapterGenerateInputs,
  p0: P0Output,
  draftText: string,
  mergedIssuesForPolish: string
): Promise<{ system: string; user: string }> {
  return buildMessages(
    'n3-polish.md',
    baseVars(inputs, p0, {
      draft_text: draftText,
      merged_issues_for_polish: mergedIssuesForPolish
    })
  )
}

export async function buildN4aMessages(
  inputs: ChapterGenerateInputs,
  p0: P0Output,
  polishedText: string
): Promise<{ system: string; user: string }> {
  return buildMessages(
    'n4a-novel-body.md',
    baseVars(inputs, p0, { polished_text: polishedText })
  )
}

export async function buildN4bMessages(
  inputs: ChapterGenerateInputs,
  p0: P0Output,
  polishedText: string
): Promise<{ system: string; user: string }> {
  const tpl = inputs.video_platform_template ?? 'generic-v1'
  const file =
    tpl === 'platform-x-v1'
      ? 'n4b-video-platform-x-v1.md'
      : tpl === 'configurable-v1'
        ? 'n4b-video-configurable-v1.md'
        : 'n4b-video-generic-v1.md'
  return buildMessages(file, baseVars(inputs, p0, { polished_text: polishedText }))
}

export async function buildN5Messages(
  inputs: ChapterGenerateInputs,
  p0: P0Output,
  novelBody: string
): Promise<{ system: string; user: string }> {
  return buildMessages(
    'n5-memory-patch.md',
    baseVars(inputs, p0, { novel_body: novelBody }),
    true
  )
}
