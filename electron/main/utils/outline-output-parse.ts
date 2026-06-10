import type { OutlineDocument } from '../../src/types/project'
import { extractJsonObjectFromLlmText } from './memory-patch-parse'

function asOutlineDocument(raw: Record<string, unknown>): OutlineDocument | null {
  const candidate = (raw.outline ?? raw) as Record<string, unknown>
  if (!Array.isArray(candidate.volumes)) return null
  return {
    volumes: candidate.volumes.map((vol, vi) => {
      const v = vol as Record<string, unknown>
      return {
        id: String(v.id ?? `vol-${String(vi + 1).padStart(2, '0')}`),
        title: String(v.title ?? ''),
        chapters: Array.isArray(v.chapters)
          ? v.chapters.map((ch, ci) => {
              const c = ch as Record<string, unknown>
              const beats = Array.isArray(c.beats)
                ? c.beats.map((b, bi) => {
                    const beat = b as Record<string, unknown>
                    return {
                      order: Number(beat.order ?? bi + 1),
                      text: String(beat.text ?? '')
                    }
                  })
                : []
              return {
                id: String(c.id ?? `ch-${String(ci + 1).padStart(3, '0')}`),
                title: String(c.title ?? ''),
                status: (c.status as 'draft' | 'generating' | 'generated' | 'published') ?? 'draft',
                beats
              }
            })
          : []
      }
    })
  }
}

/** 解析 Dify 返回的 outline_json（含 O1 包装或纯 OutlineDocument） */
export function normalizeOutlineFromWorkflow(raw: unknown): OutlineDocument | null {
  if (raw == null) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return asOutlineDocument(raw as Record<string, unknown>)
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const direct = JSON.parse(raw) as unknown
      if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
        const doc = asOutlineDocument(direct as Record<string, unknown>)
        if (doc) return doc
      }
    } catch {
      /* fall through */
    }
    const extracted = extractJsonObjectFromLlmText(raw)
    if (extracted) return asOutlineDocument(extracted)
  }
  return null
}
