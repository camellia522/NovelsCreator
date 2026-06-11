import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderOutlineTemplate } from './outline-template'

const PROMPT_DIR = join(process.cwd(), 'dify', 'world', 'prompts')

let cachedSystem: string | null = null
let cachedUserTpl: string | null = null

function extractJinjaBlock(md: string): string {
  const start = md.indexOf('```jinja2')
  if (start < 0) return md.trim()
  const bodyStart = md.indexOf('\n', start) + 1
  const end = md.indexOf('```', bodyStart)
  return end > bodyStart ? md.slice(bodyStart, end).trim() : md.trim()
}

async function getSystemPrompt(): Promise<string> {
  if (cachedSystem) return cachedSystem
  const raw = await readFile(join(PROMPT_DIR, 'w2-territory-society.md'), 'utf-8')
  const idx = raw.indexOf('## 角色')
  cachedSystem = idx >= 0 ? raw.slice(idx).trim() : raw.trim()
  return cachedSystem
}

async function getUserTemplate(): Promise<string> {
  if (cachedUserTpl) return cachedUserTpl
  const raw = await readFile(join(PROMPT_DIR, 'w2s-user.jinja.md'), 'utf-8')
  cachedUserTpl = extractJinjaBlock(raw)
  return cachedUserTpl
}

export async function buildW2SMessages(
  inputs: Record<string, string>
): Promise<{ system: string; user: string }> {
  const vars = { ...inputs }
  if (!vars.territory_json?.trim()) {
    vars.territory_json = ''
  }
  let user = renderOutlineTemplate(await getUserTemplate(), vars)
  if (!inputs.territory_json?.trim()) {
    user =
      '【严重】territory_json 为空：不得输出空 locations。\n\n' + user
  }
  return {
    system: await getSystemPrompt(),
    user
  }
}
