import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type {
  KnowledgeCharacter,
  KnowledgeDocument,
  KnowledgeFaction,
  KnowledgeItem,
  WorldLocation,
  WorldMapDocument,
  WorldMapLayerCacheDocument
} from '@/types/project'
import { ensureMapHexGrid, resyncHexCellCenters } from '@/utils/world-hex-grid'
import { hexClimateAlreadySynced, hexDevelopmentAlreadySynced, syncHexClimateFromTerrain, syncHexDevelopmentFromTerrain } from '@/utils/world-hex-climate'
import { normalizeProvinceSeatHierarchy } from '@/utils/world-admin-divisions'
import { scoreHexForCity, summarizeTerritories, syncHexNationFromRegions } from '@/utils/world-territory-society'
import type { WorldGenResult } from '@/types/world-gen'
import {
  applyWizardEnvironmentToWorld,
  normalizeWorldSceneFields,
  refreshWorldSettingConstraints,
  syncKnowledgeWorldAndMap,
  applyWorldGenMetaToKnowledge,
  type WizardCharacterPatch,
  type WizardEnvironmentPatch
} from '@/utils/chapter-wizard-knowledge'
import { stampMapGenerationMeta } from '@/utils/world-settings-map-bridge'
import { auditLocationCoords, reconcileAllLocations } from '@/utils/world-location-coords'
import { scheduleProjectPersist } from '@/utils/project-persist'
import { cloneForIpc } from '@/utils/ipc-serialize'
import { resolveMapDataUrlForSave } from '@/utils/world-map-display-url'

const EMPTY_DOC: KnowledgeDocument = {
  world: { title: '新世界', rules: '', era: '', scene: '', scenePlace: '', atmosphere: '' },
  map: null,
  locations: [],
  characters: [],
  factions: [],
  items: []
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  const doc = ref<KnowledgeDocument | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const dirty = ref(false)
  const error = ref('')
  const selectedCharacterId = ref<string | null>(null)
  const mapImageDataUrl = ref<string | null>(null)
  /** 项目 knowledge/map.png 绝对路径，供 IPC 读取缓存贴图 */
  const mapImageFilePath = ref<string | null>(null)
  /** 待写入 map.json 的图层缓存（保存时覆写 layerCache） */
  const pendingMapLayerCache = ref<WorldMapLayerCacheDocument | null>(null)

  async function loadMapRasterFromProject(): Promise<void> {
    mapImageDataUrl.value = null
    mapImageFilePath.value = null
    if (!window.novelsCreator || !doc.value?.map) return

    const mapPath = await window.novelsCreator.project.getMapImagePath()
    if (mapPath) {
      mapImageFilePath.value = mapPath
      doc.value.map.hasRasterImage = true
      const dataUrl = await window.novelsCreator.project.getMapImage()
      if (dataUrl?.startsWith('data:image/')) {
        mapImageDataUrl.value = dataUrl
      }
      return
    }

    if (doc.value.map.hasRasterImage) {
      const dataUrl = await window.novelsCreator.project.getMapImage()
      if (dataUrl?.startsWith('data:image/')) {
        mapImageDataUrl.value = dataUrl
      }
    }
  }

  /** 打开地图编辑前确保贴图路径已解析（不整库重载） */
  async function ensureMapImageLoaded(): Promise<void> {
    ensureDoc()
    if (!doc.value?.map || !window.novelsCreator) return
    prepareMapForEditor(doc.value.map)
    const mapPath = await window.novelsCreator.project.getMapImagePath()
    if (mapPath) {
      mapImageFilePath.value = mapPath
      doc.value.map.hasRasterImage = true
      if (!mapImageDataUrl.value?.startsWith('data:image/')) {
        const dataUrl = await window.novelsCreator.project.getMapImage()
        if (dataUrl?.startsWith('data:image/')) mapImageDataUrl.value = dataUrl
      }
      return
    }
    if (!mapImageFilePath.value && !mapImageDataUrl.value) {
      await loadMapRasterFromProject()
    }
  }

  function ensureDoc(): void {
    if (!doc.value) {
      doc.value = cloneForIpc(EMPTY_DOC)
    }
    if (!Array.isArray(doc.value.characters)) doc.value.characters = []
    if (!Array.isArray(doc.value.factions)) doc.value.factions = []
    if (!Array.isArray(doc.value.items)) doc.value.items = []
    if (!Array.isArray(doc.value.locations)) doc.value.locations = []
    if (doc.value.map === undefined) doc.value.map = null
  }

  function nextCharacterId(): string {
    ensureDoc()
    let max = 0
    for (const c of doc.value!.characters) {
      const m = /^char-(\d+)$/.exec(c.id)
      if (m) max = Math.max(max, Number.parseInt(m[1], 10))
    }
    return `char-${String(max + 1).padStart(3, '0')}`
  }

  function selectCharacter(id: string | null): void {
    selectedCharacterId.value = id
  }

  async function load(): Promise<void> {
    if (!window.novelsCreator) return
    loading.value = true
    error.value = ''
    try {
      doc.value = await window.novelsCreator.project.getKnowledge()
      ensureDoc()
      if (doc.value.world && normalizeWorldSceneFields(doc.value.world)) {
        dirty.value = true
      }
      if (doc.value) {
        if (syncKnowledgeWorldAndMap(doc.value)) dirty.value = true
        if (doc.value.world) refreshWorldSettingConstraints(doc.value.world, doc.value.map)
      }
      if (doc.value.map) prepareMapForEditor(doc.value.map)
      dirty.value = false
      pendingMapLayerCache.value = null
      await loadMapRasterFromProject()
      if (doc.value.characters.length && !selectedCharacterId.value) {
        selectedCharacterId.value = doc.value.characters[0].id
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      ensureDoc()
    } finally {
      loading.value = false
    }
  }

  /** 仅在内存无数据时从磁盘加载，避免覆盖未保存编辑 */
  async function loadIfEmpty(): Promise<void> {
    if (doc.value && (dirty.value || doc.value.characters.length > 0)) return
    await load()
  }

  async function buildSavePayload(): Promise<KnowledgeDocument> {
    if (doc.value?.world) {
      refreshWorldSettingConstraints(doc.value.world, doc.value.map)
      if (doc.value.map) syncKnowledgeWorldAndMap(doc.value)
    }
    const raw = toRaw(doc.value!)
    const layerCache = pendingMapLayerCache.value ?? raw.map?.layerCache
    const snapshot = {
      ...raw,
      map: raw.map
        ? {
            ...toRaw(raw.map),
            ...(layerCache ? { layerCache: toRaw(layerCache) } : {})
          }
        : raw.map
    }
    const payload = cloneForIpc(snapshot) as KnowledgeDocument
    const existingMapPath = window.novelsCreator
      ? await window.novelsCreator.project.getMapImagePath()
      : null
    if (!existingMapPath) {
      let raster = await resolveMapDataUrlForSave(
        mapImageDataUrl.value,
        mapImageFilePath.value
      )
      if (!raster && payload.map?.hasRasterImage && window.novelsCreator) {
        raster = await window.novelsCreator.project.getMapImage()
      }
      if (raster) {
        payload.mapImageBase64 = raster
        if (payload.map) payload.map.hasRasterImage = true
      }
    }
    return payload
  }

  /** 落盘后把贴图引用切到项目内 knowledge/map.png，避免仍指向临时缓存路径 */
  async function syncMapRasterAfterSave(wroteRaster: boolean): Promise<void> {
    if (!window.novelsCreator || !doc.value?.map) return
    const mapPath = await window.novelsCreator.project.getMapImagePath()
    if (mapPath) {
      mapImageFilePath.value = mapPath
      doc.value.map.hasRasterImage = true
      if (wroteRaster && !mapImageDataUrl.value?.startsWith('data:image/')) {
        const dataUrl = await window.novelsCreator.project.getMapImage()
        if (dataUrl?.startsWith('data:image/')) mapImageDataUrl.value = dataUrl
      }
    }
  }

  function layerCacheSignature(cache: WorldMapLayerCacheDocument | null | undefined): string {
    return cache ? JSON.stringify(cache) : ''
  }

  async function save(): Promise<void> {
    if (!doc.value || !window.novelsCreator) return
    saving.value = true
    error.value = ''
    try {
      const payload = await buildSavePayload()
      const wroteRaster = Boolean(payload.mapImageBase64)
      if (payload.map?.hasRasterImage && !wroteRaster) {
        const mapPath = await window.novelsCreator.project.getMapImagePath()
        if (!mapPath) {
          throw new Error('无法读取地图贴图，请重新生成世界或打开地图编辑后再保存')
        }
      }
      // 勿用 IPC 回传的 doc 覆盖本地引用，否则地图编辑器会误判网格变更并反复预热/保存
      await window.novelsCreator.project.saveKnowledge(payload)
      ensureDoc()
      await syncMapRasterAfterSave(wroteRaster)
      dirty.value = false
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      saving.value = false
    }
  }

  async function saveIfDirty(): Promise<void> {
    if (dirty.value) await save()
  }

  function markDirty(): void {
    dirty.value = true
    scheduleProjectPersist()
  }

  function setMapLayerCache(cache: WorldMapLayerCacheDocument): void {
    const plain = cloneForIpc(cache)
    const prev = pendingMapLayerCache.value ?? doc.value?.map?.layerCache
    if (layerCacheSignature(plain) === layerCacheSignature(prev)) return
    pendingMapLayerCache.value = plain
    if (doc.value?.map) {
      doc.value.map.layerCache = plain
    }
    markDirty()
  }

  function getCharacter(id: string): KnowledgeCharacter | undefined {
    return doc.value?.characters.find((c) => c.id === id)
  }

  function getLocation(id: string | undefined): WorldLocation | undefined {
    if (!id || !doc.value) return undefined
    return doc.value.locations.find((l) => l.id === id)
  }

  function prepareMapForEditor(map: WorldMapDocument): void {
    ensureMapHexGrid(map)
    if (resyncHexCellCenters(map) > 0) markDirty()
    if (syncHexNationFromRegions(map)) markDirty()
    if (!hexClimateAlreadySynced(map)) syncHexClimateFromTerrain(map)
    else if (!hexDevelopmentAlreadySynced(map)) syncHexDevelopmentFromTerrain(map)
    if (map.nations) {
      map.nations.forEach((n, i) => {
        if (!n.color) n.color = `hsl(${(i * 47) % 360} 55% 50% / 0.45)`
      })
    }
    if (doc.value?.locations.length && map.nations?.length) {
      const changed = normalizeProvinceSeatHierarchy(
        doc.value.locations,
        map,
        scoreHexForCity,
        summarizeTerritories(map, map.nations)
      )
      if (changed) markDirty()
    }
    if (doc.value?.locations.length) {
      const audit = auditLocationCoords(map, doc.value.locations)
      if (audit.looksLikeUnitScale || audit.looksLikePixelScale) {
        const { locations, changed } = reconcileAllLocations(map, doc.value.locations)
        if (changed) {
          doc.value.locations = locations
          markDirty()
        }
      }
    }
  }

  function applyGeneratedWorld(
    result: WorldGenResult,
    meta?: {
      era?: string
      atmosphere?: string[]
      scene?: string
      scenePlace?: string
      scale?: import('@/types/world-gen').WorldScale
      climate?: import('@/types/world-gen').WorldClimateMode
      placeNamingStyle?: import('@/types/world-gen').PlaceNamingStyle
      seed?: number
    }
  ): void {
    ensureDoc()
    doc.value!.world.title = result.map.name
    doc.value!.world.rules = result.worldRules
    doc.value!.world.mapSeed = result.map.seed
    stampMapGenerationMeta(result.map, {
      scale: meta?.scale ?? result.map.scale ?? 'continent',
      climate: meta?.climate ?? result.map.climate ?? 'mixed',
      placeNamingStyle: meta?.placeNamingStyle ?? result.map.placeNamingStyle
    })
    applyWorldGenMetaToKnowledge(doc.value!.world, {
      worldName: result.map.name,
      era: meta?.era ?? doc.value!.world.era ?? '架空',
      scene: meta?.scene ?? doc.value!.world.scene ?? '大陆',
      scenePlace: meta?.scenePlace ?? doc.value!.world.scenePlace ?? '',
      atmosphere: meta?.atmosphere ?? [],
      scale: meta?.scale ?? result.map.scale ?? 'continent',
      climate: meta?.climate ?? result.map.climate ?? 'mixed',
      placeNamingStyle: meta?.placeNamingStyle ?? result.map.placeNamingStyle,
      seed: meta?.seed ?? result.map.seed
    })
    normalizeWorldSceneFields(doc.value!.world)
    refreshWorldSettingConstraints(doc.value!.world, result.map)
    prepareMapForEditor(result.map)
    doc.value!.map = result.map
    doc.value!.locations = result.locations
    pendingMapLayerCache.value = null
    mapImageDataUrl.value = result.mapImageDataUrl ?? null
    mapImageFilePath.value = result.mapImageFilePath ?? null
    markDirty()
  }

  async function addCharacter(): Promise<void> {
    ensureDoc()
    const n = doc.value!.characters.length + 1
    const id = nextCharacterId()
    doc.value!.characters.push({
      id,
      name: `角色${n}`,
      role: '',
      traits: [],
      appearance: '',
      personality: '',
      notes: ''
    })
    selectedCharacterId.value = id
    markDirty()
  }

  async function removeCharacter(id: string): Promise<void> {
    if (!doc.value) return
    doc.value.characters = doc.value.characters.filter((c) => c.id !== id)
    if (selectedCharacterId.value === id) {
      selectedCharacterId.value = doc.value.characters[0]?.id ?? null
    }
    markDirty()
  }

  function addFaction(): void {
    if (!doc.value) return
    const n = doc.value.factions.length + 1
    doc.value.factions.push({
      id: `faction-${String(n).padStart(3, '0')}`,
      name: `势力${n}`,
      description: '',
      goals: ''
    })
    markDirty()
  }

  function removeFaction(index: number): void {
    doc.value?.factions.splice(index, 1)
    markDirty()
  }

  function addItem(): void {
    if (!doc.value) return
    const n = doc.value.items.length + 1
    doc.value.items.push({
      id: `item-${String(n).padStart(3, '0')}`,
      name: `道具${n}`,
      description: ''
    })
    markDirty()
  }

  function removeItem(index: number): void {
    doc.value?.items.splice(index, 1)
    markDirty()
  }

  function applyWizardPatch(options: {
    environment: WizardEnvironmentPatch
    characters?: WizardCharacterPatch[]
    syncCharacters?: boolean
  }): void {
    ensureDoc()
    applyWizardEnvironmentToWorld(doc.value!.world, options.environment, doc.value!.map)
    if (options.syncCharacters && options.characters?.length) {
      for (const patch of options.characters) {
        const target = doc.value!.characters.find((c) => c.id === patch.id)
        if (!target) continue
        target.personality = patch.personality
        target.appearance = patch.appearanceDesc
        if (patch.appearanceTags.length) target.traits = [...patch.appearanceTags]
      }
    }
    markDirty()
  }

  return {
    doc,
    loading,
    saving,
    dirty,
    error,
    selectedCharacterId,
    mapImageDataUrl,
    mapImageFilePath,
    load,
    loadIfEmpty,
    ensureMapImageLoaded,
    save,
    saveIfDirty,
    markDirty,
    setMapLayerCache,
    selectCharacter,
    getCharacter,
    getLocation,
    applyGeneratedWorld,
    applyWizardPatch,
    addCharacter,
    removeCharacter,
    addFaction,
    removeFaction,
    addItem,
    removeItem
  }
})
