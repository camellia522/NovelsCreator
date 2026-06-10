import type { WorldMapDocument, WorldNation } from '@/types/project'
import { resyncHexCellCenters } from '@/utils/world-hex-grid'
import { syncHexClimateFromTerrain } from '@/utils/world-hex-climate'
import {
  loadMapImage,
  rebuildTerrainCellsFromImage,
  syncHexTerrainFromImage
} from '@/utils/world-map-raster-sample'
import { applyTerritoryRecognition } from '@/utils/world-territory-recognition'

export interface TerritoryLandAlignResult {
  hexTerrainUpdated: number
  terrainCellsRebuilt: number
  hexCentersFixed: number
  oceanTerritoryCleared: number
}

function countOceanTerritory(map: WorldMapDocument): number {
  return map.hexGrid?.cells.filter((c) => c.nationId && c.terrain === 'ocean').length ?? 0
}

/** 以地势 PNG 为准同步陆海，并修剪落在海洋上的国家领土 */
export function alignTerritoryWithTerrainMap(
  map: WorldMapDocument,
  nations: WorldNation[],
  img: HTMLImageElement
): TerritoryLandAlignResult {
  const hexCentersFixed = resyncHexCellCenters(map)
  const hexTerrainUpdated = syncHexTerrainFromImage(map, img)
  const terrainCellsRebuilt = rebuildTerrainCellsFromImage(map, img)
  const beforeOcean = countOceanTerritory(map)
  applyTerritoryRecognition(map, nations)
  const oceanTerritoryCleared = Math.max(0, beforeOcean - countOceanTerritory(map))
  syncHexClimateFromTerrain(map)
  return {
    hexTerrainUpdated,
    terrainCellsRebuilt,
    hexCentersFixed,
    oceanTerritoryCleared
  }
}

export async function alignTerritoryWithTerrainMapFromUrl(
  map: WorldMapDocument,
  nations: WorldNation[],
  imageUrl: string
): Promise<TerritoryLandAlignResult> {
  const img = await loadMapImage(imageUrl)
  return alignTerritoryWithTerrainMap(map, nations, img)
}
