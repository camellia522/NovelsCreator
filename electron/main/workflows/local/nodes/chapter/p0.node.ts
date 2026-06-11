function safeJson<T>(s: unknown, fallback: T): T {
  if (!s || !String(s).trim()) return fallback
  try {
    return JSON.parse(String(s)) as T
  } catch {
    return fallback
  }
}

function findChar(
  characters: { id?: string; name?: string }[],
  charId?: string,
  name?: string
): { id?: string; name?: string; relationships?: unknown[]; factionId?: string; arc?: string } | null {
  for (const c of characters ?? []) {
    if (charId && c.id === charId) return c
    if (name && c.name === name) return c
  }
  return null
}

export interface P0Output {
  merged_context: string
  effective_beats: string
  has_wizard: string
  chapter_goal: string
}

/** P0 · Context Merge */
export function runP0Node(kwargs: Record<string, unknown>): P0Output {
  const gp = safeJson<Record<string, unknown> | null>(kwargs.generation_prompt, null)
  const ks = safeJson<Record<string, unknown>>(kwargs.knowledge_snapshot, {})
  const beats = safeJson<unknown[]>(kwargs.outline_beats, [])

  let effectiveBeats: unknown[]
  let chapterGoal = ''
  if (gp?.plot && typeof gp.plot === 'object') {
    const plot = gp.plot as { beats?: unknown[]; chapterGoal?: string }
    if (Array.isArray(plot.beats) && plot.beats.length) {
      effectiveBeats = plot.beats
      chapterGoal = String(plot.chapterGoal ?? '')
    } else {
      effectiveBeats = Array.isArray(beats) ? beats : []
    }
  } else {
    effectiveBeats = Array.isArray(beats) ? beats : []
  }

  const characters: Record<string, unknown>[] = []
  if (gp?.characters && Array.isArray(gp.characters)) {
    for (const wc of gp.characters as Record<string, unknown>[]) {
      const kb = findChar(
        (ks.characters as { id?: string; name?: string }[]) ?? [],
        String(wc.id ?? ''),
        String(wc.name ?? '')
      )
      const merged = { ...wc }
      if (kb) {
        merged.relationships = kb.relationships ?? []
        merged.factionId = kb.factionId
        merged.arc = kb.arc
      }
      characters.push(merged)
    }
  } else {
    characters.push(...((ks.characters as Record<string, unknown>[]) ?? []))
  }

  const merged = {
    has_wizard: gp != null,
    world: { ...((ks.world as Record<string, unknown>) ?? {}) },
    wizard_env: gp?.environment ?? null,
    characters,
    factions: ks.factions ?? [],
    items: ks.items ?? [],
    nations: ks.nations ?? [],
    locations: ks.locations ?? [],
    regions: ks.regions ?? [],
    mapMeta: ks.mapMeta
  }

  return {
    merged_context: JSON.stringify(merged),
    effective_beats: JSON.stringify(effectiveBeats),
    has_wizard: gp ? 'true' : 'false',
    chapter_goal: chapterGoal
  }
}
