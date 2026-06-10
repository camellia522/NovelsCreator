/**
 * 地质演化：球面板块运动 + 季节降水驱动的水文（河流/湖泊）
 */

import type { MapLake, MapRiver } from '@/types/project'
import type { WorldScale } from '@/types/world-gen'
import { equatorDistance } from '@/utils/world-climate'
import { pixelToPercent, smoothPolyline } from '@/utils/world-map-coords'
import { touchesOceanCell } from '@/utils/world-terrain-refine'
import { polarLongitudeNoise } from '@/utils/world-polar'
import { equirectToSphere, fbm3, hash2D, seededRandom } from '@/utils/world-noise'

export interface GeoEvolutionContext {
  width: number
  height: number
  scale: WorldScale
  seaLevel: number
  elevation: Float32Array
  moisture: Float32Array
  oceanDist: Float32Array
  eastCoast: Uint8Array
  monsoon: Uint8Array
  rainShadow: Uint8Array
}

interface SpherePlate {
  id: number
  nx: number
  ny: number
  nz: number
  vx: number
  vy: number
  vz: number
  isContinental: boolean
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

function tangentMove(
  nx: number,
  ny: number,
  nz: number,
  vx: number,
  vy: number,
  vz: number,
  dt: number
): [number, number, number] {
  const dot = nx * vx + ny * vy + nz * vz
  let tx = vx - nx * dot
  let ty = vy - ny * dot
  let tz = vz - nz * dot
  const tl = Math.hypot(tx, ty, tz) || 1
  tx = (tx / tl) * dt
  ty = (ty / tl) * dt
  tz = (tz / tl) * dt
  return normalize3(nx + tx, ny + ty, nz + tz)
}

function createSpherePlates(scale: WorldScale, seed: number): SpherePlate[] {
  const rand = seededRandom(seed + 7000)
  const counts: Record<WorldScale, { n: number; cont: number }> = {
    kingdom: { n: 5, cont: 2 },
    archipelago: { n: 8, cont: 4 },
    continent: { n: 9, cont: 4 },
    world: { n: 12, cont: 6 },
    planet: { n: 14, cont: 7 }
  }
  const { n, cont } = counts[scale] ?? counts.continent
  const plates: SpherePlate[] = []

  for (let i = 0; i < n; i++) {
    const u = rand()
    const v = rand()
    const lat = Math.asin(2 * v - 1)
    const lon = u * Math.PI * 2 - Math.PI
    const cosLat = Math.cos(lat)
    const [nx, ny, nz] = normalize3(cosLat * Math.cos(lon), Math.sin(lat), cosLat * Math.sin(lon))
    const speed = 0.15 + rand() * 0.35
    const ang = rand() * Math.PI * 2
    const [vx, vy, vz] = normalize3(Math.cos(ang), Math.sin(ang) * 0.5, Math.sin(ang))
    plates.push({
      id: i,
      nx,
      ny,
      nz,
      vx: vx * speed,
      vy: vy * speed,
      vz: vz * speed,
      isContinental: i < cont
    })
  }
  return plates
}

function twoNearestPlates(
  nx: number,
  ny: number,
  nz: number,
  plates: SpherePlate[]
): [SpherePlate, SpherePlate, number] {
  let best = plates[0]
  let second = plates[1]
  let d0 = Infinity
  let d1 = Infinity
  for (const p of plates) {
    const d = 1 - (nx * p.nx + ny * p.ny + nz * p.nz)
    if (d < d0) {
      d1 = d0
      second = best
      d0 = d
      best = p
    } else if (d < d1) {
      d1 = d
      second = p
    }
  }
  const stress = boundaryStress(best, second)
  return [best, second, stress]
}

function boundaryStress(a: SpherePlate, b: SpherePlate): number {
  const nx = b.nx - a.nx
  const ny = b.ny - a.ny
  const nz = b.nz - a.nz
  const len = Math.hypot(nx, ny, nz) || 1
  const vRelX = b.vx - a.vx
  const vRelY = b.vy - a.vy
  const vRelZ = b.vz - a.vz
  return -(vRelX * (nx / len) + vRelY * (ny / len) + vRelZ * (nz / len))
}

/** 板块漂移与边界造山/裂谷 */
export function evolveGeology(ctx: GeoEvolutionContext, yearsMa: number, seed: number): void {
  const plates = createSpherePlates(ctx.scale, seed)
  const steps = Math.min(40, Math.max(6, Math.floor(yearsMa / 3)))
  const { width: size, elevation } = ctx

  for (let s = 0; s < steps; s++) {
    const dt = yearsMa / steps / 100
    for (const p of plates) {
      ;[p.nx, p.ny, p.nz] = tangentMove(p.nx, p.ny, p.nz, p.vx, p.vy, p.vz, dt)
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x
        const { nx, ny, nz } = equirectToSphere(x + 0.5, y + 0.5, size, size)
        const [, , stress] = twoNearestPlates(nx, ny, nz, plates)
        if (stress > 0.08) {
          elevation[idx] += stress * 0.012 * (ctx.elevation[idx] > ctx.seaLevel ? 1.2 : 0.4)
        } else if (stress < -0.06) {
          elevation[idx] -= 0.004
        }
        const detail = fbm3(nx * 4.2, ny * 4.2, nz * 4.2, seed + s * 17, 3)
        let bump = (detail - 0.5) * 0.008
        if (Math.abs(ny) > 0.75) {
          const lonN = polarLongitudeNoise(x, y, size, size, seed + s)
          bump += (lonN - 0.5) * 0.012 + (hash2D(x, y, seed + s * 31) - 0.5) * 0.006
        }
        elevation[idx] += bump
      }
    }
  }

  const erode = Math.floor(size * 0.24)
  const rand = seededRandom(seed + 8000)
  for (let i = 0; i < erode; i++) {
    let x = Math.floor(rand() * size)
    let y = 1 + Math.floor(rand() * (size - 2))
    let idx = y * size + x
    for (let k = 0; k < 10; k++) {
      let best = elevation[idx]
      let bestIdx = idx
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const nx = (x + dx + size) % size
        const ny = y + dy
        if (ny < 0 || ny >= size) continue
        const ni = ny * size + nx
        if (elevation[ni] < best) {
          best = elevation[ni]
          bestIdx = ni
        }
      }
      if (bestIdx === idx) break
      elevation[idx] -= 0.0012
      idx = bestIdx
      x = idx % size
      y = Math.floor(idx / size)
    }
  }
}

function seasonalPrecipitation(ctx: GeoEvolutionContext, idx: number, yNorm: number): number {
  const eq = equatorDistance(yNorm)
  const seasonAmp = Math.exp(-eq * eq * 6) * 0.45 + 0.12
  const monsoonBoost = ctx.monsoon[idx] ? 0.28 : 0
  const rainShadowCut = ctx.rainShadow[idx] ? -0.18 : 0
  const coastal = (1 - ctx.oceanDist[idx]) * 0.15
  return Math.max(
    0.05,
    Math.min(1, ctx.moisture[idx] * 0.65 + seasonAmp + monsoonBoost + rainShadowCut + coastal)
  )
}

export interface HydrologyResult {
  rivers: MapRiver[]
  lakes: MapLake[]
  lakeMask: Uint8Array
  flowAccumulation: Float32Array
}

function traceLakeOutline(cells: number[], size: number): [number, number][] {
  const set = new Set(cells)
  const edge: [number, number][] = []
  for (const idx of cells) {
    const x = idx % size
    const y = Math.floor(idx / size)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = (x + dx + size) % size
      const ny = y + dy
      if (ny < 0 || ny >= size) {
        edge.push(pixelToPercent(x, y, size, size))
        break
      }
      const ni = ny * size + nx
      if (!set.has(ni)) {
        edge.push(pixelToPercent(x, y, size, size))
        break
      }
    }
  }
  if (edge.length < 4) return edge
  let sx = 0
  let sy = 0
  for (const idx of cells) {
    sx += idx % size
    sy += Math.floor(idx / size)
  }
  const cxPct = ((sx / cells.length + 0.5) / size) * 100
  const cyPct = ((sy / cells.length + 0.5) / size) * 100
  edge.sort(
    (a, b) => Math.atan2(a[1] - cyPct, a[0] - cxPct) - Math.atan2(b[1] - cyPct, b[0] - cxPct)
  )
  return edge
}

/** Strahler 河序：汇流处同级+1，异级取较大 */
function computeStrahlerOrder(
  flowTo: Int32Array,
  flow: Float32Array,
  size: number,
  seaLevel: number,
  elevation: Float32Array,
  riverThreshold: number
): Uint8Array {
  const n = size * size
  const isRiver = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (elevation[i] > seaLevel && flow[i] >= riverThreshold) isRiver[i] = 1
  }

  const upstream: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    const down = flowTo[i]
    if (down >= 0 && down !== i && isRiver[i]) upstream[down].push(i)
  }

  const order = new Uint8Array(n)
  const orderByElev: number[] = []
  for (let i = 0; i < n; i++) {
    if (isRiver[i]) orderByElev.push(i)
  }
  orderByElev.sort((a, b) => elevation[b] - elevation[a])

  for (const idx of orderByElev) {
    const ups = upstream[idx].filter((u) => isRiver[u])
    if (ups.length === 0) {
      order[idx] = 1
      continue
    }
    const upsOrders = ups.map((u) => order[u] || 1)
    const maxOrd = Math.max(...upsOrders)
    const sameCount = upsOrders.filter((o) => o === maxOrd).length
    order[idx] = sameCount >= 2 ? maxOrd + 1 : maxOrd
  }
  return order
}

/** 季节降水 → 汇流 → Strahler 河流分级与自然弯曲湖泊 */
export function buildHydrology(ctx: GeoEvolutionContext, seed: number): HydrologyResult {
  const { width, height, elevation, seaLevel } = ctx
  const size = width
  const n = size * size
  const precip = new Float32Array(n)
  const flow = new Float32Array(n)
  const flowTo = new Int32Array(n).fill(-1)
  const lakeMask = new Uint8Array(n)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x
      precip[idx] = seasonalPrecipitation(ctx, idx, y / size)
      flow[idx] = precip[idx]
    }
  }

  const order: number[] = []
  for (let i = 0; i < n; i++) order.push(i)
  order.sort((a, b) => elevation[b] - elevation[a])

  for (const idx of order) {
    if (elevation[idx] <= seaLevel) continue
    const x = idx % size
    const y = Math.floor(idx / size)
    let lowest = idx
    let lowElev = elevation[idx]
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1]
    ]) {
      const nx = (x + dx + size) % size
      const ny = y + dy
      if (ny < 0 || ny >= size) continue
      const ni = ny * size + nx
      const e = elevation[ni] + Math.hypot(dx, dy) * 0.0008
      if (e < lowElev) {
        lowElev = e
        lowest = ni
      }
    }
    if (lowest !== idx) {
      flow[lowest] += flow[idx]
      flowTo[idx] = lowest
    }
  }

  const rivers: MapRiver[] = []
  const maxRivers = ctx.scale === 'planet' ? 12 : ctx.scale === 'world' ? 10 : 7
  const riverThreshold = 0.42
  const strahler = computeStrahlerOrder(flowTo, flow, size, seaLevel, elevation, riverThreshold)

  const upstream: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    const down = flowTo[i]
    if (down >= 0 && down !== i && elevation[i] > seaLevel) {
      upstream[down].push(i)
    }
  }

  const mouths: { idx: number; flow: number; order: number }[] = []
  for (let i = 0; i < n; i++) {
    if (elevation[i] <= seaLevel + 0.01) continue
    const down = flowTo[i]
    const isMouth =
      down < 0 ||
      down === i ||
      elevation[down] <= seaLevel + 0.01 ||
      touchesOceanCell(i % size, Math.floor(i / size), elevation, seaLevel, size)
    if (!isMouth || flow[i] < riverThreshold * 0.85) continue
    mouths.push({ idx: i, flow: flow[i], order: strahler[i] })
  }
  mouths.sort((a, b) => b.flow - a.flow)

  const usedMouths = new Set<number>()

  for (const mouth of mouths) {
    if (rivers.length >= maxRivers) break
    if (usedMouths.has(mouth.idx)) continue

    const chain: number[] = []
    let cur = mouth.idx
    const seen = new Set<number>()
    for (let step = 0; step < 180; step++) {
      if (seen.has(cur)) break
      seen.add(cur)
      chain.push(cur)
      const ups = upstream[cur].filter((u) => elevation[u] > seaLevel + 0.02 && !seen.has(u))
      if (!ups.length) break
      ups.sort((a, b) => flow[b] - flow[a])
      cur = ups[0]
    }
    chain.reverse()

    if (chain.length < 6) continue

    const step = Math.max(1, Math.floor(chain.length / 48))
    const raw: [number, number][] = []
    for (let i = 0; i < chain.length; i += step) {
      const idx = chain[i]
      const x = idx % size
      const y = Math.floor(idx / size)
      if (ctx.oceanDist[idx] < 0.05) continue
      raw.push(pixelToPercent(x, y, size, size))
    }
    const last = chain[chain.length - 1]
    raw.push(pixelToPercent(last % size, Math.floor(last / size), size, size))

    if (raw.length < 5) continue

    let maxOrder = 1
    let peakFlow = 0
    for (const idx of chain) {
      maxOrder = Math.max(maxOrder, strahler[idx])
      peakFlow = Math.max(peakFlow, flow[idx])
    }
    if (maxOrder < 2 && peakFlow < 0.9) continue

    const points = smoothPolyline(raw, 2)
    const ord = Math.max(2, maxOrder)
    rivers.push({
      id: `river-${String(rivers.length + 1).padStart(2, '0')}`,
      name: ord >= 4 ? `主干河-${rivers.length + 1}` : ord >= 3 ? `大河-${rivers.length + 1}` : `第${rivers.length + 1}河`,
      points,
      order: ord,
      discharge: Math.min(1, peakFlow / 2.5)
    })
    usedMouths.add(mouth.idx)
    for (const idx of chain) usedMouths.add(idx)
  }

  const lakes: MapLake[] = []
  const visited = new Uint8Array(n)

  for (let y = 2; y < size - 2; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x
      if (elevation[idx] <= seaLevel || visited[idx]) continue

      let isPit = true
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const nx = (x + dx + size) % size
        const ny = y + dy
        const ni = ny * size + nx
        if (elevation[ni] < elevation[idx] - 0.0005) {
          isPit = false
          break
        }
      }
      if (!isPit || precip[idx] < 0.38) continue

      const cells: number[] = []
      const stack = [idx]
      let touchesSea = false
      while (stack.length) {
        const ci = stack.pop()!
        if (visited[ci]) continue
        const cx = ci % size
        const cy = Math.floor(ci / size)
        if (Math.abs(cx - x) > 18 && Math.abs(cy - y) > 18) continue
        if (elevation[ci] > elevation[idx] + 0.028) continue
        if (ctx.oceanDist[ci] < 0.08) {
          touchesSea = true
          break
        }
        visited[ci] = 1
        cells.push(ci)
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ]) {
          const nx = (cx + dx + size) % size
          const ny = cy + dy
          if (ny < 0 || ny >= size) continue
          const ni = ny * size + nx
          if (elevation[ni] <= seaLevel) {
            touchesSea = true
            continue
          }
          if (visited[ni]) continue
          if (elevation[ni] <= elevation[idx] + 0.035) stack.push(ni)
        }
      }

      if (touchesSea || cells.length < 8 || cells.length > 1200) continue
      const avgPrecip = cells.reduce((s, ci) => s + precip[ci], 0) / cells.length
      if (avgPrecip < 0.42) continue

      let sx = 0
      let sy = 0
      for (const ci of cells) {
        lakeMask[ci] = 1
        sx += ci % size
        sy += Math.floor(ci / size)
      }
      const cx = ((sx / cells.length + 0.5) / size) * 100
      const cy = ((sy / cells.length + 0.5) / size) * 100
      const radius = Math.sqrt(cells.length / Math.PI) * (100 / size) * 0.85
      const polygon = smoothPolyline(traceLakeOutline(cells, size), 1)
      const origin: MapLake['origin'] = ctx.monsoon[idx]
        ? 'seasonal'
        : ctx.rainShadow[idx]
          ? 'endorheic'
          : 'tectonic'

      lakes.push({
        id: `lake-${String(lakes.length + 1).padStart(2, '0')}`,
        name: origin === 'seasonal' ? `季雨湖-${lakes.length + 1}` : `内陆湖-${lakes.length + 1}`,
        cx,
        cy,
        radius: Math.max(0.35, radius),
        polygon,
        origin
      })
      if (lakes.length >= (ctx.scale === 'planet' ? 20 : 12)) break
    }
  }

  return { rivers, lakes, lakeMask, flowAccumulation: flow }
}
