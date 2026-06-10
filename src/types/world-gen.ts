/** 世界观生成器配置 */

export type WorldScale = 'kingdom' | 'archipelago' | 'continent' | 'world' | 'planet'
export type WorldClimateMode = 'temperate' | 'cold' | 'tropical' | 'mixed'
/** 国家 / 城市本地占位与 LLM 润色的命名风格 */
export type PlaceNamingStyle = 'chinese' | 'western' | 'japanese' | 'fantasy' | 'mixed'
export type TerrainType = 'ocean' | 'coast' | 'plain' | 'hill' | 'mountain' | 'forest' | 'desert' | 'wetland'
export type LocationType = 'capital' | 'city' | 'town' | 'village' | 'fortress' | 'landmark'

export interface WorldGenConfig {
  worldName: string
  era: string
  /** 主要场景类型（与章节向导 WIZARD_SCENE_OPTIONS 一致） */
  scene?: string
  /** 具体场景名（如平京），写入 knowledge/world.scenePlace */
  scenePlace?: string
  atmosphere: string[]
  scale: WorldScale
  climate: WorldClimateMode
  cityCount: number
  includeLandmarks: boolean
  /** 地名与国名风格；默认中式。混合模式按国家轮换风格 */
  placeNamingStyle?: PlaceNamingStyle
  seed?: number
  /** WorldEngine 板块数量（默认 10，与 GitHub CLI -q 一致） */
  numPlates?: number
  /** @deprecated 已由 WorldEngine 侵蚀/冰盖模拟替代 */
  geologicalYearsMa?: number
  /** @deprecated WorldEngine full 步骤默认生成河流 */
  includeRivers?: boolean
  /** @deprecated WorldEngine 水文模拟 */
  includeLakes?: boolean
  /** @deprecated 使用 WorldEngine IcecapSimulation */
  regularPolarCaps?: boolean
  /** @deprecated */
  includeNations?: boolean
  /** @deprecated */
  includeSettlements?: boolean
  /** @deprecated WorldEngine 不使用此开关 */
  terrainQuality?: 'high' | 'ultra'
}

export interface WorldGenResult {
  worldRules: string
  map: import('./project').WorldMapDocument
  locations: import('./project').WorldLocation[]
  nations: import('./project').WorldNation[]
  /** PNG 底图（Data URL 或 file://），写入项目时落盘为 knowledge/map.png */
  mapImageDataUrl?: string
  /** 原生 WorldEngine 生成的本地 PNG 路径（应用项目时再读为 base64） */
  mapImageFilePath?: string
  /** 生成来源 */
  source?: 'model' | 'procedural'
}

/** Dify 世界观工作流原始输出 */
export interface WorldGenerateRawOutputs {
  status: 'success' | 'error'
  world_rules?: string
  map_json?: string
  locations_json?: string
  nations_json?: string
  map_image_base64?: string
  map_image_url?: string
  workflow_version?: string
  error_message?: string
}

export interface WorldGenerateResponse {
  ok: boolean
  error?: string
  outputs?: WorldGenerateRawOutputs
  workflowRunId?: string
  /** 主进程已解析的地图 Data URL */
  mapImageDataUrl?: string
}

export interface WorldEngineCheckResponse {
  ok: boolean
  installed: boolean
  pythonPath?: string
  worldengineVersion?: string
  error?: string
}

export interface WorldEngineNativeGenerateResponse {
  ok: boolean
  error?: string
  /** 本地 PNG 路径（避免 IPC 传输超大 base64） */
  mapFilePath?: string
  payload?: {
    worldengineVersion?: string
    worldName?: string
    seed?: number
    width?: number
    height?: number
    numPlates?: number
    seaLevel?: number
    terrainCells?: import('./project').MapTerrainCell[]
  }
}

/** 领土已绘制后的国家/城市 LLM 生成（可选 Dify）；空间信息在 territoryBriefJson 中，勿传整份 map */
export interface WorldSocietyGenerateRequest {
  config: WorldGenConfig
  nations: import('./project').WorldNation[]
  territoryBriefJson: string
}

export interface WorldSocietyGenerateResponse {
  ok: boolean
  error?: string
  workflowRunId?: string
  society_json?: string
  nations_json?: string
  locations_json?: string
  world_rules?: string
}
