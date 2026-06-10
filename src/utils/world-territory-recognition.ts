/**
 * 涂抹后领土识别：陆地为核心；不允许海洋为领地时仅保留向外一格领海。
 */

import type { MapHexCell, WorldMapDocument, WorldNation } from '@/types/project'
import { ensureMapHexGrid, hexNeighborCoords } from '@/utils/world-hex-grid'

export function nationAllowsOceanTerritory(nation: WorldNation): boolean {
  return nation.allowOceanTerritory === true
}

function cellKey(c: MapHexCell): string {
  return `${c.q},${c.r}`
}

/** 该海洋格是否可作为 nationId 的领海（邻接本国陆地、不邻接他国陆地） */
export function isTerritorialSeaForNation(
  cell: MapHexCell,
  nationId: string,
  index: Map<string, MapHexCell>,
  cols: number,
  rows: number
): boolean {
  if (cell.terrain !== 'ocean') return false
  let touchesOurLand = false
  for (const nb of hexNeighborCoords(cell.q, cell.r, cols, rows)) {
    const other = index.get(`${nb.q},${nb.r}`)
    if (!other) continue
    if (other.nationId === nationId && other.terrain !== 'ocean') touchesOurLand = true
    if (other.nationId && other.nationId !== nationId && other.terrain !== 'ocean') return false
  }
  return touchesOurLand
}

/** 识别单国领土：不允许海洋时仅保留陆地 + 一格领海 */
export function recognizeNationTerritory(
  map: WorldMapDocument,
  nation: WorldNation
): void {
  ensureMapHexGrid(map)
  const { cols, rows } = map.hexGrid!
  const index = new Map(map.hexGrid!.cells.map((c) => [cellKey(c), c]))
  const nationId = nation.id

  if (nationAllowsOceanTerritory(nation)) return

  const assigned = map.hexGrid!.cells.filter((c) => c.nationId === nationId)
  const land = assigned.filter((c) => c.terrain !== 'ocean')
  if (!land.length) {
    for (const c of assigned) c.nationId = undefined
    return
  }

  const keepSea = new Set<string>()
  for (const c of land) {
    for (const nb of hexNeighborCoords(c.q, c.r, cols, rows)) {
      const other = index.get(`${nb.q},${nb.r}`)
      if (!other) continue
      if (isTerritorialSeaForNation(other, nationId, index, cols, rows)) {
        keepSea.add(cellKey(other))
      }
    }
  }

  for (const c of map.hexGrid!.cells) {
    if (c.nationId !== nationId) continue
    if (c.terrain !== 'ocean') continue
    if (keepSea.has(cellKey(c))) continue
    c.nationId = undefined
  }

  for (const key of keepSea) {
    const c = index.get(key)
    if (c) c.nationId = nationId
  }
}

/** 涂抹结束后对指定国家（或全部）重新识别领土 */
export function applyTerritoryRecognition(
  map: WorldMapDocument,
  nations: WorldNation[],
  nationIds?: string[]
): void {
  const targets = nationIds?.length
    ? nations.filter((n) => nationIds.includes(n.id))
    : nations
  for (const nation of targets) recognizeNationTerritory(map, nation)
}

/** 笔刷是否可涂该格 */
export function canPaintCellForNation(cell: MapHexCell, nation: WorldNation): boolean {
  if (nationAllowsOceanTerritory(nation)) return true
  return cell.terrain !== 'ocean'
}
