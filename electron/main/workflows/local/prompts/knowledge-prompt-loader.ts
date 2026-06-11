import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { KnowledgeGenerateInputs } from '../../../../src/types/api'
import { extractPromptBody, renderOutlineTemplate } from './outline-template'

const PROMPT_DIR = join(process.cwd(), 'dify', 'knowledge', 'prompts')

let cachedK1System: string | null = null
let cachedK2System: string | null = null
let cachedK1UserTpl: string | null = null
let cachedK2UserTpl: string | null = null

async function readPromptFile(name: string): Promise<string> {
  return readFile(join(PROMPT_DIR, name), 'utf-8')
}

function inputsToTemplateVars(
  inputs: KnowledgeGenerateInputs,
  extra?: { knowledge_summary?: string; knowledge_json?: string }
): Record<string, string> {
  return {
    knowledge_brief: inputs.knowledge_brief ?? '',
    existing_knowledge_snapshot: inputs.existing_knowledge_snapshot ?? '',
    genre: inputs.genre ?? '',
    tone: inputs.tone ?? '',
    era: inputs.era ?? '',
    scene: inputs.scene ?? '',
    generation_mode: inputs.generation_mode ?? 'bootstrap',
    retry_issues_formatted: inputs.retry_issues_formatted ?? '',
    knowledge_summary: extra?.knowledge_summary ?? '',
    knowledge_json: extra?.knowledge_json ?? ''
  }
}

export async function buildK1Messages(inputs: KnowledgeGenerateInputs): Promise<{
  system: string
  user: string
}> {
  if (!cachedK1System) {
    const raw = await readPromptFile('k1-knowledge-generate.md')
    cachedK1System = extractPromptBody(raw, '## System 正文（粘贴到 Dify → K1 → System）')
  }
  if (!cachedK1UserTpl) {
    cachedK1UserTpl = await readPromptFile('k1-knowledge-user.jinja.md')
  }
  return {
    system: cachedK1System,
    user: renderOutlineTemplate(cachedK1UserTpl, inputsToTemplateVars(inputs))
  }
}

export async function buildK2Messages(
  inputs: KnowledgeGenerateInputs,
  k1x: { knowledge_summary: string; knowledge_json: string }
): Promise<{ system: string; user: string }> {
  if (!cachedK2System) {
    const raw = await readPromptFile('k2-knowledge-validate.md')
    cachedK2System = extractPromptBody(raw, '## System 正文（粘贴到 Dify → K2 → System）')
  }
  if (!cachedK2UserTpl) {
    cachedK2UserTpl = await readPromptFile('k2-knowledge-user.jinja.md')
  }
  const vars = inputsToTemplateVars(inputs, k1x)
  return {
    system: cachedK2System,
    user: renderOutlineTemplate(cachedK2UserTpl, vars)
  }
}
