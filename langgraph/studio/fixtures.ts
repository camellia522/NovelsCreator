import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function loadFixture<T>(relPath: string): T {
  const raw = readFileSync(join(ROOT, relPath), 'utf-8')
  return JSON.parse(raw) as T
}

/** Studio 默认输入：见 dify/*/fixtures */
export function defaultOutlineInputs(): Record<string, unknown> {
  const fx = loadFixture<{ inputs: Record<string, unknown> }>(
    'dify/outline/fixtures/outline-run.epic-fantasy.json'
  )
  return fx.inputs
}

export function defaultKnowledgeInputs(): Record<string, unknown> {
  const fx = loadFixture<{ inputs: Record<string, unknown> }>(
    'dify/knowledge/fixtures/knowledge-run.sample.json'
  )
  return fx.inputs
}

export function defaultChapterInputs(): Record<string, unknown> {
  const fx = loadFixture<{ inputs: Record<string, unknown> }>(
    'dify/chapter/fixtures/run-request-success.json'
  )
  return fx.inputs
}

export function defaultSocietyInputs(): Record<string, unknown> {
  const fx = loadFixture<{ inputs: Record<string, unknown> }>(
    'dify/world/fixtures/society-run.sample.json'
  )
  return fx.inputs
}
