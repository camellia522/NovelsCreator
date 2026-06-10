/**
 * 气候带与季风模型（地图 y：0=北端，1=南端，0.5≈赤道）
 */

export interface ClimateInfo {
  label: string
  /** 综合说明，用于地点简介 */
  summary: string
  /** 0=极冷 … 1=极热 */
  heat: number
  /** 0=极干 … 1=极湿 */
  wet: number
}

/** 距赤道归一化距离 0（赤道）~ 1（极点） */
export function equatorDistance(yNorm: number): number {
  return Math.abs(yNorm - 0.5) * 2
}

function lapseCooling(elevAboveSea: number): number {
  return Math.min(0.55, elevAboveSea * 2.8)
}

/** 基础纬度带（未考虑地形/季风） */
function baseLatitudeClimate(yNorm: number, configMode: string): { heat: number; wet: number; band: string } {
  const eq = equatorDistance(yNorm)
  let heat = 1 - eq * 0.92
  let wet = 0.55
  let band = '中纬度'

  if (eq < 0.12) {
    band = '赤道'
    heat = 0.95
    wet = 0.85
  } else if (eq < 0.28) {
    band = '热带'
    heat = 0.82
    wet = 0.7
  } else if (eq < 0.42) {
    band = '亚热带'
    heat = 0.68
    wet = 0.55
  } else if (eq < 0.58) {
    band = '温带'
    heat = 0.5
    wet = 0.48
  } else if (eq < 0.75) {
    band = '亚寒带'
    heat = 0.32
    wet = 0.38
  } else {
    band = '寒带'
    heat = 0.15
    wet = 0.3
  }

  if (configMode === 'cold') {
    heat *= 0.82
    if (eq > 0.5) wet += 0.08
  } else if (configMode === 'tropical') {
    heat = Math.min(1, heat + 0.12)
  } else if (configMode === 'temperate') {
    if (eq < 0.25 || eq > 0.65) heat *= 0.9
  }

  return { heat, wet, band }
}

export interface ClimateContext {
  isEastCoast: boolean
  isWestCoast: boolean
  rainShadow: boolean
  monsoon: boolean
  elevAboveSea: number
  oceanDist: number
}

export function resolveClimate(
  yNorm: number,
  ctx: ClimateContext,
  configMode: string
): ClimateInfo {
  const base = baseLatitudeClimate(yNorm, configMode)
  let { heat, wet } = base
  const eq = equatorDistance(yNorm)

  heat -= lapseCooling(ctx.elevAboveSea)

  if (ctx.rainShadow) {
    wet -= 0.28
  }
  if (ctx.isWestCoast && eq > 0.35 && eq < 0.65) {
    wet += 0.12
  }
  if (ctx.monsoon) {
    wet += 0.22
    heat += 0.04
  }
  if (ctx.isEastCoast && eq < 0.35) {
    wet += 0.1
  }
  if (eq > 0.72 && ctx.elevAboveSea > 0.02 && ctx.oceanDist < 0.2) {
    heat -= 0.06
    wet += 0.04
  }
  if (eq > 0.78) {
    heat = Math.min(heat, 0.09)
    wet = Math.max(wet, 0.25)
  }
  if (ctx.oceanDist < 0.08) {
    wet += 0.08
    heat -= 0.03
  } else if (ctx.oceanDist > 0.35) {
    wet -= 0.12
    heat += 0.06
  }

  wet = Math.max(0.05, Math.min(1, wet))
  heat = Math.max(0.02, Math.min(1, heat))

  let label: string
  if (heat < 0.12) label = '冰原/极寒'
  else if (heat < 0.22 && wet > 0.35) label = '苔原'
  else if (heat < 0.22) label = '极地干旱'
  else if (eq < 0.15 && wet > 0.75) label = '赤道雨林'
  else if (eq < 0.32 && ctx.monsoon && wet > 0.55) label = '热带季风'
  else if (eq < 0.32 && wet < 0.35) label = '热带沙漠'
  else if (eq < 0.32) label = '热带草原'
  else if (eq < 0.45 && ctx.monsoon && wet > 0.5) label = '亚热带季风'
  else if (eq < 0.45 && wet < 0.32) label = '亚热带干旱'
  else if (eq < 0.45 && ctx.isWestCoast && wet > 0.4 && wet < 0.55) label = '地中海气候'
  else if (eq < 0.45) label = '亚热带湿润'
  else if (eq < 0.62 && ctx.isWestCoast && wet > 0.45) label = '温带海洋'
  else if (eq < 0.62 && wet < 0.32) label = '温带大陆性干旱'
  else if (eq < 0.62 && ctx.rainShadow) label = '温带内陆干旱'
  else if (eq < 0.62) label = '温带大陆'
  else if (eq < 0.78 && wet > 0.42) label = '亚寒带针叶林'
  else if (eq < 0.78) label = '亚寒带'
  else label = '寒带'

  const hemisphere = yNorm < 0.5 ? '北半球' : '南半球'
  const parts: string[] = [label, hemisphere]
  if (ctx.monsoon) parts.push('季风影响')
  if (ctx.rainShadow) parts.push('雨影区')
  if (ctx.elevAboveSea > 0.18) parts.push('高海拔')
  if (ctx.isEastCoast) parts.push('东岸')
  if (ctx.isWestCoast) parts.push('西岸')

  return {
    label,
    summary: parts.join(' · '),
    heat,
    wet
  }
}

export function climateLabelShort(info: ClimateInfo): string {
  return info.label
}
