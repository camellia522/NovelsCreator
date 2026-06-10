import type { MemoryPatch } from '../../src/types/api'
import { stripThinkBlocks } from './novel-text'

/** Dify N5 有时把 globalSummaryDelta 输出为对象/数组，统一转为可 append 的字符串 */
export function coercePatchText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(coercePatchText).filter(Boolean).join('\n')
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    for (const key of ['text', 'delta', 'content', 'summary', 'value']) {
      const hit = o[key]
      if (typeof hit === 'string' && hit.trim()) return hit.trim()
    }
    try {
      const json = JSON.stringify(value)
      return json === '{}' || json === '[]' ? '' : json
    } catch {
      return ''
    }
  }
  return ''
}

export function normalizeMemoryPatch(raw: Record<string, unknown>): MemoryPatch {
  const patch: MemoryPatch = { ...raw } as MemoryPatch
  const delta = coercePatchText(raw.globalSummaryDelta)
  if (delta) patch.globalSummaryDelta = delta
  else delete patch.globalSummaryDelta

  const cs = normalizeChapterSummaryField(raw.chapterSummary, String(raw.chapter_id ?? raw.chapterId ?? ''))
  if (cs) patch.chapterSummary = cs
  else delete patch.chapterSummary

  if (!Array.isArray(patch.foreshadowingUpdates)) {
    patch.foreshadowingUpdates = []
  }
  return patch
}

/** 解析 N5 chapterSummary：支持 JSON 字符串、纯文本摘要、嵌套对象 */
export function normalizeChapterSummaryField(
  raw: unknown,
  fallbackChapterId: string
): Record<string, unknown> | undefined {
  if (raw == null) return undefined
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return undefined
    const asJson = extractJsonObjectFromLlmText(trimmed)
    if (asJson) return asJson
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* 整段即摘要正文 */
    }
    return { chapterId: fallbackChapterId, summary: trimmed }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return undefined
}

/** 从含 thinking 块 / markdown 的 LLM 文本中提取首个完整 JSON 对象 */
export function extractJsonObjectFromLlmText(text: string): Record<string, unknown> | null {
  let s = stripThinkBlocks(text).trim()
  if (!s) return null

  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  }

  const start = s.indexOf('{')
  if (start < 0) return null

  let depth = 0
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          const parsed = JSON.parse(s.slice(start, i + 1)) as unknown
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export function parseMemoryPatchFromRaw(raw: unknown): MemoryPatch | null {
  if (raw == null) return null

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeMemoryPatch(raw as Record<string, unknown>)
  }

  if (typeof raw !== 'string' || !raw.trim()) return null

  const extracted = extractJsonObjectFromLlmText(raw)
  if (extracted) return normalizeMemoryPatch(extracted)

  try {
    const parsed = JSON.parse(raw.trim()) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeMemoryPatch(parsed as Record<string, unknown>)
    }
  } catch {
    /* fall through */
  }

  return null
}
