import type { WorldScale } from '../../src/types/world-gen'
import {
  clampWorldPlates,
  normalizeWorldSeed,
  numPlatesForScale,
  worldEngineDimensions,
  WORLDENGINE_SEED_MAX
} from '../../../shared/world-engine-official'

export {
  clampWorldPlates,
  normalizeWorldSeed,
  numPlatesForScale,
  worldEngineDimensions,
  WORLDENGINE_SEED_MAX
}

export function resolveProjectRoot(appPath: string): string {
  const norm = appPath.replace(/\\/g, '/')
  if (norm.endsWith('/out/main')) return norm.slice(0, -'/out/main'.length)
  if (norm.endsWith('/out')) return norm.slice(0, -'/out'.length)
  return appPath
}

export type { WorldScale }
