import type {
  KnowledgeDocument,
  KnowledgeWorld,
  MapRegion,
  WorldLocation,
  WorldMapDocument,
  WorldNation
} from '../../../src/types/project'

/** 章节生成用知识库快照（剔除 hexGrid / terrainCells / layerCache 等巨型字段） */
export interface ChapterKnowledgeSnapshot {
  world: KnowledgeWorld
  nations: SlimNation[]
  locations: SlimLocation[]
  regions: SlimRegion[]
  characters: KnowledgeDocument['characters']
  factions: KnowledgeDocument['factions']
  items: KnowledgeDocument['items']
  mapMeta?: {
    name: string
    seed: number
    renderWidth?: number
    renderHeight?: number
  }
}

interface SlimNation {
  id: string
  name: string
  government: string
  culture: string
  description: string
  capitalLocationId?: string
  authorSettings?: string
  regionIds?: string[]
}

interface SlimLocation {
  id: string
  name: string
  type: WorldLocation['type']
  x: number
  y: number
  terrain: WorldLocation['terrain']
  climate: string
  regionId?: string
  nationId?: string
  description: string
  population?: string
  development?: number
}

interface SlimRegion {
  id: string
  name: string
  terrain: MapRegion['terrain']
  climate: string
}

function slimNation(n: WorldNation): SlimNation {
  return {
    id: n.id,
    name: n.name,
    government: n.government,
    culture: n.culture,
    description: n.description,
    capitalLocationId: n.capitalLocationId,
    authorSettings: n.authorSettings,
    regionIds: n.regionIds
  }
}

function slimLocation(loc: WorldLocation): SlimLocation {
  return {
    id: loc.id,
    name: loc.name,
    type: loc.type,
    x: loc.x,
    y: loc.y,
    terrain: loc.terrain,
    climate: loc.climate,
    regionId: loc.regionId,
    nationId: loc.nationId,
    description: loc.description,
    population: loc.population,
    development: loc.development
  }
}

function slimRegion(r: MapRegion): SlimRegion {
  return {
    id: r.id,
    name: r.name,
    terrain: r.terrain,
    climate: r.climate
  }
}

/** 从完整 knowledge 文档构建章节工作流可用的轻量快照 */
export function buildChapterKnowledgeSnapshot(knowledge: KnowledgeDocument): ChapterKnowledgeSnapshot {
  const map = knowledge.map
  const nations = (map?.nations ?? []).map(slimNation)
  const locations = (knowledge.locations ?? []).map(slimLocation)
  const regions = (map?.regions ?? []).slice(0, 80).map(slimRegion)

  const snapshot: ChapterKnowledgeSnapshot = {
    world: knowledge.world ?? { title: '', rules: '' },
    nations,
    locations,
    regions,
    characters: knowledge.characters ?? [],
    factions: knowledge.factions ?? [],
    items: knowledge.items ?? []
  }

  if (map?.name) {
    snapshot.mapMeta = {
      name: map.name,
      seed: map.seed,
      renderWidth: map.renderWidth,
      renderHeight: map.renderHeight
    }
  }

  return snapshot
}

export function serializeChapterKnowledgeSnapshot(knowledge: KnowledgeDocument): string {
  return JSON.stringify(buildChapterKnowledgeSnapshot(knowledge))
}

/** 调试：快照字符数（约等于 token 体积参考） */
export function chapterSnapshotCharCount(knowledge: KnowledgeDocument): number {
  return serializeChapterKnowledgeSnapshot(knowledge).length
}
