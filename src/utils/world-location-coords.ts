import type { WorldLocation, WorldMapDocument } from '@/types/project'
import {
  countHexCenterDrift,
  hexCellAtPercent,
  refreshHexTerrainFromCells,
  resyncHexCellCenters
} from '@/utils/world-hex-grid'
import { snapLocationToLand } from '@/utils/world-territory-society'

export interface LocationCoordAudit {
  total: number
  onOceanCount: number
  onOceanRatio: number
  looksLikeUnitScale: boolean
  looksLikePixelScale: boolean
}

export interface MapLayerReconcileResult {
  locations: WorldLocation[]
  hexCentersFixed: number
  hexTerrainFixed: number
  locationsFixed: number
  hexCenterDriftBefore: number
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n))
}

export function isLocationOnOceanHex(map: WorldMapDocument, loc: WorldLocation): boolean {
  const cell = hexCellAtPercent(map, loc.x, loc.y)
  return !cell || cell.terrain === 'ocean'
}

export function auditLocationCoords(
  map: WorldMapDocument,
  locations: WorldLocation[]
): LocationCoordAudit {
  const total = locations.length
  if (!total) {
    return {
      total: 0,
      onOceanCount: 0,
      onOceanRatio: 0,
      looksLikeUnitScale: false,
      looksLikePixelScale: false
    }
  }
  const onOceanCount = locations.filter((l) => isLocationOnOceanHex(map, l)).length
  const maxCoord = Math.max(...locations.flatMap((l) => [Math.abs(l.x), Math.abs(l.y)]))
  const overPct = locations.filter((l) => l.x > 100.5 || l.y > 100.5).length
  return {
    total,
    onOceanCount,
    onOceanRatio: onOceanCount / total,
    looksLikeUnitScale: maxCoord <= 1.05,
    looksLikePixelScale: overPct > total * 0.5
  }
}

export function normalizeLocationCoordScale(
  loc: WorldLocation,
  map: WorldMapDocument,
  mode: 'unit' | 'pixel'
): WorldLocation {
  if (mode === 'unit') {
    return {
      ...loc,
      x: clampPct(loc.x * 100),
      y: clampPct(loc.y * 100)
    }
  }
  const rw = Math.max(1, map.renderWidth ?? 2048)
  const rh = Math.max(1, map.renderHeight ?? 1024)
  return {
    ...loc,
    x: clampPct((loc.x / rw) * 100),
    y: clampPct((loc.y / rh) * 100)
  }
}

function locationCoordsEqual(a: WorldLocation, b: WorldLocation): boolean {
  return (
    Math.abs(a.x - b.x) < 0.01 &&
    Math.abs(a.y - b.y) < 0.01 &&
    a.terrain === b.terrain &&
    a.regionId === b.regionId
  )
}

/** 规范化坐标尺度并吸附到最近陆格 */
export function reconcileLocationToGrid(
  loc: WorldLocation,
  map: WorldMapDocument,
  scaleMode: 'none' | 'unit' | 'pixel' = 'none'
): WorldLocation {
  let next = scaleMode === 'none' ? loc : normalizeLocationCoordScale(loc, map, scaleMode)
  next = snapLocationToLand(next, map)
  if (isLocationOnOceanHex(map, next)) {
    next = snapLocationToLand({ ...next, terrain: 'ocean' }, map)
  }
  return next
}

export function reconcileAllLocations(
  map: WorldMapDocument,
  locations: WorldLocation[]
): { locations: WorldLocation[]; changed: number; audit: LocationCoordAudit } {
  const audit = auditLocationCoords(map, locations)
  let scaleMode: 'none' | 'unit' | 'pixel' = 'none'
  if (audit.looksLikeUnitScale) scaleMode = 'unit'
  else if (audit.looksLikePixelScale) scaleMode = 'pixel'

  let changed = 0
  const out = locations.map((loc) => {
    const next = reconcileLocationToGrid(loc, map, scaleMode)
    if (!locationCoordsEqual(loc, next)) changed++
    return next
  })
  return { locations: out, changed, audit }
}

/** 校准 hex 网格 + 聚落坐标（领土/城市图层与底图错位时使用） */
export function reconcileMapLayers(
  map: WorldMapDocument,
  locations: WorldLocation[]
): MapLayerReconcileResult {
  const hexCenterDriftBefore = countHexCenterDrift(map)
  const hexCentersFixed = resyncHexCellCenters(map)
  const hexTerrainFixed = refreshHexTerrainFromCells(map)
  const { locations: nextLocations, changed: locationsFixed } = reconcileAllLocations(map, locations)
  return {
    locations: nextLocations,
    hexCentersFixed,
    hexTerrainFixed,
    locationsFixed,
    hexCenterDriftBefore
  }
}
