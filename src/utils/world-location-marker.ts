import type { WorldLocation } from '@/types/project'

/** 地图上的聚落显示层级（与 type + 区划角色组合） */
export type LocationDisplayTier =
  | 'capital'
  | 'provincial'
  | 'prefecture'
  | 'county'
  | 'village'
  | 'fortress'
  | 'landmark'
  | 'other'

/** 区划层级命名：首都 → 省会 → 城市 → 县市 → 小镇 */
export const ADMIN_ROLE = {
  CAPITAL: '首都',
  PROVINCIAL: '省会',
  CITY: '城市',
  COUNTY: '县市',
  TOWN: '小镇',
  LANDMARK: '地标'
} as const

export function parseAdminRole(authorSettings?: string): string | undefined {
  const m = /区划[：:]\s*(\S+)/.exec(authorSettings ?? '')
  return m?.[1]
}

export function parseAdminRegionName(authorSettings?: string): string | undefined {
  const m = /辖区[：:]\s*(.+)/.exec(authorSettings ?? '')
  return m?.[1]?.trim()
}

/** 将旧版区划名映射为现行五级命名 */
export function canonicalAdminRole(role: string | undefined): string | undefined {
  if (!role) return undefined
  switch (role) {
    case '都城':
      return ADMIN_ROLE.CAPITAL
    case '府治':
      return ADMIN_ROLE.CITY
    case '县治':
      return ADMIN_ROLE.COUNTY
    case '镇':
    case '集镇':
      return ADMIN_ROLE.TOWN
    default:
      return role
  }
}

export function isProvincialAdminRole(role: string | undefined): boolean {
  return canonicalAdminRole(role) === ADMIN_ROLE.PROVINCIAL
}

export function isCityAdminRole(role: string | undefined): boolean {
  return canonicalAdminRole(role) === ADMIN_ROLE.CITY
}

export function setLocationAdminRole(loc: WorldLocation, role: string, regionName?: string): void {
  const region =
    regionName ?? parseAdminRegionName(loc.authorSettings) ?? loc.regionId ?? '本区'
  loc.authorSettings = `区划：${role}\n辖区：${region}`
}

export function locationDisplayTier(loc: WorldLocation): LocationDisplayTier {
  const role = canonicalAdminRole(parseAdminRole(loc.authorSettings))
  if (loc.type === 'capital' || role === ADMIN_ROLE.CAPITAL) return 'capital'
  if (role === ADMIN_ROLE.PROVINCIAL) return 'provincial'
  if (role === ADMIN_ROLE.CITY) return 'prefecture'
  if (role === ADMIN_ROLE.COUNTY || loc.type === 'town') {
    return loc.type === 'village' ? 'village' : 'county'
  }
  if (role === ADMIN_ROLE.TOWN || loc.type === 'village') return 'village'
  if (loc.type === 'fortress') return 'fortress'
  if (loc.type === 'landmark' || role === ADMIN_ROLE.LANDMARK) return 'landmark'
  if (loc.type === 'city') return 'prefecture'
  return 'other'
}

/** SVG viewBox 0–100 下的圆半径：级别越高越大 */
const TIER_RADIUS: Record<LocationDisplayTier, number> = {
  capital: 1.0,
  provincial: 0.78,
  prefecture: 0.54,
  county: 0.4,
  village: 0.32,
  fortress: 0.48,
  landmark: 0.42,
  other: 0.44
}

const TIER_LABEL: Record<LocationDisplayTier, string> = {
  capital: '首都',
  provincial: '省会',
  prefecture: '城市',
  county: '县市',
  village: '小镇',
  fortress: '要塞',
  landmark: '地标',
  other: '聚落'
}

export function locationMarkerRadius(loc: WorldLocation): number {
  return TIER_RADIUS[locationDisplayTier(loc)]
}

export function locationTierLabel(loc: WorldLocation): string {
  return TIER_LABEL[locationDisplayTier(loc)]
}

export function locationMarkerClass(loc: WorldLocation): string {
  return `marker-tier-${locationDisplayTier(loc)}`
}

/** 缩放阈值：放大后才显示下级聚落 */
export const MAP_ZOOM_SHOW_PREFECTURE = 1.2
export const MAP_ZOOM_SHOW_COUNTY = 1.55
export const MAP_ZOOM_SHOW_VILLAGE = 1.9
export const MAP_ZOOM_SHOW_LABEL_LOWER = 1.75

export function isMarkerVisibleAtZoom(loc: WorldLocation, zoom: number): boolean {
  const tier = locationDisplayTier(loc)
  if (tier === 'capital' || tier === 'provincial' || tier === 'landmark') return true
  if (tier === 'prefecture' || tier === 'fortress') return zoom >= MAP_ZOOM_SHOW_PREFECTURE
  if (tier === 'county' || tier === 'other') return zoom >= MAP_ZOOM_SHOW_COUNTY
  if (tier === 'village') return zoom >= MAP_ZOOM_SHOW_VILLAGE
  return false
}

export function isMarkerLabelVisibleAtZoom(
  loc: WorldLocation,
  zoom: number,
  selectedLocationId?: string | null,
  showAllMarkers = false
): boolean {
  if (showAllMarkers) {
    if (loc.id === selectedLocationId) return true
    const tier = locationDisplayTier(loc)
    if (tier === 'capital' || tier === 'provincial') return true
    return zoom >= MAP_ZOOM_SHOW_PREFECTURE
  }
  if (loc.id === selectedLocationId) return true
  const tier = locationDisplayTier(loc)
  if (tier === 'capital' || tier === 'provincial') return true
  if (tier === 'landmark') return zoom >= MAP_ZOOM_SHOW_PREFECTURE
  return zoom >= MAP_ZOOM_SHOW_LABEL_LOWER && isMarkerVisibleAtZoom(loc, zoom)
}

/** 地图默认只显示首都、省会、地标；城市/县市/小镇等放大后显示 */
export function isPrimaryMapMarker(loc: WorldLocation): boolean {
  const tier = locationDisplayTier(loc)
  return tier === 'capital' || tier === 'provincial' || tier === 'landmark'
}

export function mapMarkersForDisplay(
  locations: WorldLocation[],
  selectedLocationId?: string | null,
  zoom = 1,
  showAllMarkers = false
): WorldLocation[] {
  if (showAllMarkers) {
    if (!selectedLocationId) return locations
    const sel = locations.find((l) => l.id === selectedLocationId)
    if (!sel || locations.some((p) => p.id === sel.id)) return locations
    return [...locations, sel]
  }
  const visible = locations.filter(
    (loc) => isMarkerVisibleAtZoom(loc, zoom) || loc.id === selectedLocationId
  )
  if (!selectedLocationId) return visible
  const sel = locations.find((l) => l.id === selectedLocationId)
  if (!sel || visible.some((p) => p.id === sel.id)) return visible
  return [...visible, sel]
}

/** 平面地图点击拾取半径（随点大小略增） */
export function locationPickRadiusPx(loc: WorldLocation, viewWidthPx: number): number {
  const rPct = locationMarkerRadius(loc)
  return Math.max(8, (rPct / 100) * viewWidthPx * 1.8)
}
