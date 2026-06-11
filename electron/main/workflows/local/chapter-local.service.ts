import type { ChapterGenerateInputs, GenerateChapterResponse } from '../../../src/types/api'
import { normalizeOutputs } from '../../services/dify.service'
import { deriveRetryIssuesJson } from '../../services/dify-inputs'
import { formatLlmError } from '../../utils/llm-error'
import { getWorkflowLlmCredentials } from '../../services/config.service'
import { invokeChapterGraph } from './graphs/chapter.graph'

/** 本地章节生成 + 客户端 retry（方案 B，与 Dify 版一致） */
export async function runLocalChapterGenerationWithRetry(
  baseInputs: ChapterGenerateInputs
): Promise<GenerateChapterResponse> {
  const creds = await getWorkflowLlmCredentials('creative')
  if (!creds.apiKey) {
    return {
      ok: false,
      error:
        '未配置内置 LLM API Key。请在 设置 → AI 填写内置 LLM Key，并将工作流引擎切换为「内置 LangGraph」。'
    }
  }

  let retryCount = baseInputs.retry_count ?? 0
  let retryIssuesFormatted = baseInputs.retry_issues_formatted ?? ''
  let retryIssuesJson = baseInputs.retry_issues ?? '[]'

  for (let attempt = 0; attempt < 32; attempt++) {
    const inputs: ChapterGenerateInputs = {
      ...baseInputs,
      retry_count: retryCount,
      retry_issues_formatted: retryIssuesFormatted,
      retry_issues: retryIssuesJson
    }

    try {
      const flat = await invokeChapterGraph(inputs)
      const outputs = normalizeOutputs(flat)

      if (outputs.status === 'retry') {
        retryCount = outputs.retry_count
        retryIssuesFormatted = outputs.retry_issues_formatted ?? ''
        retryIssuesJson =
          outputs.retry_issues?.trim() ||
          deriveRetryIssuesJson(undefined, retryIssuesFormatted)
        continue
      }

      return { ok: true, outputs }
    } catch (err) {
      return {
        ok: false,
        error: formatLlmError(err, creds.baseUrl)
      }
    }
  }

  return { ok: false, error: '客户端重试次数过多，请检查 max_retry 配置' }
}
