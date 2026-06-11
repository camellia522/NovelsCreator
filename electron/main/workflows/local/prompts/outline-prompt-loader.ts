import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { OutlineGenerateInputs } from '../../../../src/types/api'
import { extractPromptBody, renderOutlineTemplate } from './outline-template'

const PROMPT_DIR = join(process.cwd(), 'dify', 'outline', 'prompts')

let cachedO1System: string | null = null
let cachedO2System: string | null = null
let cachedO1UserTpl: string | null = null
let cachedO2UserTpl: string | null = null

async function readPromptFile(name: string): Promise<string> {
  return readFile(join(PROMPT_DIR, name), 'utf-8')
}

async function getO1System(): Promise<string> {
  if (cachedO1System) return cachedO1System
  const raw = await readPromptFile('o1-outline-generate.md')
  cachedO1System = extractPromptBody(raw, '## System 正文（粘贴到 Dify → O1 → System）')
  return cachedO1System
}

async function getO2System(): Promise<string> {
  if (cachedO2System) return cachedO2System
  const raw = await readPromptFile('o2-outline-validate.md')
  cachedO2System = extractPromptBody(raw, '## System 正文（粘贴到 Dify → O2 → System）')
  return cachedO2System
}

async function getO1UserTemplate(): Promise<string> {
  if (cachedO1UserTpl) return cachedO1UserTpl
  cachedO1UserTpl = await readPromptFile('o1-outline-user.jinja.md')
  return cachedO1UserTpl
}

async function getO2UserTemplate(): Promise<string> {
  if (cachedO2UserTpl) return cachedO2UserTpl
  cachedO2UserTpl = await readPromptFile('o2-outline-user.jinja.md')
  return cachedO2UserTpl
}

function inputsToTemplateVars(inputs: OutlineGenerateInputs): Record<string, string> {
  return {
    knowledge_snapshot: inputs.knowledge_snapshot ?? '',
    plot_memory: inputs.plot_memory ?? '',
    outline_brief: inputs.outline_brief ?? '',
    target_volumes: inputs.target_volumes ?? '1',
    target_chapters: inputs.target_chapters ?? '1',
    genre: inputs.genre ?? '',
    tone: inputs.tone ?? '',
    volume_id: inputs.volume_id ?? 'vol-01',
    next_chapter_id: inputs.next_chapter_id ?? '',
    generation_mode: inputs.generation_mode ?? 'single_chapter',
    existing_volume_outline: inputs.existing_volume_outline ?? '{}',
    retry_issues_formatted: inputs.retry_issues_formatted ?? '',
    merged_context: '',
    outline_json: ''
  }
}

export async function buildO1Messages(inputs: OutlineGenerateInputs): Promise<{
  system: string
  user: string
}> {
  const vars = inputsToTemplateVars(inputs)
  return {
    system: await getO1System(),
    user: renderOutlineTemplate(await getO1UserTemplate(), vars)
  }
}

export async function buildO2Messages(
  inputs: OutlineGenerateInputs,
  outlineJson: string
): Promise<{ system: string; user: string }> {
  const vars = {
    ...inputsToTemplateVars(inputs),
    outline_json: outlineJson
  }
  return {
    system: await getO2System(),
    user: renderOutlineTemplate(await getO2UserTemplate(), vars)
  }
}
