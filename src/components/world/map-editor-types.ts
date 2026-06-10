export type MapOverlayMode =
  | 'terrain'
  | 'temperature'
  | 'humidity'
  | 'monsoon'
  | 'territory'
  | 'provinces'
  | 'development'

export {
  CELLS_PER_PROVINCE_DEFAULT,
  CELLS_PER_PROVINCE_MAX,
  CELLS_PER_PROVINCE_MIN
} from '@/utils/world-admin-divisions'

export type TerritoryPaintMode = 'select' | 'paint' | 'erase' | 'fill' | 'box-fill' | 'box-erase'

/** 画笔/擦除半径（hex 步长，0=单格，1≈7格，2≈19格…） */
export const BRUSH_RADIUS_MIN = 0
export const BRUSH_RADIUS_MAX = 4
export const BRUSH_RADIUS_DEFAULT = 1

/** 点击国家列表：edit=仅选中并编辑文案，paint=可切到画笔涂抹 */
export type NationListMode = 'edit' | 'paint'

export function brushSizeLabel(radius: number): string {
  if (radius <= 0) return '单格'
  if (radius === 1) return '小（约 7 格）'
  if (radius === 2) return '中（约 19 格）'
  if (radius === 3) return '大（约 37 格）'
  return '特大'
}
