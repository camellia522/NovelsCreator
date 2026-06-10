import type { MapRegion, WorldNation } from '@/types/project'

export function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi
    if (hit) inside = !inside
  }
  return inside
}

export function pointInNationTerritory(
  x: number,
  y: number,
  nation: WorldNation,
  regions: MapRegion[]
): boolean {
  const nationRegions = regions.filter((r) => nation.regionIds.includes(r.id))
  for (const r of nationRegions) {
    if (pointInPolygon(x, y, r.polygon)) return true
  }
  return false
}

export function nationAtPoint(
  x: number,
  y: number,
  nations: WorldNation[],
  regions: MapRegion[]
): WorldNation | undefined {
  for (const n of nations) {
    if (pointInNationTerritory(x, y, n, regions)) return n
  }
  return undefined
}

export const NATION_COLORS = [
  '#e8c54788',
  '#6eb5ff88',
  '#8fd4a088',
  '#c96a6a88',
  '#b88cff88',
  '#f0a06088',
  '#5ec8c888',
  '#d4a5ff88'
]

export function nationColor(index: number): string {
  return NATION_COLORS[index % NATION_COLORS.length]
}
