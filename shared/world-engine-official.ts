/**
 * Mindwerks/worldengine 官方 CLI 默认值与约束（主进程 + 渲染进程共享）
 * @see scripts/.conda-env/Lib/site-packages/worldengine/cli/main.py
 */

export type WorldScale = 'kingdom' | 'archipelago' | 'continent' | 'world' | 'planet'

/** 官方 CLI：seed ∈ [0, uint16.max]（protobuf 序列化亦为 uint16） */
export const WORLDENGINE_SEED_MAX = 65535

export const WORLDENGINE_OFFICIAL = {
  seedMin: 0,
  seedMax: WORLDENGINE_SEED_MAX,
  platesMin: 1,
  platesMax: 100,
  defaultWidth: 512,
  defaultHeight: 512,
  defaultPlates: 10,
  defaultOceanLevel: 1.0,
  defaultGamma: 1.25,
  defaultGammaOffset: 0.2,
  defaultTemps: [0.874, 0.765, 0.594, 0.439, 0.366, 0.124] as const,
  defaultHumids: [0.941, 0.778, 0.507, 0.236, 0.073, 0.014, 0.002] as const
} as const

export interface WorldEngineScalePreset {
  id: WorldScale
  label: string
  width: number
  height: number
  numPlates: number
  desc: string
}

export const WORLDENGINE_SCALE_PRESETS: WorldEngineScalePreset[] = [
  {
    id: 'kingdom',
    label: '官方默认',
    width: 512,
    height: 512,
    numPlates: 10,
    desc: '512×512 · -q 10（CLI 默认）'
  },
  {
    id: 'archipelago',
    label: '群岛级',
    width: 1024,
    height: 512,
    numPlates: 7,
    desc: '1024×512 · 2:1 贴球'
  },
  {
    id: 'continent',
    label: '大陆级',
    width: 2048,
    height: 1024,
    numPlates: 10,
    desc: '2048×1024 · -q 10'
  },
  {
    id: 'world',
    label: '世界级',
    width: 3072,
    height: 1536,
    numPlates: 12,
    desc: '3072×1536 · -q 12'
  },
  {
    id: 'planet',
    label: '地球级',
    width: 4096,
    height: 2048,
    numPlates: 14,
    desc: '4096×2048 · -q 14'
  }
]

const presetById = Object.fromEntries(
  WORLDENGINE_SCALE_PRESETS.map((p) => [p.id, p])
) as Record<WorldScale, WorldEngineScalePreset>

export function worldEnginePreset(scale: WorldScale): WorldEngineScalePreset {
  return presetById[scale] ?? presetById.continent
}

export function worldEngineDimensions(scale: WorldScale): { width: number; height: number } {
  const p = worldEnginePreset(scale)
  return { width: p.width, height: p.height }
}

export function numPlatesForScale(scale: WorldScale): number {
  return worldEnginePreset(scale).numPlates
}

export function renderResolutionForScale(scale: WorldScale): number {
  return worldEnginePreset(scale).height
}

export function equirectDimensionsForScale(scale: WorldScale): { width: number; height: number } {
  return worldEngineDimensions(scale)
}

export function clampWorldPlates(n: number | undefined): number {
  const v = Math.trunc(n ?? WORLDENGINE_OFFICIAL.defaultPlates)
  return Math.min(WORLDENGINE_OFFICIAL.platesMax, Math.max(WORLDENGINE_OFFICIAL.platesMin, v))
}

export function normalizeWorldSeed(seed?: number): number {
  if (seed == null || !Number.isFinite(seed)) {
    return Date.now() % (WORLDENGINE_SEED_MAX + 1)
  }
  const v = Math.trunc(seed)
  return ((v % (WORLDENGINE_SEED_MAX + 1)) + (WORLDENGINE_SEED_MAX + 1)) % (WORLDENGINE_SEED_MAX + 1)
}

export function randomWorldSeed(): number {
  return Math.floor(Math.random() * (WORLDENGINE_SEED_MAX + 1))
}
