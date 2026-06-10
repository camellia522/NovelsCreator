/**
 * 将 fixture 里的 inputs 转为 Dify「Markdown 导入」格式。
 *
 * 用法：
 *   npx tsx scripts/json-inputs-to-dify-markdown.ts society-run-batch8.sample.json
 *   npx tsx scripts/json-inputs-to-dify-markdown.ts outline-run.sample.json --outline
 *   npx tsx scripts/json-inputs-to-dify-markdown.ts knowledge-run.sample.json --knowledge
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argBase = basename(process.argv[2] ?? 'society-run-batch8.sample.json')
const useOutline = process.argv.includes('--outline') || argBase.includes('outline')
const useKnowledge = process.argv.includes('--knowledge') || argBase.includes('knowledge')
const fixturesDir = join(
  root,
  useKnowledge ? 'dify/knowledge/fixtures' : useOutline ? 'dify/outline/fixtures' : 'dify/world/fixtures'
)

function toMarkdown(inputs: Record<string, string>, title: string): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    '> 由 scripts/json-inputs-to-dify-markdown.ts 自动生成，供 Dify Markdown 导入。',
    '',
    '---',
    ''
  ]
  for (const [key, value] of Object.entries(inputs)) {
    const trimmed = value.trim()
    const isJson =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    lines.push(`## ${key}`, '')
    if (isJson) {
      try {
        const pretty = JSON.stringify(JSON.parse(trimmed), null, 2)
        lines.push('```json', pretty, '```', '')
      } catch {
        lines.push('```json', trimmed, '```', '')
      }
    } else {
      lines.push('```text', trimmed, '```', '')
    }
  }
  return lines.join('\n')
}

const arg = process.argv.find((a) => a.endsWith('.json')) ?? 'society-run-batch8.sample.json'
const jsonPath = join(fixturesDir, basename(arg))
const doc = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
  description?: string
  inputs: Record<string, string>
}
const base = basename(arg, '.json')
const outPath = join(fixturesDir, `${base}.md`)
const md = toMarkdown(doc.inputs, doc.description ?? base)
writeFileSync(outPath, md, 'utf8')
console.log('Wrote:', outPath)
