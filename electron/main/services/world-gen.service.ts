import axios from 'axios'
import type { WorldGenConfig, WorldGenerateRawOutputs, WorldGenerateResponse } from '../../src/types/world-gen'
import { coerceJsonString, inferWorkflowStatus } from '../utils/world-dify-parse'
import { getDifyCredentials } from './config.service'
import { formatDifyHttpError } from './dify.service'

export interface WorldGenerateWorkflowInputs {
  project_id: string
  world_name: string
  era: string
  atmosphere: string
  scale: string
  climate: string
  city_count: number
  include_landmarks: string
  seed: number
  geological_years_ma: number
  creative_brief: string
}

function buildCreativeBrief(config: WorldGenConfig): string {
  return [
    `世界名：${config.worldName}`,
    `时代：${config.era}`,
    `氛围：${config.atmosphere.join('、')}`,
    `尺度：${config.scale}`,
    `气候倾向：${config.climate}`,
    `聚落数量约：${config.cityCount}`,
    config.includeLandmarks ? '需要地标' : '不需要地标',
    `随机种子：${config.seed ?? Date.now()}`,
    '要求：地理合理、陆海分布自然、气候与地形一致、河流湖泊位置合理、聚落不在水上。'
  ].join('\n')
}

export function buildWorldWorkflowInputs(
  config: WorldGenConfig,
  projectId: string
): WorldGenerateWorkflowInputs {
  return {
    project_id: projectId,
    world_name: config.worldName,
    era: config.era,
    atmosphere: config.atmosphere.join('、'),
    scale: config.scale,
    climate: config.climate,
    city_count: config.cityCount,
    include_landmarks: config.includeLandmarks ? 'true' : 'false',
    seed: config.seed ?? Date.now(),
    geological_years_ma: config.geologicalYearsMa ?? 80,
    creative_brief: buildCreativeBrief(config)
  }
}

export function normalizeWorldOutputs(raw: Record<string, unknown>): WorldGenerateRawOutputs {
  if (typeof raw.end_outputs === 'string') {
    try {
      return normalizeWorldOutputs(JSON.parse(raw.end_outputs) as Record<string, unknown>)
    } catch {
      /* fall through */
    }
  }

  const status = inferWorkflowStatus(raw)
  return {
    status,
    world_rules: coerceJsonString(raw.world_rules ?? raw.worldRules),
    map_json: coerceJsonString(raw.map_json ?? raw.mapJson),
    locations_json: coerceJsonString(raw.locations_json ?? raw.locationsJson),
    nations_json: coerceJsonString(raw.nations_json ?? raw.nationsJson),
    map_image_base64: coerceJsonString(raw.map_image_base64 ?? raw.mapImageBase64),
    map_image_url: coerceJsonString(raw.map_image_url ?? raw.mapImageUrl),
    workflow_version: coerceJsonString(raw.workflow_version ?? raw.workflowVersion) || 'world-generate-v1',
    error_message: coerceJsonString(raw.error_message ?? raw.errorMessage)
  }
}

async function fetchImageAsDataUrl(url: string): Promise<string | undefined> {
  if (!url.trim()) return undefined
  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 120_000 })
    const b64 = Buffer.from(resp.data).toString('base64')
    const mime = String(resp.headers['content-type'] ?? 'image/png')
    return `data:${mime};base64,${b64}`
  } catch {
    return undefined
  }
}

export async function resolveMapImageDataUrl(
  outputs: WorldGenerateRawOutputs
): Promise<string | undefined> {
  const b64 = outputs.map_image_base64?.trim()
  if (b64) {
    if (b64.startsWith('data:')) return b64
    return `data:image/png;base64,${b64}`
  }
  const url = outputs.map_image_url?.trim()
  if (url) return fetchImageAsDataUrl(url)
  return undefined
}

export async function runWorldGeneration(
  config: WorldGenConfig,
  projectId: string
): Promise<WorldGenerateResponse> {
  const { baseUrl, apiKey } = await getDifyCredentials('chapter')
  if (!apiKey) {
    return {
      ok: false,
      error:
        '未配置 API Key。旧版 Dify 地图工作流已下线；若仍调用此接口，请在设置 → 章节生成 中填写 Key，或改用 WorldEngine。'
    }
  }

  const inputs = buildWorldWorkflowInputs(config, projectId)
  const stringInputs: Record<string, string> = {}
  for (const [k, v] of Object.entries(inputs)) {
    stringInputs[k] = String(v)
  }

  try {
    const resp = await axios.post(
      `${baseUrl}/workflows/run`,
      {
        inputs: stringInputs,
        response_mode: 'blocking',
        user: `novelscreator-world-${config.seed ?? Date.now()}`
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 600_000
      }
    )

    const data = resp.data as { data?: { outputs?: Record<string, unknown>; id?: string } }
    const outputsRaw = data.data?.outputs ?? {}
    const outputs = normalizeWorldOutputs(outputsRaw)

    if (outputs.status !== 'success') {
      return {
        ok: false,
        error: outputs.error_message || '模型工作流返回失败',
        outputs,
        workflowRunId: data.data?.id
      }
    }

    if (!outputs.map_json || !outputs.locations_json) {
      return {
        ok: false,
        error: '模型输出缺少 map_json 或 locations_json',
        outputs,
        workflowRunId: data.data?.id
      }
    }

    return { ok: true, outputs, workflowRunId: data.data?.id }
  } catch (err) {
    return { ok: false, error: formatDifyHttpError(err) }
  }
}
