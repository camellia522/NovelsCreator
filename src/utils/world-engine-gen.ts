/**
 * WorldEngine 完整世界生成（Mindwerks/worldengine 流程）
 * 板块 → 海洋阈值 → 温度/降水/侵蚀/水文/湿度 → Holdridge 生物群系 → 冰盖 → 卫星图
 */

import type { WorldGenConfig, WorldGenResult, WorldScale } from '@/types/world-gen'
import type { MapTerrainCell, TerrainType, WorldMapDocument } from '@/types/project'
import { renderWorldEngineSatelliteMap } from '@/utils/world-engine-render'
import {
  initializeOceanAndThresholds,
  runWorldEngineSimulations,
  type WorldEngineState
} from '@/utils/world-engine-simulations'
import { runWorldEnginePlatePhase } from '@/utils/world-plates-engine'
import { encodeRgbaAsPngDataUrl, sealElevationSeam } from '@/utils/world-map-image'
import {
  clampWorldPlates,
  numPlatesForScale,
  worldEngineDimensions
} from '@/utils/world-engine-official'
import { normalizeWorldSeed } from '@/utils/world-seed'
import { buildHexGridFromMap, computeFullCoverDimensions, HEX_GRID_LAYOUT_VERSION } from '@/utils/world-hex-grid'
import { syncHexClimateFromTerrain } from '@/utils/world-hex-climate'
import { stampMapGenerationMeta } from '@/utils/world-settings-map-bridge'
import { CELLS_PER_PROVINCE_DEFAULT } from '@/utils/world-admin-divisions'

export { numPlatesForScale, worldEngineDimensions } from '@/utils/world-engine-official'

function biomeToTerrain(biome: string, elev: number, hill: number, mountain: number): TerrainType {
  if (biome === 'ocean' || biome === 'sea') return 'ocean'
  if (biome === 'ice' || biome.includes('tundra') || biome.includes('polar')) {
    return elev > mountain ? 'mountain' : 'plain'
  }
  if (elev > mountain) return 'mountain'
  if (elev > hill) return 'hill'
  if (biome.includes('desert') || biome.includes('scrub') || biome.includes('steppe')) return 'desert'
  if (biome.includes('forest') || biome.includes('woodland')) return 'forest'
  return 'plain'
}

function buildTerrainCellsFromWorldEngine(state: WorldEngineState, gridSize = 64): MapTerrainCell[] {
  const { width, height, elevation, ocean, biome, hillLevel, mountainLevel } = state
  const cells: MapTerrainCell[] = []
  const stepX = width / gridSize
  const stepY = height / gridSize

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const px = Math.min(width - 1, Math.floor(gx * stepX + stepX * 0.5))
      const py = Math.min(height - 1, Math.floor(gy * stepY + stepY * 0.5))
      const idx = py * width + px
      const terrain = ocean[idx]
        ? 'ocean'
        : biomeToTerrain(biome[idx], elevation[idx], hillLevel, mountainLevel)
      cells.push({
        x: (gx / gridSize) * 100,
        y: (gy / gridSize) * 100,
        terrain,
        climate: biome[idx]
      })
    }
  }
  return cells
}

function buildWorldRules(config: WorldGenConfig, state: WorldEngineState): string {
  return [
    `世界名称：${config.worldName}`,
    config.era ? `时代：${config.era}` : '',
    `生成器：WorldEngine（GitHub Mindwerks/worldengine）完整流程`,
    `分辨率：${state.width}×${state.height}px，板块 ${state.numPlates} 个`,
    `阶段：板块模拟 → 海洋/阈值 → 温度 → 降水 → 侵蚀 → 水文 → 湿度 → Holdridge 生物群系 → 冰盖`,
    `海平面阈值：${state.oceanLevel.toFixed(2)}，丘陵 ${state.hillLevel.toFixed(2)}，山地 ${state.mountainLevel.toFixed(2)}`,
    `输出：卫星生物群系图 → 2:1 等距圆柱 PNG → 球面贴图`
  ]
    .filter(Boolean)
    .join('\n')
}

export interface WorldEngineGenResult extends WorldGenResult {
  mapImageDataUrl: string
}

export function generateWorldEngineMap(config: WorldGenConfig): WorldEngineGenResult {
  const seed = normalizeWorldSeed(config.seed)
  const numPlates = clampWorldPlates(config.numPlates ?? numPlatesForScale(config.scale))
  const { width, height } = worldEngineDimensions(config.scale)

  const { elevation, plateIds, plates } = runWorldEnginePlatePhase(width, height, seed, numPlates)
  sealElevationSeam(elevation, width, height, 6)

  const state: WorldEngineState = {
    width,
    height,
    seed,
    numPlates,
    elevation,
    plateIds,
    ocean: new Uint8Array(width * height),
    oceanLevel: 1,
    hillLevel: 0,
    mountainLevel: 0,
    temperature: new Float32Array(width * height),
    tempThresholds: [],
    precipitation: new Float32Array(width * height),
    humidity: new Float32Array(width * height),
    humidityQuantiles: {},
    irrigation: new Float32Array(width * height),
    watermap: new Float32Array(width * height),
    watermapThresholds: { creek: 0, river: 0, 'main river': 0 },
    biome: [],
    icecap: new Float32Array(width * height),
    rivermap: new Float32Array(width * height),
    lakemap: new Float32Array(width * height)
  }

  initializeOceanAndThresholds(state)
  runWorldEngineSimulations(state, seed)
  sealElevationSeam(state.elevation, width, height, 4)

  const rgba = renderWorldEngineSatelliteMap(state)
  const mapImageDataUrl = encodeRgbaAsPngDataUrl(rgba, width, height)
  const terrainCells = buildTerrainCellsFromWorldEngine(state, 64)

  const map: WorldMapDocument = {
    version: 10,
    name: config.worldName,
    seed,
    width: 100,
    height: 100,
    renderWidth: width,
    renderHeight: height,
    hasRasterImage: true,
    evolutionStage: 'mature',
    geologicalAgeMa: 0,
    generatorVersion: 10,
    generatorEngine: 'worldengine',
    cellsPerProvinceTarget: CELLS_PER_PROVINCE_DEFAULT,
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

  return {
    worldRules: buildWorldRules(config, state),
    map,
    locations: [],
    nations: [],
    mapImageDataUrl,
    source: 'procedural'
  }
}
