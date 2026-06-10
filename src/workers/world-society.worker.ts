/**
 * 社会层本地选址 + territory brief 在 Worker 线程执行，避免阻塞渲染进程 UI。
 */
import {
  buildTerritoryBriefJson,
  generateLocalSociety,
  type SocietyGenerationResult
} from '@/utils/world-territory-society'
import type { WorldGenConfig, WorldGenResult } from '@/types/world-gen'
import type { WorldMapDocument } from '@/types/project'

export interface SocietyWorkerRequest {
  preview: {
    worldRules: string
    map: WorldMapDocument
    locations: WorldGenResult['locations']
    nations: WorldGenResult['nations']
  }
  config: WorldGenConfig
}

export interface SocietyWorkerResponse {
  local: SocietyGenerationResult
  territoryBriefJson: string
  map: WorldMapDocument
}

self.onmessage = (ev: MessageEvent<SocietyWorkerRequest>) => {
  try {
    const { preview, config } = ev.data
    const fullPreview: WorldGenResult = {
      worldRules: preview.worldRules ?? '',
      map: preview.map,
      locations: preview.locations ?? [],
      nations: preview.nations ?? [],
      source: 'procedural'
    }
    const local = generateLocalSociety(fullPreview, config)
    const nations = fullPreview.map.nations ?? []
    const territoryBriefJson = buildTerritoryBriefJson(fullPreview.map, nations, config, {
      localDraft: local
    })
    const response: SocietyWorkerResponse = {
      local,
      territoryBriefJson,
      map: fullPreview.map
    }
    self.postMessage(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    self.postMessage({ error: message })
  }
}
