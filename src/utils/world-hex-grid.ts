/**
 * 平面地图六边形网格（作者选区基本单元）
 * 固定较小的六边形半径，按列/行数铺满 0–100% 全图（含南北极区域）。
 */

import type { MapHexCell, MapHexGrid, MapTerrainCell, TerrainType, WorldMapDocument } from '@/types/project'
import { buildTerrainIndex, sampleTerrainAt } from '@/utils/world-terrain-index'

/** 六边形外接圆半径（地图百分比坐标）；越小格子越密 */
export const HEX_CELL_RADIUS = 0.72

const MAP_MARGIN = 0.22
const SQRT3 = Math.sqrt(3)

/** 布局版本：变更算法时递增，触发旧地图重建网格 */
export const HEX_GRID_LAYOUT_VERSION = 3

export interface HexLayout {
  cols: number
  rows: number
  size: number
  originX: number
  originY: number
}

function layoutBounds(layout: HexLayout): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const { x, y } = hexCenter(layout, col, row)
      for (const [cx, cy] of hexCorners(x, y, layout.size)) {
        minX = Math.min(minX, cx)
        minY = Math.min(minY, cy)
        maxX = Math.max(maxX, cx)
        maxY = Math.max(maxY, cy)
      }
    }
  }
  return { minX, minY, maxX, maxY }
}

/** 按固定半径推算铺满全图所需的列/行数 */
export function computeFullCoverDimensions(size = HEX_CELL_RADIUS): { cols: number; rows: number } {
  const inner = 100 - 2 * MAP_MARGIN
  let cols = Math.max(6, Math.ceil(inner / (SQRT3 * size) + 0.5))
  let rows = Math.max(6, Math.ceil(inner / (1.5 * size) + 1))

  const maxCols = 160
  const maxRows = 160
  for (let guard = 0; guard < 80; guard++) {
    const layout = createHexLayout(cols, rows, size)
    const b = layoutBounds(layout)
    const needX = b.maxX < 100 - MAP_MARGIN
    const needY = b.maxY < 100 - MAP_MARGIN
    if (!needX && !needY) break
    if (needY && rows < maxRows) rows++
    else if (needX && cols < maxCols) cols++
    else break
  }
  return { cols, rows }
}

export function createHexLayout(
  cols: number,
  rows: number,
  size = HEX_CELL_RADIUS
): HexLayout {
  const usedW = SQRT3 * size * (cols - 0.5)
  const usedH = 1.5 * size * Math.max(0, rows - 1)
  const innerW = 100 - 2 * MAP_MARGIN
  const innerH = 100 - 2 * MAP_MARGIN
  const originX = MAP_MARGIN + Math.max(0, (innerW - usedW) / 2)
  const originY = MAP_MARGIN + Math.max(0, (innerH - usedH) / 2)
  return { cols, rows, size, originX, originY }
}

/** col = q, row = r（与 MapHexCell 字段一致） */
export function hexCenter(layout: HexLayout, col: number, row: number): { x: number; y: number } {
  const x = layout.originX + layout.size * SQRT3 * (col + (row % 2) * 0.5)
  const y = layout.originY + layout.size * 1.5 * row
  return { x, y }
}

export function hexCorners(cx: number, cy: number, size: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i - 30)
    out.push([cx + size * Math.cos(ang), cy + size * Math.sin(ang)])
  }
  return out
}

export function hexPolygonPoints(cell: MapHexCell, layout: HexLayout): string {
  const { x, y } = hexCenter(layout, cell.q, cell.r)
  return hexCorners(x, y, layout.size)
    .map(([x, y]) => `${x},${y}`)
    .join(' ')
}

/** 格心坐标（始终以 q,r + 布局为准，避免旧存档 x,y 漂移导致图层偏移） */
export function hexCellCenter(cell: MapHexCell, layout: HexLayout): { x: number; y: number } {
  return hexCenter(layout, cell.q, cell.r)
}

export function percentToHex(
  xPct: number,
  yPct: number,
  layout: HexLayout
): { q: number; r: number } | null {
  const px = xPct - layout.originX
  const py = yPct - layout.originY
  const rowF = py / (layout.size * 1.5)
  const row = Math.round(rowF)
  if (row < 0 || row >= layout.rows) return null
  const colF = px / (layout.size * SQRT3) - (row % 2) * 0.5
  const col = Math.round(colF)
  if (col < 0 || col >= layout.cols) return null
  const center = hexCenter(layout, col, row)
  const dist = (center.x - xPct) ** 2 + (center.y - yPct) ** 2
  const neighbors: [number, number][] = [
    [col, row],
    [col + 1, row],
    [col - 1, row],
    [col, row + 1],
    [col, row - 1],
    [col + (row % 2 ? 1 : -1), row + 1],
    [col + (row % 2 ? 1 : -1), row - 1]
  ]
  let bestCol = col
  let bestRow = row
  let bestD = dist
  for (const [c, r] of neighbors) {
    if (c < 0 || c >= layout.cols || r < 0 || r >= layout.rows) continue
    const h = hexCenter(layout, c, r)
    const d = (h.x - xPct) ** 2 + (h.y - yPct) ** 2
    if (d < bestD) {
      bestD = d
      bestCol = c
      bestRow = r
    }
  }
  return { q: bestCol, r: bestRow }
}

/** 百分坐标对应的六边形格（无匹配时 null） */
export function hexCellAtPercent(
  map: Pick<WorldMapDocument, 'hexGrid'>,
  xPct: number,
  yPct: number
): MapHexCell | null {
  ensureMapHexGrid(map as WorldMapDocument)
  const g = map.hexGrid!
  const layout = createHexLayout(g.cols, g.rows)
  const axial = percentToHex(xPct, yPct, layout)
  if (!axial) return null
  return g.cells.find((c) => c.q === axial.q && c.r === axial.r) ?? null
}

export function hexId(q: number, r: number): string {
  return `hex-${q}-${r}`
}

export function nearestTerrainCell(
  x: number,
  y: number,
  cells: MapTerrainCell[] | undefined,
  gridSize = 64
): MapTerrainCell | undefined {
  if (!cells?.length) return undefined
  const index = buildTerrainIndex(cells, gridSize)
  return sampleTerrainAt(x, y, index, gridSize)
}

export function buildHexGridFromMap(
  map: Pick<WorldMapDocument, 'terrainCells' | 'hexGrid' | 'gridSize'>,
  cols?: number,
  rows?: number
): MapHexCell[] {
  const dim =
    cols != null && rows != null
      ? { cols, rows }
      : computeFullCoverDimensions(HEX_CELL_RADIUS)
  const layout = createHexLayout(dim.cols, dim.rows)
  const gridSize = map.gridSize ?? 64
  const terrainIndex = buildTerrainIndex(map.terrainCells, gridSize)
  const oldCells = map.hexGrid?.cells ?? []
  const oldById = new Map(oldCells.map((c) => [c.id, c]))
  const out: MapHexCell[] = []

  function legacyCellFor(x: number, y: number, id: string): MapHexCell | undefined {
    const byId = oldById.get(id)
    if (byId && Math.hypot(byId.x - x, byId.y - y) < 1.5) return byId
    let best: MapHexCell | undefined
    let bestD = 2.25
    for (const c of oldCells) {
      const d = (c.x - x) ** 2 + (c.y - y) ** 2
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    return best ?? byId
  }

  for (let row = 0; row < dim.rows; row++) {
    for (let col = 0; col < dim.cols; col++) {
      const { x, y } = hexCenter(layout, col, row)
      const sample = sampleTerrainAt(x, y, terrainIndex, gridSize)
      const terrain: TerrainType = sample?.terrain ?? 'ocean'
      const id = hexId(col, row)
      const old = legacyCellFor(x, y, id)
      out.push({
        id,
        q: col,
        r: row,
        x,
        y,
        terrain,
        heat: old?.heat ?? 0.5,
        wet: old?.wet ?? 0.5,
        monsoon: old?.monsoon ?? false,
        development: old?.development ?? (terrain === 'ocean' ? 0 : 20),
        nationId: old?.nationId,
        regionId: old?.regionId,
        authorNotes: old?.authorNotes ?? ''
      })
    }
  }
  return out
}

function expectedFullCoverGrid(): { cols: number; rows: number } {
  return computeFullCoverDimensions(HEX_CELL_RADIUS)
}

function isHexGridStale(map: WorldMapDocument): boolean {
  const cells = map.hexGrid?.cells
  const expected = expectedFullCoverGrid()
  const version = map.hexGrid?.layoutVersion
  if (version !== HEX_GRID_LAYOUT_VERSION) return true
  if (!cells?.length) return true
  if (map.hexGrid!.cols !== expected.cols || map.hexGrid!.rows !== expected.rows) return true
  return cells.length !== expected.cols * expected.rows
}

export function ensureMapHexGrid(map: WorldMapDocument): void {
  if (!isHexGridStale(map)) return
  const { cols, rows } = expectedFullCoverGrid()
  map.hexGrid = {
    cols,
    rows,
    cells: buildHexGridFromMap(map, cols, rows),
    layoutVersion: HEX_GRID_LAYOUT_VERSION
  }
}

/** 检测格心 x,y 是否与当前布局算法一致 */
export function countHexCenterDrift(map: WorldMapDocument): number {
  if (!map.hexGrid?.cells?.length) return 0
  const layout = createHexLayout(map.hexGrid.cols, map.hexGrid.rows)
  let drift = 0
  for (const c of map.hexGrid.cells) {
    const center = hexCenter(layout, c.q, c.r)
    if (Math.hypot(c.x - center.x, c.y - center.y) > 0.05) drift++
  }
  return drift
}

/** 将 hexGrid 中所有格的 x,y 同步为布局格心（保留 nationId / regionId 等） */
export function resyncHexCellCenters(map: WorldMapDocument): number {
  if (!map.hexGrid?.cells?.length) return 0
  const layout = createHexLayout(map.hexGrid.cols, map.hexGrid.rows)
  let changed = 0
  for (const c of map.hexGrid.cells) {
    const center = hexCenter(layout, c.q, c.r)
    if (Math.abs(c.x - center.x) > 0.001 || Math.abs(c.y - center.y) > 0.001) {
      c.x = center.x
      c.y = center.y
      changed++
    }
  }
  return changed
}

/** 按 terrainCells 重采样各 hex 的地势（底图与网格不一致时修复陆海判定） */
export function refreshHexTerrainFromCells(map: WorldMapDocument): number {
  if (!map.hexGrid?.cells?.length || !map.terrainCells?.length) return 0
  const layout = createHexLayout(map.hexGrid.cols, map.hexGrid.rows)
  const gridSize = map.gridSize ?? 64
  const terrainIndex = buildTerrainIndex(map.terrainCells, gridSize)
  let changed = 0
  for (const c of map.hexGrid.cells) {
    const { x, y } = hexCenter(layout, c.q, c.r)
    const sample = sampleTerrainAt(x, y, terrainIndex, gridSize)
    const terrain: TerrainType = sample?.terrain ?? 'ocean'
    if (c.terrain !== terrain) {
      c.terrain = terrain
      changed++
    }
    if (c.x !== x || c.y !== y) {
      c.x = x
      c.y = y
      changed++
    }
  }
  return changed
}

export function getHexCell(map: WorldMapDocument, q: number, r: number): MapHexCell | undefined {
  ensureMapHexGrid(map)
  return map.hexGrid!.cells.find((c) => c.q === q && c.r === r)
}

export function hexesInRect(
  map: WorldMapDocument,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): MapHexCell[] {
  ensureMapHexGrid(map)
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  const pad = HEX_CELL_RADIUS * 0.85
  return map.hexGrid!.cells.filter(
    (c) =>
      c.x >= minX - pad &&
      c.x <= maxX + pad &&
      c.y >= minY - pad &&
      c.y <= maxY + pad
  )
}

/** odd-r 交错网格的 6 邻格 */
export function hexNeighborCoords(
  col: number,
  row: number,
  cols: number,
  rows: number
): { q: number; r: number }[] {
  const even = row % 2 === 0
  const deltas = even
    ? [
        [1, 0],
        [-1, 0],
        [0, -1],
        [-1, -1],
        [0, 1],
        [-1, 1]
      ]
    : [
        [1, 0],
        [-1, 0],
        [1, -1],
        [0, -1],
        [1, 1],
        [0, 1]
      ]
  const out: { q: number; r: number }[] = []
  for (const [dq, dr] of deltas) {
    const q = col + dq
    const r = row + dr
    if (q >= 0 && q < cols && r >= 0 && r < rows) out.push({ q, r })
  }
  return out
}

/** 从起点泛洪填充满足条件的连通六边形 */
export function floodFillHexCells(
  map: WorldMapDocument,
  start: MapHexCell,
  predicate: (cell: MapHexCell) => boolean
): MapHexCell[] {
  ensureMapHexGrid(map)
  const { cols, rows } = map.hexGrid!
  const index = new Map<string, MapHexCell>(
    map.hexGrid!.cells.map((c) => [`${c.q},${c.r}`, c])
  )
  const filled: MapHexCell[] = []
  const seen = new Set<string>()
  const queue: MapHexCell[] = [start]
  seen.add(`${start.q},${start.r}`)

  while (queue.length) {
    const cur = queue.shift()!
    if (!predicate(cur)) continue
    filled.push(cur)
    for (const { q, r } of hexNeighborCoords(cur.q, cur.r, cols, rows)) {
      const key = `${q},${r}`
      if (seen.has(key)) continue
      seen.add(key)
      const next = index.get(key)
      if (next) queue.push(next)
    }
  }
  return filled
}

/** odd-r 网格上两格之间的步数距离 */
export function hexGridDistance(
  a: { q: number; r: number },
  b: { q: number; r: number },
  cols: number,
  rows: number
): number {
  const start = `${a.q},${a.r}`
  const goal = `${b.q},${b.r}`
  if (start === goal) return 0
  const visited = new Set<string>([start])
  const queue: { q: number; r: number; d: number }[] = [{ q: a.q, r: a.r, d: 0 }]
  while (queue.length) {
    const cur = queue.shift()!
    for (const n of hexNeighborCoords(cur.q, cur.r, cols, rows)) {
      const key = `${n.q},${n.r}`
      if (visited.has(key)) continue
      if (key === goal) return cur.d + 1
      visited.add(key)
      queue.push({ q: n.q, r: n.r, d: cur.d + 1 })
    }
  }
  return 999
}

/** 以 center 为圆心、hex 步长 radius 内的所有格（radius=0 仅中心格） */
export function hexesInBrush(
  map: WorldMapDocument,
  center: { q: number; r: number },
  radius: number
): MapHexCell[] {
  ensureMapHexGrid(map)
  const { cols, rows } = map.hexGrid!
  const r = Math.max(0, Math.round(radius))
  const index = new Map(map.hexGrid!.cells.map((c) => [`${c.q},${c.r}`, c]))
  const start = index.get(`${center.q},${center.r}`)
  if (!start) return []
  if (r === 0) return [start]

  const out: MapHexCell[] = []
  const visited = new Set<string>([`${center.q},${center.r}`])
  const queue: { q: number; r: number; d: number }[] = [{ q: center.q, r: center.r, d: 0 }]

  while (queue.length) {
    const cur = queue.shift()!
    const cell = index.get(`${cur.q},${cur.r}`)
    if (cell) out.push(cell)
    if (cur.d >= r) continue
    for (const n of hexNeighborCoords(cur.q, cur.r, cols, rows)) {
      const key = `${n.q},${n.r}`
      if (visited.has(key)) continue
      visited.add(key)
      queue.push({ q: n.q, r: n.r, d: cur.d + 1 })
    }
  }
  return out
}
