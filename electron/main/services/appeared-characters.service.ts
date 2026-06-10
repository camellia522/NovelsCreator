import type { MemoryPatch } from '../../src/types/api'
import type { AppearedCharacterEntry, KnowledgeCharacter, PlotMemoryDocument } from '../../src/types/project'
import {
  collectAppearedCandidates,
  mergeAppearedIntoMemory,
  unpromotedAppeared
} from '@/utils/appeared-characters'
import { readKnowledge, readPlotMemory, saveKnowledge, savePlotMemory } from './project-files.service'
import { stripThinkBlocks } from '../utils/novel-text'
import { parseMemoryPatchFromRaw } from '../utils/memory-patch-parse'

export interface ScanAppearedResult {
  newNames: string[]
  newCount: number
  pendingCount: number
  appearedCharacters: AppearedCharacterEntry[]
}

function characterStatesFromPatch(raw: MemoryPatch | string | undefined): { name?: string; state?: string }[] {
  const patch = parseMemoryPatchFromRaw(raw)
  const cs = patch?.chapterSummary
  if (!cs || typeof cs !== 'object') return []
  const arr = (cs as Record<string, unknown>).characterStates
  if (!Array.isArray(arr)) return []
  return arr.map((s) => {
    const o = s as Record<string, unknown>
    return { name: String(o.name ?? ''), state: String(o.state ?? '') }
  })
}

function characterStatesFromMemory(doc: PlotMemoryDocument, chapterId: string): { name?: string; state?: string }[] {
  const entry = doc.chapterSummaries.find((s) => s.chapterId === chapterId)
  return (entry?.characterStates ?? []).map((s) => ({ name: s.name, state: s.state }))
}

export async function scanAppearedCharactersAfterChapter(
  chapterId: string,
  novelBody: string,
  rawPatch?: MemoryPatch | string
): Promise<ScanAppearedResult> {
  const knowledge = await readKnowledge()
  const memory = await readPlotMemory()
  const cleaned = stripThinkBlocks(novelBody)
  const fromPatch = characterStatesFromPatch(rawPatch)
  const fromMemory = characterStatesFromMemory(memory, chapterId)
  const characterStates = [...fromPatch, ...fromMemory]

  const candidates = collectAppearedCandidates(cleaned, knowledge, characterStates)
  const existing = memory.appearedCharacters ?? []
  const { merged, newNames } = mergeAppearedIntoMemory(existing, chapterId, candidates)

  memory.appearedCharacters = merged
  await savePlotMemory(memory)

  const pending = unpromotedAppeared(merged)
  return {
    newNames,
    newCount: newNames.length,
    pendingCount: pending.length,
    appearedCharacters: merged
  }
}

function nextCharacterId(characters: KnowledgeCharacter[]): string {
  let max = 0
  for (const c of characters) {
    const m = /^char-(\d{3})$/.exec(c.id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `char-${String(max + 1).padStart(3, '0')}`
}

export async function promoteAppearedCharactersToKnowledge(
  names: string[]
): Promise<{ promoted: string[]; skipped: string[] }> {
  const pick = new Set(names.map((n) => n.trim()).filter(Boolean))
  if (!pick.size) return { promoted: [], skipped: [] }

  const knowledge = await readKnowledge()
  const memory = await readPlotMemory()
  const appeared = memory.appearedCharacters ?? []
  const promoted: string[] = []
  const skipped: string[] = []

  for (const name of pick) {
    const hit = appeared.find((e) => e.name === name && !e.promoted)
    if (!hit) {
      skipped.push(name)
      continue
    }
    if (knowledge.characters.some((c) => c.name.trim() === name)) {
      hit.promoted = true
      skipped.push(name)
      continue
    }
    const id = nextCharacterId(knowledge.characters)
    knowledge.characters.push({
      id,
      name,
      role: '配角',
      traits: [],
      appearance: '',
      personality: '',
      notes: hit.lastState ? `首次出现于 ${hit.firstSeenIn}。${hit.lastState}` : `首次出现于 ${hit.firstSeenIn}`
    })
    hit.promoted = true
    hit.knowledgeCharacterId = id
    promoted.push(name)
  }

  if (promoted.length) {
    await saveKnowledge(knowledge)
    await savePlotMemory(memory)
  }

  return { promoted, skipped }
}
