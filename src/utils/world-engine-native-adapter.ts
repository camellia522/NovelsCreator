import type { MapTerrainCell, TerrainType, WorldMapDocument } from '@/types/project'
import type { WorldGenConfig, WorldGenResult } from '@/types/world-gen'
import { buildHexGridFromMap, computeFullCoverDimensions, HEX_GRID_LAYOUT_VERSION } from '@/utils/world-hex-grid'
import { syncHexClimateFromTerrain } from '@/utils/world-hex-climate'
import { stampMapGenerationMeta } from '@/utils/world-settings-map-bridge'
import { normalizeWorldSeed } from '@/utils/world-seed'

export interface WorldEngineNativePayload {
  ok?: boolean
  error?: string
  worldengineVersion?: string
  worldName?: string
  seed?: number
  width?: number
  height?: number
  numPlates?: number
  seaLevel?: number
  terrainCells?: MapTerrainCell[]
}

function asTerrain(t: string): TerrainType {
  const allowed: TerrainType[] = [
    'ocean',
    'coast',
    'plain',
    'hill',
    'mountain',
    'forest',
    'desert',
    'wetland'
  ]
  return (allowed.includes(t as TerrainType) ? t : 'plain') as TerrainType
}

export function buildWorldGenResultFromNative(
  config: WorldGenConfig,
  payload: WorldEngineNativePayload,
  mapImageDataUrl: string,
  mapImageFilePath?: string
): WorldGenResult {
  const seed = normalizeWorldSeed(payload.seed ?? config.seed)
  const width = payload.width ?? 1024
  const height = payload.height ?? 512
  const terrainCells: MapTerrainCell[] = (payload.terrainCells ?? []).map((c) => ({
    x: c.x,
    y: c.y,
    terrain: asTerrain(String(c.terrain)),
    climate: c.climate
  }))

  const map: WorldMapDocument = {
    version: 11,
    name: config.worldName,
    seed,
    width: 100,
    height: 100,
    renderWidth: width,
    renderHeight: height,
    hasRasterImage: true,
    evolutionStage: 'mature',
    geologicalAgeMa: 0,
    generatorVersion: 11,
    generatorEngine: 'worldengine-native',
    terrainCells,
    gridSize: 64,
    cellSize: 100 / 64,
    hexGrid: (() => {
      const { cols, rows } = computeFullCoverDimensions()
      return {
        cols,
        rows,
        layoutVersion: HEX_GRID_LAYOUT_VERSION,
        cells: buildHexGridFromMap({ terrainCells }, cols, rows)
      }
    })(),
    regions: [],
    rivers: [],
    lakes: [],
    nations: []
  }
  syncHexClimateFromTerrain(map)
  stampMapGenerationMeta(map, config)

  const worldRules = [
    `世界名称：${config.worldName}`,
    config.era ? `时代：${config.era}` : '',
    `生成器：官方 WorldEngine Python 包 v${payload.worldengineVersion ?? '?'}`,
    `分辨率：${width}×${height}px，板块 ${payload.numPlates ?? config.numPlates ?? 10} 个`,
    `海平面：${payload.seaLevel?.toFixed(3) ?? '1.0'}`,
    `流程：pyplatec 板块 → 温度/降水/侵蚀/水文 → Holdridge 生物群系 → 冰盖 → 卫星图`,
    `地图：2:1 等距圆柱 PNG（satellite）→ 球面贴图`
  ]
    .filter(Boolean)
    .join('\n')

  return {
    worldRules,
    map,
    locations: [],
    nations: [],
    mapImageDataUrl,
    mapImageFilePath,
    source: 'procedural'
  }
}
