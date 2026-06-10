import type { MapTerrainCell } from '@/types/project'

/** 将 terrainCells 索引到规则栅格，供 O(1) 按百分坐标取样 */
export function buildTerrainIndex(
  cells: MapTerrainCell[] | undefined,
  gridSize = 64
): Map<string, MapTerrainCell> {
  const index = new Map<string, MapTerrainCell>()
  if (!cells?.length) return index
  for (const c of cells) {
    const gx = Math.min(gridSize - 1, Math.max(0, Math.round((c.x / 100) * gridSize)))
    const gy = Math.min(gridSize - 1, Math.max(0, Math.round((c.y / 100) * gridSize)))
    index.set(`${gx},${gy}`, c)
  }
  return index
}

export function sampleTerrainAt(
  x: number,
  y: number,
  index: Map<string, MapTerrainCell>,
  gridSize = 64
): MapTerrainCell | undefined {
  if (!index.size) return undefined
  const gx = Math.min(gridSize - 1, Math.max(0, Math.round((x / 100) * gridSize)))
  const gy = Math.min(gridSize - 1, Math.max(0, Math.round((y / 100) * gridSize)))
  return index.get(`${gx},${gy}`)
}
