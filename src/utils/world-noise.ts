/** 确定性噪声：经典柏林噪声 + 球面 3D fBm（适合等距圆柱 → 球面贴图） */

export function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

export function hash2D(x: number, y: number, seed: number): number {
  let h = seed + x * 374761393 + y * 668265263
  h = (h ^ (h >>> 13)) >>> 0
  h = (h * 1274126177) >>> 0
  return (h ^ (h >>> 16)) / 0x100000000
}

const GRAD2: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]
]

const GRAD3: [number, number, number][] = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  [1, 1, 0], [-1, 1, 0], [0, -1, 1], [0, -1, -1]
]

const permCache = new Map<number, Uint8Array>()

function getPerm(seed: number): Uint8Array {
  let p = permCache.get(seed)
  if (p) return p
  const rand = seededRandom(seed)
  const arr = new Uint8Array(512)
  const src = new Uint8Array(256)
  for (let i = 0; i < 256; i++) src[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = src[i]
    src[i] = src[j]
    src[j] = t
  }
  for (let i = 0; i < 512; i++) arr[i] = src[i & 255]
  permCache.set(seed, arr)
  return arr
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function dot2(g: [number, number], x: number, y: number): number {
  return g[0] * x + g[1] * y
}

function dot3(g: [number, number, number], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z
}

/** 2D 柏林噪声，输出约 [-1, 1] */
export function perlin2(x: number, y: number, seed: number): number {
  const perm = getPerm(seed)
  const xi = Math.floor(x) & 255
  const yi = Math.floor(y) & 255
  const xf = x - Math.floor(x)
  const yf = y - Math.floor(y)
  const u = fade(xf)
  const v = fade(yf)

  const aa = perm[perm[xi] + yi]
  const ab = perm[perm[xi] + yi + 1]
  const ba = perm[perm[xi + 1] + yi]
  const bb = perm[perm[xi + 1] + yi + 1]

  const x1 = lerp(dot2(GRAD2[aa % 8], xf, yf), dot2(GRAD2[ba % 8], xf - 1, yf), u)
  const x2 = lerp(dot2(GRAD2[ab % 8], xf, yf - 1), dot2(GRAD2[bb % 8], xf - 1, yf - 1), u)
  return lerp(x1, x2, v)
}

/** 2D fBm，输出约 [0, 1] */
export function fbm2(
  x: number,
  y: number,
  seed: number,
  octaves = 6,
  lacunarity = 2.03,
  gain = 0.5
): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += (perlin2(x * freq, y * freq, seed + i * 131) * 0.5 + 0.5) * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

/** 2D 脊状噪声 */
export function ridged2(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = perlin2(x * freq, y * freq, seed + i * 97)
    const r = 1 - Math.abs(n)
    sum += r * r * amp
    norm += amp
    amp *= 0.5
    freq *= 2.2
  }
  return sum / norm
}

/** 3D 柏林噪声，输出约 [-1, 1] */
export function perlin3(x: number, y: number, z: number, seed: number): number {
  const perm = getPerm(seed)
  const xi = Math.floor(x) & 255
  const yi = Math.floor(y) & 255
  const zi = Math.floor(z) & 255
  const xf = x - Math.floor(x)
  const yf = y - Math.floor(y)
  const zf = z - Math.floor(z)
  const u = fade(xf)
  const v = fade(yf)
  const w = fade(zf)

  const aaa = perm[perm[perm[xi] + yi] + zi]
  const aba = perm[perm[perm[xi] + yi + 1] + zi]
  const aab = perm[perm[perm[xi] + yi] + zi + 1]
  const abb = perm[perm[perm[xi] + yi + 1] + zi + 1]
  const baa = perm[perm[perm[xi + 1] + yi] + zi]
  const bba = perm[perm[perm[xi + 1] + yi + 1] + zi]
  const bab = perm[perm[perm[xi + 1] + yi] + zi + 1]
  const bbb = perm[perm[perm[xi + 1] + yi + 1] + zi + 1]

  const x1 = lerp(
    dot3(GRAD3[aaa % 16], xf, yf, zf),
    dot3(GRAD3[baa % 16], xf - 1, yf, zf),
    u
  )
  const x2 = lerp(
    dot3(GRAD3[aba % 16], xf, yf - 1, zf),
    dot3(GRAD3[bba % 16], xf - 1, yf - 1, zf),
    u
  )
  const y1 = lerp(x1, x2, v)

  const x3 = lerp(
    dot3(GRAD3[aab % 16], xf, yf, zf - 1),
    dot3(GRAD3[bab % 16], xf - 1, yf, zf - 1),
    u
  )
  const x4 = lerp(
    dot3(GRAD3[abb % 16], xf, yf - 1, zf - 1),
    dot3(GRAD3[bbb % 16], xf - 1, yf - 1, zf - 1),
    u
  )
  const y2 = lerp(x3, x4, v)

  return lerp(y1, y2, w)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** 3D fBm，输出约 [0, 1] */
export function fbm3(
  x: number,
  y: number,
  z: number,
  seed: number,
  octaves = 6,
  lacunarity = 2.03,
  gain = 0.5
): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += (perlin3(x * freq, y * freq, z * freq, seed + i * 131) * 0.5 + 0.5) * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

/** 脊状噪声（山脉），输出约 [0, 1] */
export function ridged3(x: number, y: number, z: number, seed: number, octaves = 4): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = perlin3(x * freq, y * freq, z * freq, seed + i * 97)
    const r = 1 - Math.abs(n)
    sum += r * r * amp
    norm += amp
    amp *= 0.5
    freq *= 2.2
  }
  return sum / norm
}

/** 等距圆柱像素 → 单位球面坐标（天然经线闭合，无极点条纹） */
export function equirectToSphere(
  x: number,
  y: number,
  width: number,
  height: number
): { nx: number; ny: number; nz: number; lat: number; lon: number } {
  const lon = (x / width) * Math.PI * 2 - Math.PI
  const lat = ((height - 1 - y) / height) * Math.PI - Math.PI / 2
  const cosLat = Math.cos(lat)
  return {
    nx: cosLat * Math.cos(lon),
    ny: Math.sin(lat),
    nz: cosLat * Math.sin(lon),
    lat,
    lon
  }
}

export function wrapDelta(a: number, b: number, period: number): number {
  let d = a - b
  const half = period * 0.5
  while (d > half) d -= period
  while (d < -half) d += period
  return d
}

/** @deprecated 旧 2D 噪声，保留兼容 */
export function fbm(x: number, y: number, seed: number, octaves = 6): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += hash2D(Math.floor(x * freq), Math.floor(y * freq), seed + i * 97) * amp
    norm += amp
    amp *= 0.52
    freq *= 2.05
  }
  return sum / norm
}

export function domainWarp(
  x: number,
  y: number,
  seed: number,
  strength = 1
): [number, number] {
  const wx = fbm(x * 0.012, y * 0.012, seed, 5) * 42 * strength
  const wy = fbm(x * 0.012 + 80, y * 0.012 + 80, seed + 300, 5) * 42 * strength
  return [x + wx, y + wy]
}
