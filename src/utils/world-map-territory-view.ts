/**
 * 只读地图视图：从 hex.nationId 直接合成领土填色（不依赖 layerCache 校验）。
 */

import type { MapHexCell, WorldNation } from '@/types/project'
import { extractProvinceRegionId, provinceFillColorCss } from '@/utils/world-admin-divisions'
import { hexNeighborCoords, hexPolygonPoints, type HexLayout } from '@/utils/world-hex-grid'
import { nationColor } from '@/utils/world-map-territory'
import type { ComposedHexPaint } from '@/utils/world-map-layer-cache'
import { territoryOverlayFillColor } from '@/utils/world-map-layer-cache'

/** 稀疏渲染：仅已归属格子，供主页面/编辑器领土图层 */
export function buildTerritoryViewPaints(
  cells: MapHexCell[],
  layout: HexLayout,
  nations: WorldNation[],
  selectedIds: Set<string> = new Set()
): ComposedHexPaint[] {
  if (!cells.length || !nations.length) return []

  const nationById = new Map(nations.map((n, i) => [n.id, { nation: n, idx: i }]))
  const paints: ComposedHexPaint[] = []
  const painted = new Set<string>()

  for (const c of cells) {
    if (!c.nationId) continue
    const hit = nationById.get(c.nationId)
    const idx = hit?.idx ?? 0
    const raw = hit?.nation.color ?? nationColor(idx)
    const selected = selectedIds.has(c.id)
    paints.push({
      id: c.id,
      points: hexPolygonPoints(c, layout),
      fill: territoryOverlayFillColor(raw, 0.68),
      stroke: selected ? '#e8c547' : 'rgba(255,255,255,0.18)',
      strokeWidth: selected ? 0.1 : 0.06
    })
    painted.add(c.id)
  }

  for (const id of selectedIds) {
    if (painted.has(id)) continue
    const c = cells.find((x) => x.id === id)
    if (!c) continue
    paints.push({
      id: c.id,
      points: hexPolygonPoints(c, layout),
      fill: 'rgba(110, 181, 255, 0.2)',
      stroke: '#e8c547',
      strokeWidth: 0.1
    })
  }

  return paints
}

function nationIdForProvince(provId: string, nations: WorldNation[]): string | undefined {
  for (const n of nations) {
    if (n.regionIds?.includes(provId)) return n.id
  }
  return undefined
}

/** 稀疏渲染：从 hex.regionId 直接合成行省填色（已生成/已落盘数据，不依赖 layerCache） */
export function buildProvinceViewPaints(
  cells: MapHexCell[],
  layout: HexLayout,
  nations: WorldNation[],
  cols: number,
  rows: number,
  selectedIds: Set<string> = new Set()
): ComposedHexPaint[] {
  if (!cells.length || !nations.length) return []

  const nationIndexById = new Map(nations.map((n, i) => [n.id, i]))
  const cellProvId = new Map<string, string>()
  const provColorIndex = new Map<string, number>()
  const nationProvCount = new Map<string, number>()

  for (const c of cells) {
    if (c.terrain === 'ocean' || !c.regionId) continue
    const provId = extractProvinceRegionId(c.regionId)
    if (!provId?.startsWith('prov-')) continue
    cellProvId.set(c.id, provId)
    if (provColorIndex.has(provId)) continue
    const nationId = c.nationId ?? nationIdForProvince(provId, nations)
    const count = nationProvCount.get(nationId ?? '') ?? 0
    provColorIndex.set(provId, count)
    nationProvCount.set(nationId ?? '', count + 1)
  }

  if (!cellProvId.size) return []

  const provCellKeys = new Map<string, Set<string>>()
  for (const c of cells) {
    const provId = cellProvId.get(c.id)
    if (!provId) continue
    const keys = provCellKeys.get(provId) ?? new Set<string>()
    keys.add(`${c.q},${c.r}`)
    provCellKeys.set(provId, keys)
  }

  const borderIds = new Set<string>()
  for (const c of cells) {
    const provId = cellProvId.get(c.id)
    if (!provId) continue
    const keys = provCellKeys.get(provId)!
    for (const nb of hexNeighborCoords(c.q, c.r, cols, rows)) {
      if (!keys.has(`${nb.q},${nb.r}`)) borderIds.add(c.id)
    }
  }

  const paints: ComposedHexPaint[] = []
  const painted = new Set<string>()

  for (const c of cells) {
    const provId = cellProvId.get(c.id)
    if (!provId) continue
    const nationId = c.nationId ?? nationIdForProvince(provId, nations)
    const nationIdx = nationIndexById.get(nationId ?? '') ?? 0
    const colorIndex = provColorIndex.get(provId) ?? 0
    const selected = selectedIds.has(c.id)
    const isBorder = borderIds.has(c.id)
    paints.push({
      id: c.id,
      points: hexPolygonPoints(c, layout),
      fill: provinceFillColorCss(colorIndex, nationIdx),
      stroke: selected ? '#e8c547' : isBorder ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)',
      strokeWidth: selected ? 0.1 : isBorder ? 0.08 : 0.04
    })
    painted.add(c.id)
  }

  for (const id of selectedIds) {
    if (painted.has(id)) continue
    const c = cells.find((x) => x.id === id)
    if (!c) continue
    paints.push({
      id: c.id,
      points: hexPolygonPoints(c, layout),
      fill: 'rgba(110, 181, 255, 0.2)',
      stroke: '#e8c547',
      strokeWidth: 0.1
    })
  }

  return paints
}
