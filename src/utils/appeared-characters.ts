import type { AppearedCharacterEntry, KnowledgeDocument } from '@/types/project'

/** 明显非人名的常用词（含职务泛称） */
const NAME_BLOCKLIST = new Set([
  '霜叶城',
  '北境',
  '南门',
  '西城',
  '东北',
  '哨塔',
  '火炬',
  '信号',
  '文书室',
  '文书',
  '士兵',
  '城卫',
  '军头',
  '骑兵',
  '猎人',
  '难民',
  '牧民',
  '矿场',
  '灰谷',
  '暮雪',
  '洛恩',
  '科拉斯',
  '米尔汗',
  '城邦',
  '联盟',
  '帝国',
  '同盟',
  '圣约',
  '联合',
  '议事',
  '政事',
  '集市',
  '内城',
  '外城',
  '城墙',
  '女墙',
  '垛口',
  '窝棚',
  '检举',
  '密报',
  '调令',
  '军需',
  '档案',
  '本章',
  '上一章',
  '主角',
  '配角',
  '众人',
  '有人',
  '此时',
  '那时',
  '随后',
  '不久',
  '同时',
  '然而',
  '因此',
  '于是'
])

export interface AppearedCandidate {
  name: string
  lastState?: string
  source: 'characterStates' | 'text'
}

function registeredNames(knowledge: KnowledgeDocument): Set<string> {
  const set = new Set<string>()
  for (const c of knowledge.characters ?? []) {
    const n = c.name?.trim()
    if (n) set.add(n)
  }
  return set
}

function locationAndNationNames(knowledge: KnowledgeDocument): Set<string> {
  const set = new Set<string>()
  for (const loc of knowledge.locations ?? []) {
    const n = loc.name?.trim()
    if (n) set.add(n)
  }
  for (const n of knowledge.map?.nations ?? []) {
    const name = n.name?.trim()
    if (name) set.add(name)
  }
  return set
}

function isBlockedName(name: string, knowledge: KnowledgeDocument): boolean {
  const n = name.trim()
  if (n.length < 2 || n.length > 5) return true
  if (NAME_BLOCKLIST.has(n)) return true
  if (locationAndNationNames(knowledge).has(n)) return true
  if (/^(老|小|大|值夜|接班|侦察|极北|守备|议事)/.test(n)) return true
  if (/[的了吗呢啊吧]$/.test(n)) return true
  return false
}

function isRegisteredOrAlias(name: string, registered: Set<string>): boolean {
  if (registered.has(name)) return true
  for (const r of registered) {
    if (name.startsWith(r) && name.length <= r.length + 2) return true
    if (r.startsWith(name) && r.length <= name.length + 2) return true
  }
  return false
}

/** 从正文统计 ≥2 次出现的 2–4 字中文专名候选 */
function extractNamesFromText(text: string, minCount = 2): string[] {
  const counts = new Map<string, number>()
  const re = /[\u4e00-\u9fff]{2,4}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const token = m[0]
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
}

export function collectAppearedCandidates(
  novelBody: string,
  knowledge: KnowledgeDocument,
  characterStates?: { name?: string; state?: string }[]
): AppearedCandidate[] {
  const registered = registeredNames(knowledge)
  const out = new Map<string, AppearedCandidate>()

  for (const cs of characterStates ?? []) {
    const name = cs.name?.trim()
    if (!name || name === 'unknown' || name === '未知') continue
    if (isRegisteredOrAlias(name, registered) || isBlockedName(name, knowledge)) continue
    out.set(name, {
      name,
      lastState: cs.state?.trim() || undefined,
      source: 'characterStates'
    })
  }

  const text = novelBody.trim()
  if (text) {
    for (const name of extractNamesFromText(text, 2)) {
      if (out.has(name)) continue
      if (isRegisteredOrAlias(name, registered) || isBlockedName(name, knowledge)) continue
      out.set(name, { name, source: 'text' })
    }
  }

  return [...out.values()]
}

export function mergeAppearedIntoMemory(
  existing: AppearedCharacterEntry[],
  chapterId: string,
  candidates: AppearedCandidate[]
): { merged: AppearedCharacterEntry[]; newNames: string[] } {
  const list = [...existing]
  const newNames: string[] = []
  const now = new Date().toISOString()

  for (const c of candidates) {
    const idx = list.findIndex((e) => e.name === c.name)
    if (idx >= 0) {
      const prev = list[idx]
      if (!prev.promoted) {
        list[idx] = {
          ...prev,
          lastSeenIn: chapterId,
          chapterIds: prev.chapterIds.includes(chapterId)
            ? prev.chapterIds
            : [...prev.chapterIds, chapterId],
          lastState: c.lastState ?? prev.lastState,
          detectedAt: now
        }
      }
      continue
    }
    list.push({
      name: c.name,
      firstSeenIn: chapterId,
      lastSeenIn: chapterId,
      chapterIds: [chapterId],
      lastState: c.lastState,
      promoted: false,
      detectedAt: now
    })
    newNames.push(c.name)
  }

  list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  return { merged: list, newNames }
}

export function unpromotedAppeared(entries: AppearedCharacterEntry[]): AppearedCharacterEntry[] {
  return entries.filter((e) => !e.promoted)
}
