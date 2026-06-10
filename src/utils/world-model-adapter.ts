/**
 * 将 Dify 世界观工作流输出规范化为 WorldGenResult
 */

import type { WorldNation, WorldLocation, WorldMapDocument } from '@/types/project'
import type { WorldGenConfig, WorldGenerateRawOutputs, WorldGenResult } from '@/types/world-gen'
import { parseJsonLoose, unwrapMapFromModelJson } from '@/utils/world-dify-parse'
import { buildRasterFromTerrainCells } from '@/utils/world-map-image'
import { buildEquirectangularFromMap, equirectDimensionsForScale } from '@/utils/world-polygon-raster'
import { TERRAIN_COLORS } from '@/utils/world-terrain-colors'

function parseJson<T>(raw: string | undefined, label: string): T {
  if (!raw?.trim()) throw new Error(`模型输出缺少 ${label}`)
  const parsed = parseJsonLoose<T>(raw, null as T)
  if (parsed == null || (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed as object).length === 0)) {
    throw new Error(`${label} 不是合法 JSON`)
  }
  return parsed
}

function normalizeMapDocument(
  map: WorldMapDocument,
  config: WorldGenConfig,
  seed: number
): WorldMapDocument {
  const { width: rw, height: rh } = equirectDimensionsForScale(config.scale)
  return {
    ...map,
    version: 6,
    name: map.name || config.worldName,
    seed: map.seed ?? seed,
    width: map.width ?? 100,
    height: map.height ?? 100,
    renderWidth: map.renderWidth && map.renderWidth >= (map.renderHeight ?? 0) * 1.8 ? map.renderWidth : rw,
    renderHeight: map.renderHeight ?? rh,
    hasRasterImage: true,
    generatorVersion: 6,
    evolutionStage: 'mature',
    geologicalAgeMa: config.geologicalYearsMa ?? 80,
    regions: map.regions ?? [],
    rivers: map.rivers ?? [],
    lakes: map.lakes ?? [],
    nations: map.nations ?? [],
    gridSize: map.gridSize ?? 64,
    cellSize: map.cellSize ?? 100 / 64
  }
}

function ensureLocationsOnLand(locations: WorldLocation[], map: WorldMapDocument): WorldLocation[] {
  const cells = map.terrainCells ?? []
  if (!cells.length) return locations

  return locations.map((loc) => {
    let nearest = cells[0]
    let best = Infinity
    for (const c of cells) {
      const d = Math.hypot(c.x - loc.x, c.y - loc.y)
      if (d < best) {
        best = d
        nearest = c
      }
    }
    if (best > 8) return loc
    return {
      ...loc,
      terrain: nearest.terrain ?? loc.terrain,
      climate: nearest.climate ?? loc.climate
    }
  })
}

export async function adaptModelWorldOutput(
  config: WorldGenConfig,
  outputs: WorldGenerateRawOutputs,
  mapImageDataUrl?: string
): Promise<WorldGenResult> {
  const seed = config.seed ?? Date.now()
  const mapRaw = unwrapMapFromModelJson(outputs.map_json)
  const map = normalizeMapDocument(parseJsonLoose<WorldMapDocument>(mapRaw, {} as WorldMapDocument), config, seed)
  if (!map.regions?.length && !map.terrainCells?.length) {
    throw new Error('map_json 缺少 regions 或 terrainCells，无法绘制地图贴图')
  }
  let locationsRaw = outputs.locations_json
  if (!locationsRaw?.trim()) {
    const root = parseJsonLoose<Record<string, unknown>>(outputs.map_json, {})
    if (Array.isArray(root.locations)) {
      locationsRaw = JSON.stringify(root.locations)
    }
  }
  const locations = ensureLocationsOnLand(
    parseJson<WorldLocation[]>(locationsRaw, 'locations_json'),
    map
  )
  let nations: WorldNation[] = []
  if (outputs.nations_json?.trim()) {
    nations = parseJson<WorldNation[]>(outputs.nations_json, 'nations_json')
  }
  if (!nations.length && map.nations?.length) nations = map.nations

  map.nations = nations

  const { width, height } = equirectDimensionsForScale(config.scale)
  map.renderWidth = width
  map.renderHeight = height

  let imageUrl =
    buildEquirectangularFromMap(map, { scale: config.scale, seed, width, height }) || undefined

  if (!imageUrl && map.terrainCells?.length) {
    imageUrl = buildRasterFromTerrainCells(map, TERRAIN_COLORS, width, height)
  }

  if (!imageUrl && mapImageDataUrl?.trim()) {
    imageUrl = mapImageDataUrl.trim()
  }

  if (!imageUrl) {
    throw new Error('无法从 map.regions / terrainCells 生成地图贴图，请检查模型输出的 map_json')
  }

  return {
    worldRules: outputs.world_rules?.trim() || `${config.worldName}（${config.era}）由模型生成。`,
    map,
    locations,
    nations,
    mapImageDataUrl: imageUrl,
    source: 'model'
  }
}
