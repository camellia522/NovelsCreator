/** Re-export shared WorldEngine official presets for the renderer bundle. */
export type { WorldScale } from '@/types/world-gen'
export {
  WORLDENGINE_SEED_MAX,
  WORLDENGINE_OFFICIAL,
  WORLDENGINE_SCALE_PRESETS,
  worldEnginePreset,
  worldEngineDimensions,
  numPlatesForScale,
  renderResolutionForScale,
  equirectDimensionsForScale,
  clampWorldPlates
} from '../../shared/world-engine-official'
export type { WorldEngineScalePreset } from '../../shared/world-engine-official'
