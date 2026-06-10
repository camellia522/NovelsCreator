/** WorldEngine draw.py _biome_satellite_colors（卫星视图配色） */
export const WORLD_ENGINE_BIOME_COLORS: Record<string, [number, number, number]> = {
  ocean: [23, 94, 145],
  sea: [23, 94, 145],
  ice: [255, 255, 255],
  'subpolar dry tundra': [186, 199, 206],
  'subpolar moist tundra': [186, 195, 202],
  'subpolar wet tundra': [186, 195, 204],
  'subpolar rain tundra': [186, 200, 210],
  'polar desert': [182, 195, 201],
  'boreal desert': [132, 146, 143],
  'cool temperate desert': [183, 163, 126],
  'warm temperate desert': [166, 142, 104],
  'subtropical desert': [205, 181, 137],
  'tropical desert': [203, 187, 153],
  'boreal rain forest': [21, 29, 8],
  'cool temperate rain forest': [25, 34, 15],
  'warm temperate rain forest': [19, 28, 7],
  'subtropical rain forest': [48, 60, 24],
  'tropical rain forest': [21, 38, 6],
  'boreal wet forest': [6, 17, 11],
  'cool temperate wet forest': [6, 17, 11],
  'warm temperate wet forest': [44, 48, 19],
  'subtropical wet forest': [23, 36, 10],
  'tropical wet forest': [23, 36, 10],
  'boreal moist forest': [31, 39, 18],
  'cool temperate moist forest': [31, 39, 18],
  'warm temperate moist forest': [36, 42, 19],
  'subtropical moist forest': [23, 31, 10],
  'tropical moist forest': [24, 36, 11],
  'warm temperate dry forest': [52, 51, 30],
  'subtropical dry forest': [53, 56, 30],
  'tropical dry forest': [54, 60, 30],
  'boreal dry scrub': [73, 70, 61],
  'cool temperate desert scrub': [80, 58, 44],
  'warm temperate desert scrub': [92, 81, 49],
  'subtropical desert scrub': [68, 57, 35],
  'tropical desert scrub': [107, 87, 60],
  'cool temperate steppe': [95, 82, 50],
  'warm temperate thorn scrub': [77, 81, 48],
  'subtropical thorn woodland': [27, 40, 12],
  'tropical thorn woodland': [40, 62, 15],
  'tropical very dry forest': [87, 81, 49],
  'bare rock': [128, 128, 128]
}

const MOUNTAIN_COLOR: [number, number, number] = [101, 87, 67]
const NOISE_RANGE = 12
const HILL_ELEV = 1.05
const HIGH_HILL_ELEV = 1.15
const MOUNTAIN_ELEV = 1.25
const HIGH_MOUNTAIN_ELEV = 1.4

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function averageColors(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), Math.round((a[2] + b[2]) / 2)]
}

/** WorldEngine draw.py get_biome_color_based_on_elevation */
export function biomeSatelliteColor(
  biome: string,
  elev: number,
  isLand: boolean,
  noiseR: number,
  noiseG: number,
  noiseB: number
): [number, number, number] {
  let base = WORLD_ENGINE_BIOME_COLORS[biome] ?? WORLD_ENGINE_BIOME_COLORS['bare rock']
  let nr = 0
  let ng = 0
  let nb = 0

  if (isLand) {
    nr = noiseR
    ng = noiseG
    nb = noiseB
    if (elev > HIGH_MOUNTAIN_ELEV) {
      nr += 40
      ng += 40
      nb += 40
      base = averageColors(base, MOUNTAIN_COLOR)
    } else if (elev > MOUNTAIN_ELEV) {
      ng -= 20
      base = averageColors(base, MOUNTAIN_COLOR)
    } else if (elev > HIGH_HILL_ELEV) {
      ng -= 10
    } else if (elev > HILL_ELEV) {
      ng -= 5
    }
    const mod = Math.floor(elev / 0.08)
    return [
      clamp255(base[0] + nr + mod),
      clamp255(base[1] + ng + mod),
      clamp255(base[2] + nb + mod)
    ]
  }
  return base
}

export function randomBiomeNoise(seed: number, x: number, y: number): [number, number, number] {
  const h = (seed + x * 374761393 + y * 668265263) >>> 0
  const r = ((h * 1274126177) >>> 0) % (NOISE_RANGE * 2 + 1) - NOISE_RANGE
  const g = (((h + 1) * 1274126177) >>> 0) % (NOISE_RANGE * 2 + 1) - NOISE_RANGE
  const b = (((h + 2) * 1274126177) >>> 0) % (NOISE_RANGE * 2 + 1) - NOISE_RANGE
  return [r, g, b]
}

/** 河流 / 湖泊（WorldEngine drawing_functions） */
export const RIVER_COLOR: [number, number, number] = [0, 0, 128]
export const LAKE_COLOR: [number, number, number] = [0, 100, 128]
