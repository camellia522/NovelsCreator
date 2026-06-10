<script setup lang="ts">
import * as THREE from 'three'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { WorldLocation, WorldMapDocument } from '@/types/project'
import { MAP_CELL_SIZE, TERRAIN_COLORS } from '@/utils/world-generator'
import { locationDisplayTier, type LocationDisplayTier } from '@/utils/world-location-marker'
import { percentToGlobeVector3, worldToScreen } from '@/utils/world-map-coords'

const props = withDefaults(
  defineProps<{
    map: WorldMapDocument | null
    locations?: WorldLocation[]
    selectedLocationId?: string | null
    /** 点击聚落标记发 select */
    interactive?: boolean
    /** 拖拽旋转地球（与 interactive 独立，默认开） */
    rotatable?: boolean
    showLabels?: boolean
    /** PNG 底图（等距圆柱投影，预览或已加载项目） */
    imageUrl?: string | null
    /** 河流已绘制在贴图上；默认不在球面叠加 3D 线（避免极地放射伪影） */
    showRiversOnGlobe?: boolean
  }>(),
  {
    locations: () => [],
    selectedLocationId: null,
    interactive: true,
    rotatable: true,
    showLabels: true,
    imageUrl: null,
    showRiversOnGlobe: false
  }
)

const emit = defineEmits<{ select: [locationId: string] }>()

const wrapRef = ref<HTMLElement | null>(null)
const labelLayerRef = ref<HTMLElement | null>(null)
const hoverId = ref<string | null>(null)

const tierColor: Record<LocationDisplayTier, number> = {
  capital: 0xe85a9a,
  provincial: 0x5eb8ff,
  prefecture: 0xe8a045,
  county: 0x8fd4a0,
  village: 0xa8b0b8,
  fortress: 0xc96a6a,
  landmark: 0xb88cff,
  other: 0xc8b890
}

const tierRadiusScale: Record<LocationDisplayTier, number> = {
  capital: 1.55,
  provincial: 1.15,
  prefecture: 0.82,
  county: 0.64,
  village: 0.5,
  fortress: 0.82,
  landmark: 0.72,
  other: 0.7
}

const GLOBE_RADIUS = 1
const SURFACE = GLOBE_RADIUS * 1.004
const MARKER_RADIUS = 0.014

interface LabelPos {
  id: string
  name: string
  x: number
  y: number
  visible: boolean
}

const labelPositions = ref<LabelPos[]>([])

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let globeGroup: THREE.Group | null = null
let globeMesh: THREE.Mesh | null = null
let markerGroup: THREE.Group | null = null
let riverGroup: THREE.Group | null = null
let lakeGroup: THREE.Group | null = null
let poleGroup: THREE.Group | null = null
let markerMeshes = new Map<string, THREE.Mesh>()
let resizeObserver: ResizeObserver | null = null
let animId = 0
let currentTexture: THREE.Texture | null = null
let fallbackTexture: THREE.CanvasTexture | null = null

let isDragging = false
let dragMoved = false
let lastPointer = { x: 0, y: 0 }
let rotVelX = 0
let rotVelY = 0
let dragAxis = new THREE.Vector3()
let dragQuat = new THREE.Quaternion()
const globeQuat = new THREE.Quaternion()
let raycaster = new THREE.Raycaster()
let pointerNdc = new THREE.Vector2()
let labelsDirty = true

function disposeMaterial(mat: THREE.Material | THREE.Material[]): void {
  const list = Array.isArray(mat) ? mat : [mat]
  for (const m of list) {
    if ('map' in m && m.map) (m.map as THREE.Texture).dispose()
    m.dispose()
  }
}

function buildFallbackTexture(map: WorldMapDocument): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = TERRAIN_COLORS.ocean
  ctx.fillRect(0, 0, size, size)
  const cs = map.cellSize ?? MAP_CELL_SIZE
  const cellPx = (cs / 100) * size
  const pad = Math.max(0.5, cellPx * 0.08)
  if (map.terrainCells?.length) {
    for (const c of map.terrainCells) {
      ctx.fillStyle = TERRAIN_COLORS[c.terrain]
      const px = (c.x / 100) * size - cellPx / 2
      const py = (c.y / 100) * size - cellPx / 2
      ctx.fillRect(px, py, cellPx + pad, cellPx + pad)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function configureGlobeTexture(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 8
}

function applyGlobeTexture(url: string | null | undefined): void {
  if (!globeMesh) return
  const mat = globeMesh.material as THREE.MeshStandardMaterial

  if (currentTexture) {
    currentTexture.dispose()
    currentTexture = null
  }
  if (fallbackTexture) {
    fallbackTexture.dispose()
    fallbackTexture = null
  }

  const loadUrl = url && !url.startsWith('nc-map://') ? url : null

  if (loadUrl && props.map?.hasRasterImage) {
    const loader = new THREE.TextureLoader()
    loader.load(
      loadUrl,
      (tex) => {
        configureGlobeTexture(tex)
        mat.map = tex
        mat.color.set(0xffffff)
        mat.needsUpdate = true
        currentTexture = tex
      },
      undefined,
      () => {
        if (props.map) {
          fallbackTexture = buildFallbackTexture(props.map)
          configureGlobeTexture(fallbackTexture)
          mat.map = fallbackTexture
          mat.needsUpdate = true
        }
      }
    )
  } else if (props.map) {
    fallbackTexture = buildFallbackTexture(props.map)
    configureGlobeTexture(fallbackTexture)
    mat.map = fallbackTexture
    mat.needsUpdate = true
  } else {
    mat.map = null
    mat.color.set(0x1a4a72)
    mat.needsUpdate = true
  }
}

function rebuildMarkers(): void {
  if (!markerGroup) return
  for (const child of markerGroup.children) {
    const mesh = child as THREE.Mesh
    mesh.geometry.dispose()
    disposeMaterial(mesh.material)
  }
  markerGroup.clear()
  markerMeshes.clear()

  for (const loc of props.locations) {
    const pos = percentToGlobeVector3(loc.x, loc.y, SURFACE)
    const tier = locationDisplayTier(loc)
    const geo = new THREE.SphereGeometry(MARKER_RADIUS * tierRadiusScale[tier], 12, 12)
    const mat = new THREE.MeshBasicMaterial({ color: tierColor[tier] })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(pos)
    mesh.userData.locationId = loc.id
    markerGroup.add(mesh)
    markerMeshes.set(loc.id, mesh)
  }
}

function makePoleLabelSprite(text: string, yPct: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 40
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 128, 40)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(8, 6, 112, 28)
  ctx.fillStyle = '#d8e8ff'
  ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 64, 20)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(0.22, 0.07, 1)
  const pos = percentToGlobeVector3(50, yPct, SURFACE * 1.045)
  sprite.position.copy(pos)
  if (yPct < 50) sprite.position.y += 0.02
  else sprite.position.y -= 0.02
  return sprite
}

function rebuildLakes(): void {
  if (!lakeGroup) return
  for (const child of lakeGroup.children) {
    const mesh = child as THREE.Mesh
    mesh.geometry.dispose()
    disposeMaterial(mesh.material)
  }
  lakeGroup.clear()
  // 湖泊已在 PNG 底图着色；球面不再叠加矢量轮廓（避免多边形排序错误产生跨球拉弦）
}

function rebuildPoles(): void {
  if (!poleGroup) return
  for (const child of poleGroup.children) {
    if (child instanceof THREE.Sprite) {
      const mat = child.material as THREE.SpriteMaterial
      mat.map?.dispose()
      mat.dispose()
    } else if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      disposeMaterial(child.material)
    }
  }
  poleGroup.clear()
  poleGroup.add(makePoleLabelSprite('北极', 2))
  poleGroup.add(makePoleLabelSprite('南极', 98))
}

function rebuildRivers(): void {
  if (!riverGroup) return
  for (const line of riverGroup.children) {
    const l = line as THREE.Line
    l.geometry.dispose()
    disposeMaterial(l.material)
  }
  riverGroup.clear()
}

function updateMarkerHighlight(): void {
  for (const [id, mesh] of markerMeshes) {
    const mat = mesh.material as THREE.MeshBasicMaterial
    const selected = id === props.selectedLocationId
    const hover = id === hoverId.value
    const loc = props.locations.find((l) => l.id === id)
    const tier = loc ? locationDisplayTier(loc) : 'other'
    mat.color.set(selected || hover ? 0xffffff : tierColor[tier])
    mesh.scale.setScalar(selected ? 1.35 : hover ? 1.2 : 1)
  }
}

function updateLabels(): void {
  if (!camera || !globeGroup || !wrapRef.value) {
    labelPositions.value = []
    return
  }
  const w = wrapRef.value.clientWidth
  const h = wrapRef.value.clientHeight
  const out: LabelPos[] = []

  globeGroup.updateMatrixWorld(true)

  for (const loc of props.locations) {
    const show =
      props.showLabels &&
      (loc.id === props.selectedLocationId ||
        loc.id === hoverId.value ||
        loc.type === 'capital')
    if (!show) continue

    const local = percentToGlobeVector3(loc.x, loc.y, 1)
    const world = percentToGlobeVector3(loc.x, loc.y, SURFACE * 1.02)
    world.applyMatrix4(globeGroup.matrixWorld)

    const normalWorld = local.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(globeGroup.matrixWorld))
    const viewDir = camera.position.clone().sub(world).normalize()
    if (normalWorld.dot(viewDir) < 0.05) continue

    const screen = worldToScreen(world, camera, w, h)
    out.push({ id: loc.id, name: loc.name, x: screen.x, y: screen.y - 10, visible: true })
  }
  labelPositions.value = out
}

function markLabelsDirty(): void {
  labelsDirty = true
}

function animate(): void {
  animId = requestAnimationFrame(animate)
  if (globeGroup && !isDragging) {
    if (Math.abs(rotVelX) + Math.abs(rotVelY) > 0.00005) {
      globeGroup.rotation.y += rotVelX
      globeGroup.rotation.x += rotVelY
      globeGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, globeGroup.rotation.x))
      rotVelX *= 0.94
      rotVelY *= 0.94
      markLabelsDirty()
    }
  }
  if (labelsDirty) {
    updateLabels()
    labelsDirty = false
  }
  renderer?.render(scene!, camera!)
}

function getSize(): { w: number; h: number } {
  const el = wrapRef.value
  if (!el) return { w: 400, h: 400 }
  const s = Math.max(1, Math.floor(Math.min(el.clientWidth, el.clientHeight)))
  return { w: s, h: s }
}

function onResize(): void {
  if (!renderer || !camera || !wrapRef.value) return
  const { w, h } = getSize()
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  markLabelsDirty()
}

function initScene(): void {
  const container = wrapRef.value
  if (!container) return

  const { w, h } = getSize()

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1420)

  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 50)
  camera.position.set(0, 0.15, 2.65)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.insertBefore(renderer.domElement, container.firstChild)

  const ambient = new THREE.AmbientLight(0xffffff, 0.55)
  scene.add(ambient)
  const sun = new THREE.DirectionalLight(0xffffff, 1.1)
  sun.position.set(4, 2, 3)
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0x88aacc, 0.35)
  fill.position.set(-3, -1, -2)
  scene.add(fill)

  globeGroup = new THREE.Group()
  globeGroup.rotation.y = 0
  scene.add(globeGroup)

  const globeGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 128, 80)
  const globeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.02
  })
  globeMesh = new THREE.Mesh(globeGeo, globeMat)
  globeGroup.add(globeMesh)

  const atmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.025, 64, 48)
  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x6eb5ff,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide
  })
  globeGroup.add(new THREE.Mesh(atmoGeo, atmoMat))

  markerGroup = new THREE.Group()
  riverGroup = new THREE.Group()
  lakeGroup = new THREE.Group()
  poleGroup = new THREE.Group()
  globeGroup.add(riverGroup)
  globeGroup.add(lakeGroup)
  globeGroup.add(poleGroup)
  globeGroup.add(markerGroup)

  applyGlobeTexture(props.imageUrl)
  rebuildPoles()
  rebuildMarkers()
  rebuildRivers()
  rebuildLakes()
  updateMarkerHighlight()
  markLabelsDirty()
  animate()
}

function disposeScene(): void {
  cancelAnimationFrame(animId)
  resizeObserver?.disconnect()
  resizeObserver = null

  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('pointerleave', onPointerUp)
    renderer.dispose()
    renderer.domElement.remove()
    renderer = null
  }

  if (globeMesh) {
    globeMesh.geometry.dispose()
    disposeMaterial(globeMesh.material)
  }
  if (currentTexture) currentTexture.dispose()
  if (fallbackTexture) fallbackTexture.dispose()

  scene = null
  camera = null
  globeGroup = null
  globeMesh = null
  markerGroup = null
  riverGroup = null
  lakeGroup = null
  poleGroup = null
  markerMeshes.clear()
}

function onPointerDown(e: PointerEvent): void {
  if (!props.rotatable || !renderer || !globeGroup) return
  isDragging = true
  dragMoved = false
  lastPointer = { x: e.clientX, y: e.clientY }
  rotVelX = 0
  rotVelY = 0
  renderer.domElement.setPointerCapture(e.pointerId)
  renderer.domElement.style.cursor = 'grabbing'
}

function onPointerMove(e: PointerEvent): void {
  if (!isDragging || !globeGroup || !camera) return
  const dx = e.clientX - lastPointer.x
  const dy = e.clientY - lastPointer.y
  if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true
  lastPointer = { x: e.clientX, y: e.clientY }

  const el = renderer!.domElement
  const w = el.clientWidth
  const h = el.clientHeight
  const factor = 4.5 / Math.min(w, h)

  dragAxis.set(dy * factor, dx * factor, 0).applyQuaternion(camera.quaternion)
  const angle = dragAxis.length()
  if (angle > 1e-6) {
    dragQuat.setFromAxisAngle(dragAxis.normalize(), angle)
    globeQuat.setFromEuler(globeGroup.rotation)
    globeQuat.premultiply(dragQuat)
    globeGroup.rotation.setFromQuaternion(globeQuat)
    globeGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, globeGroup.rotation.x))
    markLabelsDirty()
  }

  rotVelX = dx * 0.004
  rotVelY = dy * 0.004
}

function pickLocation(clientX: number, clientY: number): string | null {
  if (!renderer || !camera || !markerGroup) return null
  const rect = renderer.domElement.getBoundingClientRect()
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointerNdc, camera)
  const hits = raycaster.intersectObjects(markerGroup.children, false)
  if (hits.length) {
    return (hits[0].object.userData.locationId as string) ?? null
  }
  return null
}

function onPointerUp(e: PointerEvent): void {
  if (!renderer) return
  renderer.domElement.releasePointerCapture(e.pointerId)
  if (props.rotatable) renderer.domElement.style.cursor = 'grab'
  if (isDragging && !dragMoved && props.interactive) {
    const id = pickLocation(e.clientX, e.clientY)
    if (id) emit('select', id)
  }
  isDragging = false
}

function onLabelEnter(id: string): void {
  hoverId.value = id
  updateMarkerHighlight()
}

function onLabelLeave(): void {
  hoverId.value = null
  updateMarkerHighlight()
}

watch(
  () => [props.map, props.imageUrl],
  () => {
    applyGlobeTexture(props.imageUrl)
    rebuildRivers()
    rebuildLakes()
  },
  { deep: true, immediate: true }
)

watch(
  () => props.locations,
  () => {
    rebuildMarkers()
    updateMarkerHighlight()
    markLabelsDirty()
  },
  { deep: true }
)

watch(
  () => [props.selectedLocationId, hoverId.value],
  () => {
    updateMarkerHighlight()
    markLabelsDirty()
  }
)

onMounted(() => {
  initScene()
  if (renderer) {
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointerleave', onPointerUp)
    renderer.domElement.style.cursor = props.rotatable ? 'grab' : 'default'
  }
  if (wrapRef.value) {
    resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(wrapRef.value)
  }
})

onUnmounted(disposeScene)
</script>

<template>
  <div ref="wrapRef" class="map-wrap">
    <div ref="labelLayerRef" class="label-layer">
      <span
        v-for="lb in labelPositions"
        :key="lb.id"
        class="globe-label"
        :style="{ left: `${lb.x}px`, top: `${lb.y}px` }"
        @mouseenter="onLabelEnter(lb.id)"
        @mouseleave="onLabelLeave"
        @click.stop="interactive && emit('select', lb.id)"
      >
        {{ lb.name }}
      </span>
    </div>

    <p v-if="!map" class="empty">暂无地图，请使用世界观生成器创建</p>

    <div v-if="map && rotatable" class="hint">
      拖拽旋转地球<span v-if="interactive && locations.length"> · 点击标记选择地点</span>
    </div>
    <div v-if="map?.renderWidth" class="res-badge">{{ map.renderWidth }}×{{ map.renderHeight }}px</div>
  </div>
</template>

<style scoped>
.map-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  min-height: 200px;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  overflow: hidden;
  background: radial-gradient(ellipse at 50% 40%, #152238 0%, #0a1420 70%);
}
.map-wrap :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
.label-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.globe-label {
  position: absolute;
  transform: translate(-50%, -100%);
  font-size: 11px;
  color: #eef2f7;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  pointer-events: auto;
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.35);
}
.hint {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 10px;
  font-size: 10px;
  color: var(--nc-text-muted);
  background: rgba(0, 0, 0, 0.45);
  border-radius: 4px;
  pointer-events: none;
  z-index: 3;
}
.res-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 6px;
  font-size: 10px;
  color: var(--nc-text-muted);
  background: rgba(0, 0, 0, 0.45);
  border-radius: 4px;
  pointer-events: none;
  z-index: 3;
}
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  font-size: 12px;
  color: var(--nc-text-muted);
  z-index: 1;
}
</style>
