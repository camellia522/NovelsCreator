/**
 * 从陆块区域划分国家/领土
 */

import type { MapRegion, WorldNation } from '@/types/project'
import type { WorldScale } from '@/types/world-gen'
import { seededRandom } from '@/utils/world-noise'

function regionCentroid(r: MapRegion): [number, number] {
  let sx = 0
  let sy = 0
  for (const [x, y] of r.polygon) {
    sx += x
    sy += y
  }
  return [sx / r.polygon.length, sy / r.polygon.length]
}

function regionArea(r: MapRegion): number {
  let area = 0
  for (let i = 0; i < r.polygon.length; i++) {
    const [x1, y1] = r.polygon[i]
    const [x2, y2] = r.polygon[(i + 1) % r.polygon.length]
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area) * 0.5
}

const NAME_A = ['青', '玄', '赤', '白', '金', '苍', '曜', '澜', '岳', '衡', '辰', '羲']
const NAME_B = ['王国', '帝国', '联邦', '共和国', '公国', '合众国']
const GOV = ['君主立宪', '中央集权', '城邦联盟', '军事寡头', '议会共和']
const CULTURE = ['尚武', '重商', '农耕', '航海', '学术', '游牧']

export function buildNations(
  regions: MapRegion[],
  scale: WorldScale,
  seed: number
): WorldNation[] {
  if (!regions.length) return []
  const rand = seededRandom(seed + 11000)
  const landRegions = regions.filter((r) => !r.name.startsWith('岛屿') || regionArea(r) > 8)
  const sorted = [...landRegions].sort((a, b) => regionArea(b) - regionArea(a))

  const maxNations =
    scale === 'planet' ? 12 : scale === 'world' ? 8 : scale === 'kingdom' ? 2 : 5
  const nations: WorldNation[] = []
  const assigned = new Set<string>()

  for (const r of sorted) {
    if (nations.length >= maxNations) break
    if (assigned.has(r.id)) continue

    const cluster = [r]
    assigned.add(r.id)
    const [cx, cy] = regionCentroid(r)

    for (const other of sorted) {
      if (assigned.has(other.id) || nations.length >= maxNations) continue
      if (other.name.startsWith('主大陆') && r.id !== other.id) continue
      const [ox, oy] = regionCentroid(other)
      const d = Math.hypot(cx - ox, cy - oy)
      const mergeDist = scale === 'archipelago' ? 22 : 28
      if (d < mergeDist && cluster.length < 4) {
        cluster.push(other)
        assigned.add(other.id)
      }
    }

    const a = NAME_A[Math.floor(rand() * NAME_A.length)]
    const b = NAME_B[Math.floor(rand() * NAME_B.length)]
    const gov = GOV[Math.floor(rand() * GOV.length)]
    const cult = CULTURE[Math.floor(rand() * CULTURE.length)]
    const id = `nation-${String(nations.length + 1).padStart(3, '0')}`

    nations.push({
      id,
      name: `${a}${b}`,
      regionIds: cluster.map((c) => c.id),
      government: gov,
      culture: cult,
      description: `${a}${b}由${cluster.length}处陆块组成，${gov}政体，${cult}文化传统。`
    })
  }

  for (const r of regions) {
    if (assigned.has(r.id)) continue
    if (!nations.length) break
    let best = nations[0]
    let bestD = Infinity
    const [rx, ry] = regionCentroid(r)
    for (const n of nations) {
      const nr = regions.find((x) => x.id === n.regionIds[0])
      if (!nr) continue
      const [nx, ny] = regionCentroid(nr)
      const d = Math.hypot(rx - nx, ry - ny)
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    best.regionIds.push(r.id)
    assigned.add(r.id)
  }

  return nations
}
