/**
 * WorldEngine 模拟链（TypeScript 移植）
 * https://github.com/Mindwerks/worldengine
 */

import { fbm2, seededRandom } from '@/utils/world-noise'

export const WE_OCEAN_LEVEL = 1.0
export const WE_TEMPS = [0.874, 0.765, 0.594, 0.439, 0.366, 0.124]
export const WE_HUMIDS = [0.941, 0.778, 0.507, 0.236, 0.073, 0.014, 0.002]
export const WE_GAMMA = 1.25
export const WE_CURVE_OFFSET = 0.2

export interface WorldEngineState {
  width: number
  height: number
  seed: number
  numPlates: number
  elevation: Float32Array
  plateIds: Uint16Array
  ocean: Uint8Array
  oceanLevel: number
  hillLevel: number
  mountainLevel: number
  temperature: Float32Array
  tempThresholds: number[]
  precipitation: Float32Array
  humidity: Float32Array
  humidityQuantiles: Record<string, number>
  irrigation: Float32Array
  watermap: Float32Array
  watermapThresholds: { creek: number; river: number; 'main river': number }
  biome: string[]
  icecap: Float32Array
  rivermap: Float32Array
  lakemap: Float32Array
}

export function subSeeds(masterSeed: number, n: number): number[] {
  const rand = seededRandom(masterSeed + 7777)
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(Math.floor(rand() * 0x7fffffff))
  return out
}

/** worldengine/simulations/basic.py find_threshold_f */
export function findThresholdF(
  data: Float32Array,
  landPerc: number,
  ocean: Uint8Array,
  max = 1000,
  mindist = 0.005
): number {
  let landCount = 0
  for (let i = 0; i < ocean.length; i++) if (!ocean[i]) landCount++
  const desired = landCount * landPerc

  function count(e: number): number {
    let c = 0
    for (let i = 0; i < data.length; i++) {
      if (ocean[i]) continue
      if (data[i] <= e) c++
    }
    return c
  }

  function search(a: number, b: number): number {
    if (Math.abs(b - a) < mindist) {
      const ca = count(a)
      const cb = count(b)
      return Math.abs(desired - ca) < Math.abs(desired - cb) ? a : b
    }
    const m = (a + b) / 2
    const cm = count(m)
    if (desired < cm) return search(m, b)
    return search(a, m)
  }
  return search(-max, max)
}

function wrappedNoise2(
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  octaves: number,
  freq: number
): number {
  const nScale = 1024 / height
  const xf = (x * nScale) / freq
  const yf = (y * nScale) / freq
  const border = width / 4
  if (x < border) {
    const n1 = fbm2(xf, yf, seed, octaves, 2, 0.5) * 2 - 1
    const n2 = fbm2(xf + (width * nScale) / freq, yf, seed + 1, octaves, 2, 0.5) * 2 - 1
    return n1 * (x / border) + n2 * ((border - x) / border)
  }
  return fbm2(xf, yf, seed, octaves, 2, 0.5) * 2 - 1
}

function gaussian(rand: () => number, scale: number): number {
  const u1 = Math.max(1e-9, rand())
  const u2 = rand()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * scale
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function interp1(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0]
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i])
      return lerp(ys[i], ys[i + 1], t)
    }
  }
  return ys[ys.length - 1]
}

export function initializeOceanAndThresholds(state: WorldEngineState): void {
  const { elevation, width, height } = state
  state.ocean = fillOcean(elevation, width, height, WE_OCEAN_LEVEL)
  harmonizeOcean(elevation, state.ocean, WE_OCEAN_LEVEL)
  state.oceanLevel = WE_OCEAN_LEVEL
  state.hillLevel = findThresholdF(elevation, 0.1, state.ocean)
  state.mountainLevel = findThresholdF(elevation, 0.03, state.ocean)
}

function fillOcean(elevation: Float32Array, width: number, height: number, seaLevel: number): Uint8Array {
  const ocean = new Uint8Array(width * height)
  const q: number[] = []
  const tryPush = (x: number, y: number): void => {
    const idx = y * width + x
    if (ocean[idx] || elevation[idx] > seaLevel) return
    ocean[idx] = 1
    q.push(idx)
  }
  for (let x = 0; x < width; x++) {
    tryPush(x, 0)
    tryPush(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y)
    tryPush(width - 1, y)
  }
  let qi = 0
  while (qi < q.length) {
    const idx = q[qi++]
    const x = idx % width
    const y = Math.floor(idx / width)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      tryPush(nx, ny)
    }
  }
  return ocean
}

function harmonizeOcean(elevation: Float32Array, ocean: Uint8Array, oceanLevel: number): void {
  const shallowSea = oceanLevel * 0.85
  const midpoint = shallowSea * 0.5
  for (let i = 0; i < elevation.length; i++) {
    if (!ocean[i] || elevation[i] >= shallowSea) continue
    const e = elevation[i]
    if (e < midpoint) elevation[i] = midpoint - (midpoint - e) / 5
    else elevation[i] = midpoint + (e - midpoint) / 5
  }
}

export function runTemperatureSimulation(state: WorldEngineState, seed: number): void {
  const { width, height, elevation, ocean, mountainLevel } = state
  const n = width * height
  state.temperature = new Float32Array(n)
  const rand = seededRandom(seed)
  const noiseSeed = Math.floor(rand() * 4096)
  const distanceToSun = Math.max(0.1, 1 + gaussian(rand, 0.12 / 1.177410023)) ** 2
  const axialTilt = Math.max(-0.5, Math.min(0.5, gaussian(rand, 0.07 / 1.177410023)))
  const octaves = 8
  const freq = 16 * octaves

  for (let y = 0; y < height; y++) {
    const yScaled = y / height - 0.5
    const latitudeFactor = interp1(
      yScaled,
      [axialTilt - 0.5, axialTilt, axialTilt + 0.5],
      [0, 1, 0]
    )
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const noise = wrappedNoise2(x, y, width, height, noiseSeed, octaves, freq)
      let t = (latitudeFactor * 12 + noise) / 13 / distanceToSun
      if (elevation[idx] > mountainLevel) {
        const alt =
          elevation[idx] > mountainLevel + 29
            ? 0.033
            : 1 - (elevation[idx] - mountainLevel) / 30
        t *= alt
      }
      state.temperature[idx] = t
    }
  }
  state.tempThresholds = WE_TEMPS.map((p) => findThresholdF(state.temperature, p, ocean))
}

export function runPrecipitationSimulation(state: WorldEngineState, seed: number): void {
  const { width, height, temperature, ocean } = state
  const n = width * height
  const rand = seededRandom(seed)
  const noiseSeed = Math.floor(rand() * 4096)
  const octaves = 6
  const freq = 64 * octaves
  const precip = new Float32Array(n)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      precip[y * width + x] = wrappedNoise2(x, y, width, height, noiseSeed, octaves, freq)
    }
  }

  let minP = Infinity
  let maxP = -Infinity
  let minT = Infinity
  let maxT = -Infinity
  for (let i = 0; i < n; i++) {
    if (precip[i] < minP) minP = precip[i]
    if (precip[i] > maxP) maxP = precip[i]
    if (temperature[i] < minT) minT = temperature[i]
    if (temperature[i] > maxT) maxT = temperature[i]
  }
  const pDelta = maxP - minP || 1
  const tDelta = maxT - minT || 1

  for (let i = 0; i < n; i++) {
    const t = (temperature[i] - minT) / tDelta
    let p = (precip[i] - minP) / pDelta
    const curve = Math.pow(t, WE_GAMMA) * (1 - WE_CURVE_OFFSET) + WE_CURVE_OFFSET
    p *= curve
    precip[i] = p
  }

  minP = Infinity
  maxP = -Infinity
  for (let i = 0; i < n; i++) {
    if (precip[i] < minP) minP = precip[i]
    if (precip[i] > maxP) maxP = precip[i]
  }
  const d2 = maxP - minP || 1
  state.precipitation = new Float32Array(n)
  for (let i = 0; i < n; i++) state.precipitation[i] = ((precip[i] - minP) / d2) * 2 - 1
}

export function runWatermapSimulation(state: WorldEngineState, seed: number): void {
  const { width, height, elevation, precipitation, ocean } = state
  const n = width * height
  state.watermap = new Float32Array(n)
  const rand = seededRandom(seed + 500)
  const drops = Math.min(12000, Math.floor(n * 0.006))

  for (let d = 0; d < drops; d++) {
    const x = Math.floor(rand() * width)
    const y = Math.floor(rand() * height)
    const idx = y * width + x
    if (ocean[idx] || precipitation[idx] <= 0) continue
    droplet(state, x, y, precipitation[idx])
  }

  state.watermapThresholds = {
    creek: findThresholdF(state.watermap, 0.05, ocean),
    river: findThresholdF(state.watermap, 0.02, ocean),
    'main river': findThresholdF(state.watermap, 0.007, ocean)
  }
}

function droplet(state: WorldEngineState, sx: number, sy: number, q: number): void {
  if (q < 0.05) return
  const { width, height, elevation, ocean, watermap } = state
  let x = sx
  let y = sy
  let remaining = q

  for (let step = 0; step < 64; step++) {
    const idx = y * width + x
    const posElev = elevation[idx] + watermap[idx]
    let bestX = x
    let bestY = y
    let best = posElev
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      const nx = (x + dx + width) % width
      const ny = y + dy
      if (ny < 0 || ny >= height) continue
      const ni = ny * width + nx
      const e = elevation[ni] + watermap[ni]
      if (e < best) {
        best = e
        bestX = nx
        bestY = ny
      }
    }
    if (bestX === x && bestY === y) {
      watermap[idx] += remaining
      return
    }
    const ni = bestY * width + bestX
    if (ocean[ni]) {
      watermap[ni] += remaining
      return
    }
    watermap[ni] += remaining * 0.35
    remaining *= 0.65
    x = bestX
    y = bestY
  }
}

export function runIrrigationSimulation(state: WorldEngineState): void {
  const { width, height, watermap, ocean } = state
  const n = width * height
  state.irrigation = new Float32Array(n)
  const radius = 10

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (!ocean[idx]) continue
      const w = watermap[idx]
      if (w <= 0) continue
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const dist = Math.log1p(Math.hypot(dx, dy)) + 1
          state.irrigation[ny * width + nx] += w / dist
        }
      }
    }
  }
}

export function runHumiditySimulation(state: WorldEngineState): void {
  const { width, height, precipitation, irrigation, ocean } = state
  const n = width * height
  state.humidity = new Float32Array(n)
  const pw = 1
  const iw = 3
  for (let i = 0; i < n; i++) {
    state.humidity[i] = (precipitation[i] * pw - irrigation[i] * iw) / (pw + iw)
  }
  state.humidityQuantiles = {
    '12': findThresholdF(state.humidity, WE_HUMIDS[6], ocean),
    '25': findThresholdF(state.humidity, WE_HUMIDS[5], ocean),
    '37': findThresholdF(state.humidity, WE_HUMIDS[4], ocean),
    '50': findThresholdF(state.humidity, WE_HUMIDS[3], ocean),
    '62': findThresholdF(state.humidity, WE_HUMIDS[2], ocean),
    '75': findThresholdF(state.humidity, WE_HUMIDS[1], ocean),
    '87': findThresholdF(state.humidity, WE_HUMIDS[0], ocean)
  }
}

function tempBand(state: WorldEngineState, x: number, y: number): string {
  const t = state.temperature[y * state.width + x]
  const th = state.tempThresholds
  if (t < th[0]) return 'polar'
  if (t < th[1]) return 'alpine'
  if (t < th[2]) return 'boreal'
  if (t < th[3]) return 'cool'
  if (t < th[4]) return 'warm'
  if (t < th[5]) return 'subtropical'
  return 'tropical'
}

function humidBand(state: WorldEngineState, x: number, y: number): string {
  const h = state.humidity[y * state.width + x]
  const q = state.humidityQuantiles
  if (h < q['87']) return 'superarid'
  if (h < q['75']) return 'perarid'
  if (h < q['62']) return 'arid'
  if (h < q['50']) return 'semiarid'
  if (h < q['37']) return 'subhumid'
  if (h < q['25']) return 'humid'
  if (h < q['12']) return 'perhumid'
  return 'superhumid'
}

export function runBiomeSimulation(state: WorldEngineState): void {
  const { width, height, ocean } = state
  state.biome = new Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (ocean[idx]) {
        state.biome[idx] = 'ocean'
        continue
      }
      state.biome[idx] = lookupBiome(tempBand(state, x, y), humidBand(state, x, y))
    }
  }
}

function lookupBiome(temp: string, humid: string): string {
  if (temp === 'polar') return humid === 'superarid' ? 'polar desert' : 'ice'
  if (temp === 'alpine') {
    const m: Record<string, string> = {
      superarid: 'subpolar dry tundra',
      perarid: 'subpolar moist tundra',
      arid: 'subpolar wet tundra',
      semiarid: 'subpolar rain tundra',
      subhumid: 'subpolar rain tundra',
      humid: 'subpolar rain tundra',
      perhumid: 'subpolar rain tundra',
      superhumid: 'subpolar rain tundra'
    }
    return m[humid] ?? 'subpolar rain tundra'
  }
  if (temp === 'boreal') {
    const m: Record<string, string> = {
      superarid: 'boreal desert',
      perarid: 'boreal dry scrub',
      arid: 'boreal moist forest',
      semiarid: 'boreal wet forest',
      subhumid: 'boreal rain forest',
      humid: 'boreal rain forest',
      perhumid: 'boreal rain forest',
      superhumid: 'boreal rain forest'
    }
    return m[humid] ?? 'boreal moist forest'
  }
  if (temp === 'cool') {
    const m: Record<string, string> = {
      superarid: 'cool temperate desert',
      perarid: 'cool temperate desert scrub',
      arid: 'cool temperate steppe',
      semiarid: 'cool temperate moist forest',
      subhumid: 'cool temperate wet forest',
      humid: 'cool temperate rain forest',
      perhumid: 'cool temperate rain forest',
      superhumid: 'cool temperate rain forest'
    }
    return m[humid] ?? 'cool temperate steppe'
  }
  if (temp === 'warm') {
    const m: Record<string, string> = {
      superarid: 'warm temperate desert',
      perarid: 'warm temperate desert scrub',
      arid: 'warm temperate thorn scrub',
      semiarid: 'warm temperate dry forest',
      subhumid: 'warm temperate moist forest',
      humid: 'warm temperate wet forest',
      perhumid: 'warm temperate rain forest',
      superhumid: 'warm temperate rain forest'
    }
    return m[humid] ?? 'warm temperate moist forest'
  }
  if (temp === 'subtropical') {
    const m: Record<string, string> = {
      superarid: 'subtropical desert',
      perarid: 'subtropical desert scrub',
      arid: 'subtropical thorn woodland',
      semiarid: 'subtropical dry forest',
      subhumid: 'subtropical moist forest',
      humid: 'subtropical wet forest',
      perhumid: 'subtropical rain forest',
      superhumid: 'subtropical rain forest'
    }
    return m[humid] ?? 'subtropical moist forest'
  }
  const m: Record<string, string> = {
    superarid: 'tropical desert',
    perarid: 'tropical desert scrub',
    arid: 'tropical thorn woodland',
    semiarid: 'tropical very dry forest',
    subhumid: 'tropical dry forest',
    humid: 'tropical moist forest',
    perhumid: 'tropical wet forest',
    superhumid: 'tropical rain forest'
  }
  return m[humid] ?? 'tropical moist forest'
}

export function runIcecapSimulation(state: WorldEngineState, seed: number): void {
  const { width, height, temperature, ocean } = state
  const n = width * height
  state.icecap = new Float32Array(n)
  const rand = seededRandom(seed)
  let tempMin = Infinity
  for (let i = 0; i < n; i++) if (temperature[i] < tempMin) tempMin = temperature[i]

  const freezeThreshold = (state.tempThresholds[0] - tempMin) * 0.6
  const freezeChanceThreshold = freezeThreshold * 0.8
  const solid = new Uint8Array(n)

  for (let i = 0; i < n; i++) {
    if (!ocean[i] && temperature[i] <= freezeChanceThreshold + tempMin) solid[i] = 1
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      if (!ocean[idx]) continue
      const t = temperature[idx]
      if (t - tempMin >= freezeThreshold) continue
      let chance = interp1(t, [tempMin, freezeChanceThreshold, freezeThreshold], [1, 1, 0])
      let frozenNeighbors = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          if (solid[(y + dy) * width + (x + dx)]) frozenNeighbors++
        }
      }
      chance += interp1(frozenNeighbors, [0, 8], [-1, 1]) * 0.5
      if (rand() <= chance) {
        solid[idx] = 1
        state.icecap[idx] = freezeThreshold - (t - tempMin)
        state.biome[idx] = 'ice'
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (!ocean[i] && (state.biome[i] === 'ice' || state.biome[i] === 'polar desert')) {
      if (temperature[i] < state.tempThresholds[0]) state.biome[i] = 'ice'
    }
  }
}

export function runErosionSimulation(state: WorldEngineState, seed: number): void {
  const { width, height, elevation, precipitation, ocean, mountainLevel } = state
  const n = width * height
  state.rivermap = new Float32Array(n)
  state.lakemap = new Float32Array(n)
  const rand = seededRandom(seed + 9000)
  const sources = Math.floor(n * 0.0008)

  for (let s = 0; s < sources; s++) {
    const x = Math.floor(rand() * width)
    const y = Math.floor(rand() * height)
    const idx = y * width + x
    if (ocean[idx] || elevation[idx] < mountainLevel || precipitation[idx] < 0) continue
    carveRiver(state, x, y)
  }
}

function carveRiver(state: WorldEngineState, sx: number, sy: number): void {
  const { width, height, elevation, ocean, rivermap } = state
  let x = sx
  let y = sy
  for (let step = 0; step < 128; step++) {
    const idx = y * width + x
    rivermap[idx] = Math.max(rivermap[idx], 0.05)
    if (ocean[idx]) return
    let bestX = x
    let bestY = y
    let best = elevation[idx]
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      const nx = (x + dx + width) % width
      const ny = y + dy
      if (ny < 0 || ny >= height) continue
      const e = elevation[ny * width + nx]
      if (e < best) {
        best = e
        bestX = nx
        bestY = ny
      }
    }
    if (bestX === x && bestY === y) return
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const ni = ny * width + nx
        if (ocean[ni] || elevation[ni] <= elevation[idx]) continue
        const dist = Math.hypot(dx, dy)
        if (dist > 2) continue
        const curve = dist <= 1 ? 0.2 : 0.05
        elevation[ni] += (elevation[idx] - elevation[ni]) * curve
      }
    }
    x = bestX
    y = bestY
  }
}

export function runWorldEngineSimulations(state: WorldEngineState, masterSeed: number): void {
  const seeds = subSeeds(masterSeed, 100)
  const n = state.width * state.height
  state.precipitation = new Float32Array(n)
  state.rivermap = new Float32Array(n)
  state.lakemap = new Float32Array(n)
  state.icecap = new Float32Array(n)
  runTemperatureSimulation(state, seeds[4])
  runPrecipitationSimulation(state, seeds[0])
  runErosionSimulation(state, seeds[1])
  runWatermapSimulation(state, seeds[2])
  runIrrigationSimulation(state)
  runHumiditySimulation(state)
  runBiomeSimulation(state)
  runIcecapSimulation(state, seeds[8])
}
