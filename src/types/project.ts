/** 项目内 JSON 文件结构（与 outline/knowledge 落盘一致） */

export type ChapterStatus = 'draft' | 'generating' | 'generated' | 'published'

export interface OutlineBeat {
  order: number
  text: string
}

export interface OutlineChapter {
  id: string
  title: string
  status: ChapterStatus
  beats: OutlineBeat[]
}

export interface OutlineVolume {
  id: string
  title: string
  chapters: OutlineChapter[]
}

export interface OutlineDocument {
  volumes: OutlineVolume[]
}

export interface KnowledgeWorld {
  title: string
  rules: string
  era?: string
  /** 题材：历史 / 军事 / 史诗 … */
  genre?: string
  /** 场景类型标签（与 WIZARD_SCENE_OPTIONS 一致） */
  scene?: string
  /** 具体场景名：如文京、青云宗 */
  scenePlace?: string
  /** 与 map.scale 一致（WorldScale id） */
  mapScale?: string
  /** @deprecated 与 mapScale 同步，兼容旧档 */
  worldScale?: string
  /** 气候倾向（与 map.climate 一致） */
  climate?: string
  /** 地名与国名风格（生成地图/社会层用） */
  placeNamingStyle?: string
  /** 科技水平 */
  techLevel?: string
  atmosphere?: string
  /** 力量体系约束（与 WORLD_MAGIC_CONSTRAINT_OPTIONS 一致） */
  magicConstraint?: string
  /** 冲突主轴 */
  conflictFocus?: string
  /** 叙事风格 */
  narrativeStyle?: string
  /** 社会结构 */
  socialStructure?: string
  /** 政治基调 */
  politicalTone?: string
  /** 战争形态 */
  warfareStyle?: string
  /** 经济支柱 */
  economicBase?: string
  /** 叙事节奏 */
  pacing?: string
  /** 文风 */
  proseRegister?: string
  /** 创作禁忌（、分隔，最多 4 项） */
  contentTaboos?: string
  /** 由选项自动生成的硬性约束全文（保存时刷新） */
  settingConstraints?: string
  mapSeed?: number
  [key: string]: unknown
}

export type TerrainType =
  | 'ocean'
  | 'coast'
  | 'plain'
  | 'hill'
  | 'mountain'
  | 'forest'
  | 'desert'
  | 'wetland'

export type LocationType = 'capital' | 'city' | 'town' | 'village' | 'fortress' | 'landmark'

export type Hilliness = 'flat' | 'small_hills' | 'large_hills' | 'mountains'

export type LandformType =
  | 'none'
  | 'coast'
  | 'fjord'
  | 'canyon'
  | 'escarpment'
  | 'plateau'
  | 'valley'
  | 'archipelago'
  | 'delta'
  | 'lake_shore'

export interface MapTerrainCell {
  /** 格心 x，0–100 */
  x: number
  /** 格心 y，0–100 */
  y: number
  terrain: TerrainType
  climate?: string
  hilliness?: Hilliness
  landform?: LandformType
}

/** 六边形编辑格（平面地图 0–100 坐标） */
export interface MapHexCell {
  id: string
  q: number
  r: number
  /** 格心 x，0–100 */
  x: number
  /** 格心 y，0–100 */
  y: number
  terrain: TerrainType
  /** 0–1 温度 */
  heat?: number
  /** 0–1 湿度 */
  wet?: number
  monsoon?: boolean
  /** 发展程度 0–100 */
  development?: number
  nationId?: string
  regionId?: string
  authorNotes?: string
}

export interface MapHexGrid {
  cols: number
  rows: number
  cells: MapHexCell[]
  /** 网格布局算法版本，变更后自动重建 */
  layoutVersion?: number
}

export interface MapRegion {
  id: string
  name: string
  terrain: TerrainType
  climate: string
  /** 0–100 归一化多边形顶点 */
  polygon: [number, number][]
}

export interface MapLake {
  id: string
  name: string
  /** 中心 0–100 */
  cx: number
  cy: number
  /** 半径（地图百分比，兼容旧数据） */
  radius: number
  /** 自然岸线多边形 0–100 */
  polygon?: [number, number][]
  /** 成因：seasonal=季风/季节降水，endorheic=内流盆地 */
  origin?: 'seasonal' | 'endorheic' | 'tectonic'
}

export interface WorldNation {
  id: string
  name: string
  regionIds: string[]
  capitalLocationId?: string
  government: string
  culture: string
  description: string
  /** 领土叠加显示色 */
  color?: string
  /** 作者设定（政体、历史等） */
  authorSettings?: string
  /**
   * 是否允许海洋格为领土（默认否：识别时仅保留陆地 + 邻接陆地向外一格领海）
   */
  allowOceanTerritory?: boolean
}

export interface MapRiver {
  id: string
  name: string
  points: [number, number][]
  /** Strahler 河序（1=源头小溪，越大越主干） */
  order?: number
  /** 相对流量 0–1 */
  discharge?: number
}

export interface WorldMapDocument {
  version: number
  name: string
  seed: number
  width: number
  height: number
  /** 地形栅格（非海洋单元），用于可靠绘制大陆 */
  terrainCells?: MapTerrainCell[]
  /** 栅格分辨率（每边格数，旧版矢量格） */
  gridSize?: number
  cellSize?: number
  /** 高度图 PNG 像素宽（v3+） */
  renderWidth?: number
  renderHeight?: number
  hasRasterImage?: boolean
  /** 地质演化后阶段 */
  evolutionStage?: 'geological' | 'mature'
  /** 简化的地质年代（百万年） */
  geologicalAgeMa?: number
  /** 生成尺度（与 world.mapScale 一致） */
  scale?: import('./world-gen').WorldScale
  /** 气候倾向（与 world.climate 一致） */
  climate?: import('./world-gen').WorldClimateMode
  /** 地名命名风格 */
  placeNamingStyle?: import('./world-gen').PlaceNamingStyle
  regions: MapRegion[]
  rivers: MapRiver[]
  lakes?: MapLake[]
  nations?: WorldNation[]
  /** 六边形编辑网格 */
  hexGrid?: MapHexGrid
  /** 生成管线版本标识 */
  generatorVersion?: number
  /** 生成引擎标识，如 worldengine */
  generatorEngine?: string
  /** 行省划分目标：每省约多少陆格（18–60；未设则按国土规模推算） */
  cellsPerProvinceTarget?: number
  /** 预计算地图图层（保存时覆写旧缓存，切换图层免重算） */
  layerCache?: WorldMapLayerCacheDocument
}

/** 持久化的单层填色缓存 */
export interface SerializedMapLayerBitmap {
  cacheKey: string
  fills: Record<string, string>
  provinceBorderIds?: string[]
  meta?: { provinceCount?: number }
}

export interface WorldMapLayerCacheDocument {
  schemaVersion: 1
  layers: Partial<
    Record<
      'temperature' | 'humidity' | 'monsoon' | 'development' | 'territory' | 'provinces',
      SerializedMapLayerBitmap
    >
  >
}

export interface SettlementSuitability {
  score: number
  natural: string[]
  social: string[]
}

export interface WorldLocation {
  id: string
  name: string
  type: LocationType
  /** 0–100 地图坐标 */
  x: number
  y: number
  terrain: TerrainType
  climate: string
  regionId?: string
  nationId?: string
  description: string
  population?: string
  suitability?: SettlementSuitability
  /** 发展程度 0–100 */
  development?: number
  /** 作者设定 */
  authorSettings?: string
}

export interface KnowledgeCharacter {
  id: string
  name: string
  role?: string
  traits?: string[]
  appearance?: string
  personality?: string
  notes?: string
  locationId?: string
  relationships?: unknown[]
  [key: string]: unknown
}

export interface KnowledgeFaction {
  id: string
  name: string
  description?: string
  goals?: string
}

export interface KnowledgeItem {
  id: string
  name: string
  description?: string
}

export interface KnowledgeDocument {
  world: KnowledgeWorld
  map: WorldMapDocument | null
  locations: WorldLocation[]
  characters: KnowledgeCharacter[]
  factions: KnowledgeFaction[]
  items: KnowledgeItem[]
  /** 保存时附带，落盘为 map.png 后不写入 JSON */
  mapImageBase64?: string
}

export interface CharacterStateEntry {
  characterId: string
  name: string
  state: string
}

export interface ChapterSummaryEntry {
  chapterId: string
  title?: string
  summary?: string
  keyEvents?: string[]
  characterStates?: CharacterStateEntry[]
  openThreads?: string[]
  updatedAt?: string
}

export interface ForeshadowingEntry {
  id: string
  description: string
  resolved?: boolean
  plantedIn?: string
}

/** 正文/剧情记忆中检测到、尚未写入设定角色库的人名 */
export interface AppearedCharacterEntry {
  name: string
  firstSeenIn: string
  lastSeenIn: string
  chapterIds: string[]
  lastState?: string
  promoted?: boolean
  knowledgeCharacterId?: string
  detectedAt?: string
}

export interface PlotMemoryDocument {
  version: number
  globalSummary: string
  chapterSummaries: ChapterSummaryEntry[]
  foreshadowing: ForeshadowingEntry[]
  appearedCharacters?: AppearedCharacterEntry[]
}

export type WorkspacePanel = 'outline' | 'knowledge' | 'chapter'

export interface GenerateChapterOptions {
  chapter_id: string
  use_outline_beats?: boolean
  generation_prompt?: string
  generation_prompt_text?: string
}
