import type { GenerateOutlineResponse, OutlineGenerateInputs } from '../../../src/types/api'
import { normalizeOutlineOutputs } from '../../services/dify.service'
import { formatOutlineValidationIssues } from '@/utils/outline-validation-report'
import { formatLlmError } from '../../utils/llm-error'
import { getWorkflowLlmCredentials } from '../../services/config.service'
import { invokeOutlineGraph } from './graphs/outline.graph'

/** 本地大纲生成 + 客户端 retry（方案 B，与 Dify 版一致） */
export async function runLocalOutlineGenerationWithRetry(
  baseInputs: OutlineGenerateInputs
): Promise<GenerateOutlineResponse> {
  const creds = await getWorkflowLlmCredentials('creative')
  if (!creds.apiKey) {
    return {
      ok: false,
      error:
        '未配置内置 LLM API Key。请在 设置 → AI 填写助手/内置 LLM Key，并将工作流引擎切换为「内置 LangGraph」。'
    }
  }

  let retryCount = baseInputs.retry_count ?? 0
  let retryIssuesFormatted = baseInputs.retry_issues_formatted ?? ''
  let clientRetryRounds = 0

  for (let attempt = 0; attempt < 32; attempt++) {
    const inputs: OutlineGenerateInputs = {
      ...baseInputs,
      retry_count: retryCount,
      retry_issues_formatted: retryIssuesFormatted
    }

    try {
      const flat = await invokeOutlineGraph(inputs)
      const outputs = normalizeOutlineOutputs(flat)

      if (outputs.status === 'retry') {
        clientRetryRounds += 1
        retryCount = outputs.retry_count
        retryIssuesFormatted =
          outputs.retry_issues_formatted?.trim() ||
          formatOutlineValidationIssues(outputs.validation_report)
        continue
      }

      return {
        ok: true,
        outputs,
        clientRetryRounds
      }
    } catch (err) {
      return {
        ok: false,
        error: formatLlmError(err, creds.baseUrl)
      }
    }
  }

  return { ok: false, error: '客户端重试次数过多，请检查 max_retry 配置' }
}
