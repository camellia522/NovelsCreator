import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ChapterSummaryEntry,
  ForeshadowingEntry,
  KnowledgeCharacter,
  KnowledgeDocument,
  KnowledgeFaction,
  KnowledgeItem,
  MapTerrainCell,
  OutlineDocument,
  PlotMemoryDocument,
  WorldLocation,
  WorldMapDocument
} from '../../src/types/project'
import { getCurrentProject } from './project.service'

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

/** 从 { key: [] }、裸数组或空对象中安全取出实体列表 */
function extractEntityList(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const nested = obj[key]
    if (Array.isArray(nested)) return nested
  }
  return []
}

function requireProject() {
  const project = getCurrentProject()
  if (!project) {
    throw new Error('未打开项目')
  }
  return project
}

export async function readOutline(): Promise<OutlineDocument> {
  const project = requireProject()
  const raw = await readFile(join(project.rootPath, 'outline', 'outline.json'), 'utf-8')
  return JSON.parse(raw) as OutlineDocument
}

export async function saveOutline(doc: OutlineDocument): Promise<void> {
  const project = requireProject()
  await writeJson(join(project.rootPath, 'outline', 'outline.json'), doc)
}

async function readJsonFile(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return null
  }
}

function normalizeMap(raw: unknown): WorldMapDocument | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const regions = Array.isArray(o.regions)
    ? o.regions.map((r, i) => {
        const x = r as Record<string, unknown>
        return {
          id: String(x.id ?? `reg-${String(i + 1).padStart(3, '0')}`),
          name: String(x.name ?? ''),
          terrain: String(x.terrain ?? 'plain') as WorldMapDocument['regions'][0]['terrain'],
          climate: String(x.climate ?? ''),
          polygon: Array.isArray(x.polygon)
            ? x.polygon.map((p) => {
                const pt = p as number[]
                return [Number(pt[0] ?? 0), Number(pt[1] ?? 0)] as [number, number]
              })
            : []
        }
      })
    : []
  const rivers = Array.isArray(o.rivers)
    ? o.rivers.map((r, i) => {
        const x = r as Record<string, unknown>
        return {
          id: String(x.id ?? `river-${i + 1}`),
          name: String(x.name ?? ''),
          points: Array.isArray(x.points)
            ? x.points.map((p) => {
                const pt = p as number[]
                return [Number(pt[0] ?? 0), Number(pt[1] ?? 0)] as [number, number]
              })
            : []
        }
      })
    : []
  if (
    !regions.length &&
    !rivers.length &&
    !o.name &&
    !Array.isArray(o.terrainCells) &&
    o.renderWidth == null
  )
    return null
  const terrainCells: MapTerrainCell[] | undefined = Array.isArray(o.terrainCells)
    ? o.terrainCells.map((c) => {
        const x = c as Record<string, unknown>
        return {
          x: Number(x.x ?? 0),
          y: Number(x.y ?? 0),
          terrain: String(x.terrain ?? 'plain') as MapTerrainCell['terrain']
        }
      })
    : undefined
  const hexGrid =
    o.hexGrid && typeof o.hexGrid === 'object'
      ? (() => {
          const g = o.hexGrid as Record<string, unknown>
          const cells = Array.isArray(g.cells)
            ? g.cells.map((c, i) => {
                const x = c as Record<string, unknown>
                return {
                  id: String(x.id ?? `hex-${i}`),
                  q: Number(x.q ?? 0),
                  r: Number(x.r ?? 0),
                  x: Number(x.x ?? 0),
                  y: Number(x.y ?? 0),
                  terrain: String(x.terrain ?? 'plain') as MapTerrainCell['terrain'],
                  heat: x.heat != null ? Number(x.heat) : undefined,
                  wet: x.wet != null ? Number(x.wet) : undefined,
                  monsoon: x.monsoon === true,
                  development: x.development != null ? Number(x.development) : undefined,
                  nationId: x.nationId != null ? String(x.nationId) : undefined,
                  regionId: x.regionId != null ? String(x.regionId) : undefined,
                  authorNotes: x.authorNotes != null ? String(x.authorNotes) : undefined
                }
              })
            : []
          return {
            cols: Number(g.cols ?? 32),
            rows: Number(g.rows ?? 20),
            cells
          }
        })()
      : undefined

  const nations = Array.isArray(o.nations)
    ? o.nations.map((n, i) => {
        const x = n as Record<string, unknown>
        return {
          id: String(x.id ?? `nation-${i + 1}`),
          name: String(x.name ?? ''),
          regionIds: Array.isArray(x.regionIds) ? x.regionIds.map(String) : [],
          capitalLocationId:
            x.capitalLocationId != null ? String(x.capitalLocationId) : undefined,
          government: String(x.government ?? ''),
          culture: String(x.culture ?? ''),
          description: String(x.description ?? ''),
          color: x.color != null ? String(x.color) : undefined,
          authorSettings: x.authorSettings != null ? String(x.authorSettings) : undefined
        }
      })
    : undefined

  const layerCache =
    o.layerCache && typeof o.layerCache === 'object'
      ? (JSON.parse(JSON.stringify(o.layerCache)) as WorldMapDocument['layerCache'])
      : undefined

  return {
    version: Number(o.version ?? 1),
    name: String(o.name ?? ''),
    seed: Number(o.seed ?? 0),
    width: Number(o.width ?? 100),
    height: Number(o.height ?? 100),
    scale: o.scale != null ? (String(o.scale) as WorldMapDocument['scale']) : undefined,
    climate: o.climate != null ? (String(o.climate) as WorldMapDocument['climate']) : undefined,
    placeNamingStyle:
      o.placeNamingStyle != null
        ? (String(o.placeNamingStyle) as WorldMapDocument['placeNamingStyle'])
        : undefined,
    renderWidth: o.renderWidth != null ? Number(o.renderWidth) : undefined,
    renderHeight: o.renderHeight != null ? Number(o.renderHeight) : undefined,
    hasRasterImage: o.hasRasterImage === true,
    terrainCells,
    cellSize: o.cellSize != null ? Number(o.cellSize) : undefined,
    gridSize: o.gridSize != null ? Number(o.gridSize) : undefined,
    hexGrid,
    regions,
    rivers,
    nations,
    cellsPerProvinceTarget:
      o.cellsPerProvinceTarget != null ? Number(o.cellsPerProvinceTarget) : undefined,
    layerCache
  }
}

function normalizeLocations(raw: unknown): WorldLocation[] {
  const list = extractEntityList(raw, 'locations')
  return list.map((item, i) => {
    const o = item as Record<string, unknown>
    return {
      id: String(o.id ?? `loc-${String(i + 1).padStart(3, '0')}`),
      name: String(o.name ?? ''),
      type: (o.type as WorldLocation['type']) ?? 'city',
      x: Number(o.x ?? 0),
      y: Number(o.y ?? 0),
      terrain: (o.terrain as WorldLocation['terrain']) ?? 'plain',
      climate: String(o.climate ?? ''),
      regionId: o.regionId != null ? String(o.regionId) : undefined,
      description: String(o.description ?? ''),
      population: o.population != null ? String(o.population) : undefined,
      development: o.development != null ? Number(o.development) : undefined,
      authorSettings: o.authorSettings != null ? String(o.authorSettings) : undefined,
      nationId: o.nationId != null ? String(o.nationId) : undefined
    }
  })
}

export async function readKnowledge(): Promise<KnowledgeDocument> {
  const project = requireProject()
  const root = project.rootPath
  const world = JSON.parse(await readFile(join(root, 'knowledge', 'world.json'), 'utf-8'))
  const characters = JSON.parse(await readFile(join(root, 'knowledge', 'characters.json'), 'utf-8'))
  const factions = JSON.parse(await readFile(join(root, 'knowledge', 'factions.json'), 'utf-8'))
  const items = JSON.parse(await readFile(join(root, 'knowledge', 'items.json'), 'utf-8'))
  const mapRaw = await readJsonFile(join(root, 'knowledge', 'map.json'))
  const locRaw = await readJsonFile(join(root, 'knowledge', 'locations.json'))

  return {
    world: normalizeWorld(world as Record<string, unknown>),
    map: normalizeMap(mapRaw),
    locations: normalizeLocations(locRaw ?? []),
    characters: normalizeCharacters(extractEntityList(characters, 'characters')),
    factions: normalizeFactions(extractEntityList(factions, 'factions')),
    items: normalizeItems(extractEntityList(items, 'items'))
  }
}

function normalizeWorld(raw: Record<string, unknown>): KnowledgeDocument['world'] {
  const world: KnowledgeDocument['world'] = {
    title: String(raw.title ?? '新世界'),
    rules: String(raw.rules ?? ''),
    era: raw.era != null ? String(raw.era) : '',
    genre: raw.genre != null ? String(raw.genre) : '',
    scene: raw.scene != null ? String(raw.scene) : '',
    scenePlace: raw.scenePlace != null ? String(raw.scenePlace) : '',
    mapScale: raw.mapScale != null ? String(raw.mapScale) : '',
    worldScale: raw.worldScale != null ? String(raw.worldScale) : '',
    climate: raw.climate != null ? String(raw.climate) : '',
    placeNamingStyle: raw.placeNamingStyle != null ? String(raw.placeNamingStyle) : '',
    techLevel: raw.techLevel != null ? String(raw.techLevel) : '',
    atmosphere: raw.atmosphere != null ? String(raw.atmosphere) : '',
    magicConstraint: raw.magicConstraint != null ? String(raw.magicConstraint) : '',
    conflictFocus: raw.conflictFocus != null ? String(raw.conflictFocus) : '',
    narrativeStyle: raw.narrativeStyle != null ? String(raw.narrativeStyle) : '',
    socialStructure: raw.socialStructure != null ? String(raw.socialStructure) : '',
    politicalTone: raw.politicalTone != null ? String(raw.politicalTone) : '',
    warfareStyle: raw.warfareStyle != null ? String(raw.warfareStyle) : '',
    economicBase: raw.economicBase != null ? String(raw.economicBase) : '',
    pacing: raw.pacing != null ? String(raw.pacing) : '',
    proseRegister: raw.proseRegister != null ? String(raw.proseRegister) : '',
    contentTaboos: raw.contentTaboos != null ? String(raw.contentTaboos) : '',
    settingConstraints: raw.settingConstraints != null ? String(raw.settingConstraints) : ''
  }
  return world
}

function normalizeCharacters(raw: unknown[]): KnowledgeCharacter[] {
  return raw.map((c, i) => {
    const o = c as Record<string, unknown>
    return {
      id: String(o.id ?? `char-${String(i + 1).padStart(3, '0')}`),
      name: String(o.name ?? ''),
      role: o.role != null ? String(o.role) : '',
      traits: Array.isArray(o.traits) ? o.traits.map(String) : [],
      appearance: o.appearance != null ? String(o.appearance) : '',
      personality: o.personality != null ? String(o.personality) : '',
      notes: o.notes != null ? String(o.notes) : '',
      locationId: o.locationId != null ? String(o.locationId) : undefined
    }
  })
}

function normalizeFactions(raw: unknown[]): KnowledgeFaction[] {
  return raw.map((f, i) => {
    const o = f as Record<string, unknown>
    return {
      id: String(o.id ?? `faction-${String(i + 1).padStart(3, '0')}`),
      name: String(o.name ?? ''),
      description: o.description != null ? String(o.description) : '',
      goals: o.goals != null ? String(o.goals) : ''
    }
  })
}

function normalizeItems(raw: unknown[]): KnowledgeItem[] {
  return raw.map((it, i) => {
    const o = it as Record<string, unknown>
    return {
      id: String(o.id ?? `item-${String(i + 1).padStart(3, '0')}`),
      name: String(o.name ?? ''),
      description: o.description != null ? String(o.description) : ''
    }
  })
}

function normalizePlotMemory(raw: Record<string, unknown>): PlotMemoryDocument {
  const chapterSummaries = Array.isArray(raw.chapterSummaries)
    ? raw.chapterSummaries.map((s, i) => {
        const o = s as Record<string, unknown>
        return {
          chapterId: String(o.chapterId ?? o.chapter_id ?? `ch-${String(i + 1).padStart(3, '0')}`),
          title: o.title != null ? String(o.title) : '',
          summary: o.summary != null ? String(o.summary) : '',
          keyEvents: Array.isArray(o.keyEvents) ? o.keyEvents.map(String) : [],
          characterStates: Array.isArray(o.characterStates)
            ? o.characterStates.map((s) => {
                const c = s as Record<string, unknown>
                return {
                  characterId: String(c.characterId ?? c.character_id ?? 'unknown'),
                  name: String(c.name ?? ''),
                  state: String(c.state ?? '')
                }
              })
            : [],
          openThreads: Array.isArray(o.openThreads) ? o.openThreads.map(String) : [],
          updatedAt: o.updatedAt != null ? String(o.updatedAt) : undefined
        } satisfies ChapterSummaryEntry
      })
    : []

  const foreshadowing = Array.isArray(raw.foreshadowing)
    ? raw.foreshadowing.map((f, i) => {
        const o = f as Record<string, unknown>
        return {
          id: String(o.id ?? `fs-${String(i + 1).padStart(3, '0')}`),
          description: String(o.description ?? ''),
          resolved: Boolean(o.resolved),
          plantedIn: o.plantedIn != null ? String(o.plantedIn) : undefined
        } satisfies ForeshadowingEntry
      })
    : []

  return {
    version: Number(raw.version ?? 1),
    globalSummary: String(raw.globalSummary ?? ''),
    chapterSummaries,
    foreshadowing,
    appearedCharacters: normalizeAppearedCharacters(raw.appearedCharacters)
  }
}

function normalizeAppearedCharacters(raw: unknown): import('../../src/types/project').AppearedCharacterEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const o = item as Record<string, unknown>
    const chapterIds = Array.isArray(o.chapterIds) ? o.chapterIds.map(String) : []
    return {
      name: String(o.name ?? ''),
      firstSeenIn: String(o.firstSeenIn ?? o.first_seen_in ?? ''),
      lastSeenIn: String(o.lastSeenIn ?? o.last_seen_in ?? ''),
      chapterIds,
      lastState: o.lastState != null ? String(o.lastState) : undefined,
      promoted: Boolean(o.promoted),
      knowledgeCharacterId:
        o.knowledgeCharacterId != null ? String(o.knowledgeCharacterId) : undefined,
      detectedAt: o.detectedAt != null ? String(o.detectedAt) : undefined
    }
  }).filter((e) => e.name.trim())
}

export async function readMapImagePath(): Promise<string | null> {
  const project = requireProject()
  const path = join(project.rootPath, 'knowledge', 'map.png')
  try {
    await access(path)
    return path
  } catch {
    return null
  }
}

export async function readMapImageDataUrl(): Promise<string | null> {
  const project = requireProject()
  const path = join(project.rootPath, 'knowledge', 'map.png')
  try {
    const buf = await readFile(path)
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function saveKnowledge(doc: KnowledgeDocument): Promise<void> {
  const project = requireProject()
  const root = project.rootPath
  await writeJson(join(root, 'knowledge', 'world.json'), doc.world)
  await writeJson(join(root, 'knowledge', 'characters.json'), { characters: doc.characters })
  await writeJson(join(root, 'knowledge', 'factions.json'), { factions: doc.factions })
  await writeJson(join(root, 'knowledge', 'items.json'), { items: doc.items })
  if (doc.mapImageBase64 && doc.map) {
    doc.map = { ...doc.map, hasRasterImage: true }
  }
  if (doc.map) {
    await writeJson(join(root, 'knowledge', 'map.json'), doc.map)
  }
  if (doc.mapImageBase64) {
    const raw = doc.mapImageBase64.replace(/^data:image\/\w+;base64,/, '')
    await writeFile(join(root, 'knowledge', 'map.png'), Buffer.from(raw, 'base64'))
  }
  await writeJson(join(root, 'knowledge', 'locations.json'), { locations: doc.locations })
}

export async function readPlotMemory(): Promise<PlotMemoryDocument> {
  const project = requireProject()
  const raw = JSON.parse(
    await readFile(join(project.rootPath, 'memory', 'plot-memory.json'), 'utf-8')
  ) as Record<string, unknown>
  return normalizePlotMemory(raw)
}

export async function savePlotMemory(doc: PlotMemoryDocument): Promise<void> {
  const project = requireProject()
  await writeJson(join(project.rootPath, 'memory', 'plot-memory.json'), doc)
}

export async function readChapterText(
  chapterId: string,
  kind: 'novel' | 'video'
): Promise<string> {
  const project = requireProject()
  const file = kind === 'novel' ? 'novel.txt' : 'video-script.txt'
  const path = join(project.rootPath, 'chapters', 'vol-01', chapterId, file)
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return ''
  }
}

export async function saveChapterText(
  chapterId: string,
  kind: 'novel' | 'video',
  content: string
): Promise<void> {
  const project = requireProject()
  const dir = join(project.rootPath, 'chapters', 'vol-01', chapterId)
  await mkdir(dir, { recursive: true })
  const file = kind === 'novel' ? 'novel.txt' : 'video-script.txt'
  await writeFile(join(dir, file), content, 'utf-8')
}

/** 删除 chapters/{vol}/{chapterId} 目录（若存在） */
export async function deleteChapterAssets(chapterId: string): Promise<boolean> {
  const project = requireProject()
  const chaptersRoot = join(project.rootPath, 'chapters')
  let deleted = false
  try {
    const vols = await readdir(chaptersRoot, { withFileTypes: true })
    for (const ent of vols) {
      if (!ent.isDirectory()) continue
      const dir = join(chaptersRoot, ent.name, chapterId)
      try {
        await rm(dir, { recursive: true, force: true })
        deleted = true
      } catch {
        /* 目录不存在 */
      }
    }
  } catch {
    /* chapters 根目录不存在 */
  }
  return deleted
}
