import axios from 'axios'

import type { WorldGenConfig } from '../../src/types/world-gen'

import type { WorldNation } from '../../src/types/project'

import {
  diagnoseSocietyOutputs,
  extractSocietyOutputsFromDifyRaw,
  parseJsonLoose,
  stripThinking
} from '../utils/world-dify-parse'

import { getDifyCredentials } from './config.service'
import { buildSocietyWorkflowInputs } from './society-workflow-inputs'
import { formatDifyHttpError } from './dify.service'



export interface TerritorySocietyRequest {

  config: WorldGenConfig

  nations: WorldNation[]

  territoryBriefJson: string

}



export interface TerritorySocietyResponse {

  ok: boolean

  error?: string

  workflowRunId?: string

  society_json?: string

  nations_json?: string

  locations_json?: string

  world_rules?: string

}



export async function runTerritorySocietyLlm(

  req: TerritorySocietyRequest,

  projectId: string

): Promise<TerritorySocietyResponse> {

  const { baseUrl, apiKey } = await getDifyCredentials('society')

  if (!apiKey) {

    return { ok: false, error: '未配置世界观社会层 API Key，请在设置 → Dify → 世界观社会层 中填写' }

  }



  const inputs = buildSocietyWorkflowInputs(req, projectId)



  try {

    const resp = await axios.post(

      `${baseUrl}/workflows/run`,

      {

        inputs,

        response_mode: 'blocking',

        user: `novelscreator-society-${req.config.seed ?? Date.now()}`

      },

      {

        headers: {

          Authorization: `Bearer ${apiKey}`,

          'Content-Type': 'application/json'

        },

        timeout: 300_000

      }

    )



    const data = resp.data as { data?: { outputs?: Record<string, unknown>; id?: string } }

    const raw = data.data?.outputs ?? {}

    const extracted = extractSocietyOutputsFromDifyRaw(raw)
    if (extracted) {
      const parsed = parseJsonLoose<{ nations?: unknown[]; locations?: unknown[] }>(
        extracted.society_json,
        {}
      )
      if (parsed.nations?.length || parsed.locations?.length || extracted.world_rules) {
        return {
          ok: true,
          workflowRunId: data.data?.id,
          society_json: extracted.society_json,
          nations_json: extracted.nations_json,
          locations_json: extracted.locations_json,
          world_rules: stripThinking(extracted.world_rules)
        }
      }
    }

    const keys = Object.keys(raw).join(', ') || '（空）'
    const detail = diagnoseSocietyOutputs(raw)
    const sj = String(raw.society_json ?? raw.society_jsonString ?? '').trim()
    const hint =
      sj.length > 0 && sj.length < 120
        ? '（society_json 过短且 locations 为空，多为 END 未接 PARSE 或仍用占位符）'
        : ''
    return {
      ok: false,
      error:
        `工作流未返回可解析的社会层 JSON（outputs 键：${keys}；${detail}）${hint}。` +
        '分批润色时客户端会跳过本批并继续下一批。请确认：① W2S 结构化输出含 nations/locations；' +
        '② END_OK→PARSE→END，END 绑定 PARSE 的 society_json/locations_json；③ 本批 locations 条数=local_location_count。' +
        '参考 dify/world/DIFY-END-NODE-CHECKLIST.md。',
      workflowRunId: data.data?.id
    }

  } catch (err) {

    return { ok: false, error: formatDifyHttpError(err) }

  }

}


