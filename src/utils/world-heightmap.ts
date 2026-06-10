/**
 * 世界地图生成入口 — 完全遵循 WorldEngine（Mindwerks/worldengine）
 */

export {
  equirectDimensionsForScale,
  numPlatesForScale,
  renderResolutionForScale,
  worldEngineDimensions
} from '@/utils/world-engine-official'

export {
  generateWorldEngineMap as generateWorldFromHeightmap,
  type WorldEngineGenResult as HeightmapWorldResult
} from '@/utils/world-engine-gen'
