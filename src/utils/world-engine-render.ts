/**
 * WorldEngine 卫星生物群系图渲染
 */

import {
  biomeSatelliteColor,
  LAKE_COLOR,
  randomBiomeNoise,
  RIVER_COLOR
} from '@/utils/world-engine-colors'
import type { WorldEngineState } from '@/utils/world-engine-simulations'
import { sealEquirectangularSeam } from '@/utils/world-map-image'

export function renderWorldEngineSatelliteMap(state: WorldEngineState): Uint8ClampedArray {
  const { width, height, elevation, ocean, biome, rivermap, lakemap, watermap, watermapThresholds } =
    state
  const rgba = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const pi = idx * 4
      const isLand = !ocean[idx]
      const b = biome[idx]
      const [nr, ng, nb] = randomBiomeNoise(state.seed, x, y)
      const [r, g, bcol] = biomeSatelliteColor(b, elevation[idx], isLand, nr, ng, nb)
      rgba[pi] = r
      rgba[pi + 1] = g
      rgba[pi + 2] = bcol
      rgba[pi + 3] = 255

      if (isLand && lakemap[idx] > 0) {
        rgba[pi] = LAKE_COLOR[0]
        rgba[pi + 1] = LAKE_COLOR[1]
        rgba[pi + 2] = LAKE_COLOR[2]
      } else if (isLand && rivermap[idx] > 0) {
        rgba[pi] = RIVER_COLOR[0]
        rgba[pi + 1] = RIVER_COLOR[1]
        rgba[pi + 2] = RIVER_COLOR[2]
      } else if (isLand && watermap[idx] >= watermapThresholds.river) {
        rgba[pi] = RIVER_COLOR[0]
        rgba[pi + 1] = RIVER_COLOR[1]
        rgba[pi + 2] = RIVER_COLOR[2]
      }
    }
  }

  sealEquirectangularSeam(rgba, width, height, 6)
  return rgba
}
