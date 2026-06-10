import type {
  KnowledgeCharacter,
  KnowledgeDocument,
  KnowledgeFaction,
  KnowledgeItem,
  KnowledgeWorld
} from '@/types/project'

export type KnowledgeMergeMode = 'bootstrap' | 'expand'

export interface ParsedKnowledgePayload {
  world: Partial<KnowledgeWorld>
  characters: KnowledgeCharacter[]
  factions: KnowledgeFaction[]
  items: KnowledgeItem[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeCharacter(raw: unknown, index: number): KnowledgeCharacter | null {
  const o = asRecord(raw)
  if (!o) return null
  const name = String(o.name ?? '').trim()
  if (!name) return null
  return {
    id: String(o.id ?? `char-${String(index + 1).padStart(3, '0')}`),
    name,
    role: o.role != null ? String(o.role) : '',
    traits: Array.isArray(o.traits) ? o.traits.map(String) : [],
    appearance: o.appearance != null ? String(o.appearance) : '',
    personality: o.personality != null ? String(o.personality) : '',
    notes: o.notes != null ? String(o.notes) : '',
    locationId: o.locationId != null ? String(o.locationId) : undefined
  }
}

function normalizeFaction(raw: unknown, index: number): KnowledgeFaction | null {
  const o = asRecord(raw)
  if (!o) return null
  const name = String(o.name ?? '').trim()
  if (!name) return null
  return {
    id: String(o.id ?? `faction-${String(index + 1).padStart(3, '0')}`),
    name,
    description: o.description != null ? String(o.description) : '',
    goals: o.goals != null ? String(o.goals) : ''
  }
}

function normalizeItem(raw: unknown, index: number): KnowledgeItem | null {
  const o = asRecord(raw)
  if (!o) return null
  const name = String(o.name ?? '').trim()
  if (!name) return null
  return {
    id: String(o.id ?? `item-${String(index + 1).padStart(3, '0')}`),
    name,
    description: o.description != null ? String(o.description) : ''
  }
}

function normalizeWorld(raw: unknown): Partial<KnowledgeWorld> {
  const o = asRecord(raw)
  if (!o) return {}
  const world: Partial<KnowledgeWorld> = {}
  for (const [key, value] of Object.entries(o)) {
    if (value == null) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      world[key] = String(value)
    } else if (Array.isArray(value)) {
      world[key] = value.map(String).join('、')
    }
  }
  return world
}

/** 解析 Dify knowledge_json 字符串 */
export function parseKnowledgeJson(raw: string): ParsedKnowledgePayload | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  const root = asRecord(parsed)
  if (!root) return null
  const inner = asRecord(root.knowledge) ?? root

  const characters = (Array.isArray(inner.characters) ? inner.characters : [])
    .map((c, i) => normalizeCharacter(c, i))
    .filter(Boolean) as KnowledgeCharacter[]
  const factions = (Array.isArray(inner.factions) ? inner.factions : [])
    .map((f, i) => normalizeFaction(f, i))
    .filter(Boolean) as KnowledgeFaction[]
  const items = (Array.isArray(inner.items) ? inner.items : [])
    .map((it, i) => normalizeItem(it, i))
    .filter(Boolean) as KnowledgeItem[]

  return {
    world: normalizeWorld(inner.world),
    characters,
    factions,
    items
  }
}

function mergeEntityList<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  mode: KnowledgeMergeMode
): T[] {
  if (mode === 'bootstrap' && incoming.length) {
    const byId = new Map(existing.map((e) => [e.id, e]))
    for (const item of incoming) {
      byId.set(item.id, item)
    }
    return [...byId.values()]
  }
  const byId = new Map(existing.map((e) => [e.id, e]))
  for (const item of incoming) {
    if (byId.has(item.id)) {
      byId.set(item.id, { ...byId.get(item.id)!, ...item })
    } else {
      byId.set(item.id, item)
    }
  }
  return [...byId.values()]
}

function mergeWorld(
  existing: KnowledgeWorld,
  generated: Partial<KnowledgeWorld>,
  mode: KnowledgeMergeMode
): KnowledgeWorld {
  const world: KnowledgeWorld = { ...existing }
  for (const [key, value] of Object.entries(generated)) {
    const v = value == null ? '' : String(value).trim()
    if (!v) continue
    const current = world[key] == null ? '' : String(world[key]).trim()
    if (mode === 'bootstrap' || !current) {
      world[key] = v
    }
  }
  if (generated.rules?.trim()) {
    const nextRules = generated.rules.trim()
    if (mode === 'bootstrap' || !existing.rules?.trim()) {
      world.rules = nextRules
    } else if (!existing.rules.includes(nextRules.slice(0, 40))) {
      world.rules = `${existing.rules.trim()}\n\n${nextRules}`
    }
  }
  return world
}

export function mergeKnowledgeDocument(
  existing: KnowledgeDocument,
  generated: ParsedKnowledgePayload,
  mode: KnowledgeMergeMode
): KnowledgeDocument {
  return {
    ...existing,
    world: mergeWorld(existing.world ?? { title: '', rules: '' }, generated.world, mode),
    characters: mergeEntityList(existing.characters ?? [], generated.characters, mode),
    factions: mergeEntityList(existing.factions ?? [], generated.factions, mode),
    items: mergeEntityList(existing.items ?? [], generated.items, mode)
  }
}

export function validateMergedKnowledge(doc: KnowledgeDocument): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const title = doc.world?.title?.trim()
  const rules = doc.world?.rules?.trim()
  if (!title && !rules) {
    errors.push('生成结果缺少 world.title 与 world.rules')
  }
  const namedChars = (doc.characters ?? []).filter((c) => c.name?.trim())
  if (!namedChars.length) {
    errors.push('生成结果未包含有效人物（至少 1 名需有 name）')
  }
  return { ok: errors.length === 0, errors }
}

export function countKnowledgePayload(payload: ParsedKnowledgePayload): {
  characters: number
  factions: number
  items: number
} {
  return {
    characters: payload.characters.length,
    factions: payload.factions.length,
    items: payload.items.length
  }
}
