import { asBool, parseLlmJson, toInt } from '../../utils/outline-llm-json'

export interface KnowledgeAggOutput {
  route: 'continue' | 'retry' | 'circuit_break'
  retry_count: number
  retry_issues_formatted: string
  knowledge_valid: boolean
  validation_report: string
  knowledge_json: string
}

function normalizeKnowledgeJson(raw: unknown): string {
  if (raw == null) return '{}'
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return JSON.stringify(raw)
  }
  const text = String(raw).trim()
  if (!text || ['null', 'none'].includes(text.toLowerCase())) return '{}'
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') return JSON.stringify(parsed)
  } catch {
    /* fall through */
  }
  const parsed = parseLlmJson(text)
  if (parsed.knowledge && typeof parsed.knowledge === 'object') {
    const k = parsed.knowledge as Record<string, unknown>
    return JSON.stringify({
      world: k.world ?? {},
      characters: k.characters ?? [],
      factions: k.factions ?? [],
      items: k.items ?? []
    })
  }
  return JSON.stringify({
    world: parsed.world ?? {},
    characters: parsed.characters ?? [],
    factions: parsed.factions ?? [],
    items: parsed.items ?? []
  })
}

function structureOk(knowledgeJson: string): boolean {
  try {
    const doc = JSON.parse(knowledgeJson) as {
      world?: { title?: string; rules?: string }
      characters?: { name?: string }[]
    }
    const world = doc.world ?? {}
    const title = String(world.title ?? '').trim()
    const rules = String(world.rules ?? '').trim()
    if (!title && rules.length < 20) return false
    let named = 0
    for (const c of doc.characters ?? []) {
      if (c && String(c.name ?? '').trim()) named++
    }
    return named >= 1
  } catch {
    return false
  }
}

function emptyOutputs(retryCount: number, knowledgeJson: string): KnowledgeAggOutput {
  return {
    route: 'retry',
    retry_count: retryCount,
    retry_issues_formatted: '- [hard] global: K2 未返回有效校验 JSON',
    knowledge_valid: false,
    validation_report: '{}',
    knowledge_json: knowledgeJson
  }
}

function k1xEmptyOutputs(
  retryCount: number,
  maxRetry: number,
  knowledgeJson: string
): KnowledgeAggOutput {
  const issue =
    '- [hard] global: K1X knowledge_json 无有效 world/characters。' +
    '请检查 K1 Structured Output 与 K1X 绑定。'
  const newRetry = retryCount < maxRetry ? retryCount + 1 : retryCount
  const route = retryCount < maxRetry ? 'retry' : 'circuit_break'
  const report = {
    knowledge_valid: false,
    knowledge_issues: [{ severity: 'hard', location: 'global', message: issue }]
  }
  return {
    route,
    retry_count: newRetry,
    retry_issues_formatted: issue,
    knowledge_valid: false,
    validation_report: JSON.stringify(report),
    knowledge_json: knowledgeJson
  }
}

/** AGG · 知识库校验聚合与路由 */
export function runKnowledgeAggNode(kwargs: Record<string, unknown>): KnowledgeAggOutput {
  try {
    const validateResult = kwargs.validate_result ?? kwargs.text ?? '{}'
    const knowledgeJson = normalizeKnowledgeJson(kwargs.knowledge_json ?? '{}')
    const retryCount = toInt(kwargs.retry_count, 0)
    const maxRetry = toInt(kwargs.max_retry, 3)

    if (!structureOk(knowledgeJson)) {
      return k1xEmptyOutputs(retryCount, maxRetry, knowledgeJson)
    }

    const v = parseLlmJson(validateResult)
    if (!Object.keys(v).length) {
      const out = emptyOutputs(retryCount, knowledgeJson)
      if (retryCount >= maxRetry) {
        out.route = 'circuit_break'
      } else {
        out.retry_count = retryCount + 1
      }
      return out
    }

    const valid = asBool(v.knowledge_valid)
    const issues = Array.isArray(v.knowledge_issues) ? v.knowledge_issues : []

    let route: KnowledgeAggOutput['route']
    let newRetry: number
    if (valid) {
      route = 'continue'
      newRetry = retryCount
    } else if (retryCount < maxRetry) {
      route = 'retry'
      newRetry = retryCount + 1
    } else {
      route = 'circuit_break'
      newRetry = retryCount
    }

    const formatted: string[] = []
    for (const item of issues.slice(0, 12)) {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        formatted.push(`- [${o.severity ?? 'warn'}] ${o.location ?? ''}: ${o.message ?? ''}`)
      } else {
        formatted.push(`- ${String(item)}`)
      }
    }

    return {
      route,
      retry_count: newRetry,
      retry_issues_formatted: formatted.join('\n'),
      knowledge_valid: valid,
      validation_report: JSON.stringify(v),
      knowledge_json: knowledgeJson
    }
  } catch {
    return emptyOutputs(toInt(kwargs.retry_count, 0), '{}')
  }
}
