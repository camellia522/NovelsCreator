import type { TerritorySocietyRequest, TerritorySocietyResponse } from '../../services/world-society.service'
import {
  diagnoseSocietyOutputs,
  extractSocietyOutputsFromDifyRaw,
  parseJsonLoose,
  stripThinking
} from '../../utils/world-dify-parse'
import { formatLlmError } from '../../utils/llm-error'
import { getWorkflowLlmCredentials } from '../../services/config.service'
import { invokeSocietyGraph } from './graphs/society.graph'

export async function runLocalSocietyGeneration(
  req: TerritorySocietyRequest,
  projectId: string
): Promise<TerritorySocietyResponse> {
  const creds = await getWorkflowLlmCredentials('creative')
  if (!creds.apiKey) {
    return {
      ok: false,
      error:
        '未配置内置 LLM API Key。请在 设置 → AI 填写内置 LLM Key，并将工作流引擎切换为「内置 LangGraph」。'
    }
  }

  try {
    const flat = await invokeSocietyGraph(req, projectId)
    const extracted = extractSocietyOutputsFromDifyRaw(flat)
    if (extracted) {
      const parsed = parseJsonLoose<{ nations?: unknown[]; locations?: unknown[] }>(
        extracted.society_json,
        {}
      )
      if (parsed.nations?.length || parsed.locations?.length || extracted.world_rules) {
        return {
          ok: true,
          society_json: extracted.society_json,
          nations_json: extracted.nations_json,
          locations_json: extracted.locations_json,
          world_rules: stripThinking(extracted.world_rules)
        }
      }
    }

    const keys = Object.keys(flat).join(', ') || '（空）'
    const detail = diagnoseSocietyOutputs(flat)
    const sj = String(flat.society_json ?? '').trim()
    const hint =
      sj.length > 0 && sj.length < 120
        ? '（society_json 过短且 locations 为空，多为模型未输出完整 locations）'
        : ''
    return {
      ok: false,
      error:
        `工作流未返回可解析的社会层 JSON（outputs 键：${keys}；${detail}）${hint}。` +
        '分批润色时客户端会跳过本批并继续下一批。'
    }
  } catch (err) {
    return {
      ok: false,
      error: formatLlmError(err, creds.baseUrl)
    }
  }
}
