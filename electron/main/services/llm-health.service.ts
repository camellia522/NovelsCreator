import axios from 'axios'
import type { HealthCheckResponse } from '../../src/types/api'
import { DIFY_MASKED_API_KEY, getAssistantLlmCredentials } from './config.service'
import { formatLlmError } from '../utils/llm-error'

export async function testAssistantLlm(override?: {
  baseUrl?: string
  apiKey?: string
  model?: string
}): Promise<HealthCheckResponse> {
  const saved = await getAssistantLlmCredentials()
  const baseUrl = (override?.baseUrl?.trim() || saved.baseUrl).replace(/\/$/, '')
  let apiKey = override?.apiKey?.trim() ?? ''
  if (!apiKey || apiKey === DIFY_MASKED_API_KEY || apiKey.startsWith('*')) {
    apiKey = saved.apiKey
  }
  const model = override?.model?.trim() || saved.model

  if (!apiKey) {
    return { ok: false, message: '请先填写助手 API Key（与 Dify 工作流 Key 不同）' }
  }
  if (!baseUrl) {
    return { ok: false, message: '请先填写助手 API Base URL' }
  }

  try {
    await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 8
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30_000
      }
    )
    return { ok: true, message: `助手 LLM 连接成功 · ${model}` }
  } catch (err) {
    return { ok: false, message: formatLlmError(err, baseUrl) }
  }
}
