import * as THREE from 'three'

/** 与高度图生成器 equirectToSphere 一致的经纬度（度） */
export function percentToLatLon(x: number, y: number): { lat: number; lon: number } {
  const lon = (x / 100) * 360 - 180
  const lat = 90 - (y / 100) * 180
  return { lat, lon }
}

/** 百分坐标 → 像素（y=0 为北/图像顶部，与 equirectToSphere 一致） */
export function percentToPixel(
  x: number,
  y: number,
  width: number,
  height: number
): { px: number; py: number } {
  const px = Math.min(width - 1, Math.max(0, Math.floor((x / 100) * width)))
  const py = Math.min(height - 1, Math.max(0, Math.floor((y / 100) * height)))
  return { px, py }
}

export function pixelToPercent(px: number, py: number, width: number, height: number): [number, number] {
  return [((px + 0.5) / width) * 100, ((py + 0.5) / height) * 100]
}

/**
 * 百分坐标 → Three.js SphereGeometry 局部坐标（与等距圆柱贴图 UV 一致）
 * x=0 为图左（经度 -180°），y=0 为图顶（北极）
 */
export function percentToGlobeVector3(x: number, y: number, radius: number): THREE.Vector3 {
  const u = x / 100
  const v = 1 - y / 100
  const phi = u * Math.PI * 2
  const theta = (1 - v) * Math.PI
  const sinTheta = Math.sin(theta)
  return new THREE.Vector3(
    -Math.cos(phi) * sinTheta * radius,
    Math.cos(theta) * radius,
    Math.sin(phi) * sinTheta * radius
  )
}

/**
 * 经纬度 → 球面坐标（数学惯例：lon=0 指向 +X，+Y 为北极；河流大圆等用）
 */
export function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const latRad = (lat * Math.PI) / 180
  const lonRad = (lon * Math.PI) / 180
  const cosLat = Math.cos(latRad)
  return new THREE.Vector3(
    radius * cosLat * Math.cos(lonRad),
    radius * Math.sin(latRad),
    radius * cosLat * Math.sin(lonRad)
  )
}

export function worldToScreen(
  world: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number
): { x: number; y: number; visible: boolean } {
  const v = world.clone().project(camera)
  return {
    x: (v.x * 0.5 + 0.5) * width,
    y: (-v.y * 0.5 + 0.5) * height,
    visible: v.z < 1
  }
}

export function lonDelta(lonA: number, lonB: number): number {
  let d = lonB - lonA
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

export function slerpLatLon(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number,
  t: number
): { lat: number; lon: number } {
  const v1 = latLonToVector3(latA, lonA, 1)
  const v2 = latLonToVector3(latB, lonB, 1)
  const dot = Math.min(1, Math.max(-1, v1.dot(v2)))
  const theta = Math.acos(dot)
  if (theta < 1e-5) {
    return {
      lat: latA + (latB - latA) * t,
      lon: lonA + lonDelta(lonA, lonB) * t
    }
  }
  const sinT = Math.sin(theta)
  const w1 = Math.sin((1 - t) * theta) / sinT
  const w2 = Math.sin(t * theta) / sinT
  const v = new THREE.Vector3(
    v1.x * w1 + v2.x * w2,
    v1.y * w1 + v2.y * w2,
    v1.z * w1 + v2.z * w2
  )
  const lat = (Math.asin(Math.min(1, Math.max(-1, v.y))) * 180) / Math.PI
  const lon = (Math.atan2(v.z, v.x) * 180) / Math.PI
  return { lat, lon }
}

export function greatCirclePath(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number,
  segments: number,
  radius: number
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const { lat, lon } = slerpLatLon(latA, lonA, latB, lonB, i / segments)
    pts.push(latLonToVector3(lat, lon, radius))
  }
  return pts
}

/** Chaikin 平滑折线（用于河流自然弯曲） */
export function smoothPolyline(points: [number, number][], iterations = 2): [number, number][] {
  if (points.length < 3) return points
  let pts = points
  for (let it = 0; it < iterations; it++) {
    const next: [number, number][] = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]
      const [x1, y1] = pts[i + 1]
      next.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25])
      next.push([x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75])
    }
    next.push(pts[pts.length - 1])
    pts = next
  }
  return pts
}

/** 两经纬度点之间的球面角距（度） */
export function angularDistanceDeg(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number
): number {
  const v1 = latLonToVector3(latA, lonA, 1)
  const v2 = latLonToVector3(latB, lonB, 1)
  return (Math.acos(Math.min(1, Math.max(-1, v1.dot(v2)))) * 180) / Math.PI
}

/** 百分坐标折线按球面角距切段，避免跨地图误连 */
export function splitPolylineByAngularGap(
  points: [number, number][],
  maxDeg = 12
): [number, number][][] {
  if (points.length < 2) return points.length ? [points] : []
  const segments: [number, number][][] = []
  let current: [number, number][] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = percentToLatLon(points[i - 1][0], points[i - 1][1])
    const b = percentToLatLon(points[i][0], points[i][1])
    const deg = angularDistanceDeg(a.lat, a.lon, b.lat, b.lon)
    if (deg > maxDeg && current.length >= 1) {
      if (current.length >= 2) segments.push(current)
      current = [points[i]]
    } else {
      current.push(points[i])
    }
  }
  if (current.length >= 2) segments.push(current)
  return segments
}
