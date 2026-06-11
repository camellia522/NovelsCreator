import { ChatOpenAI } from '@langchain/openai'
import { getWorkflowLlmCredentials } from '../../../services/config.service'

export type LlmRole = 'creative' | 'reasoning'

export async function createWorkflowChatModel(role: LlmRole): Promise<ChatOpenAI> {
  const creds = await getWorkflowLlmCredentials(role)
  if (!creds.apiKey) {
    throw new Error(
      '未配置内置工作流 LLM API Key。请在 设置 → AI → 内置 LLM 填写 API Key（OpenAI 兼容，与 Dify 工作流 Key 不同）。'
    )
  }
  return new ChatOpenAI({
    model: creds.model,
    apiKey: creds.apiKey,
    temperature: role === 'reasoning' ? 0.2 : 0.55,
    configuration: { baseURL: creds.baseUrl }
  })
}

export async function invokeLlmJson(
  model: ChatOpenAI,
  system: string,
  user: string
): Promise<{ text: string; structured?: Record<string, unknown> }> {
  const res = await model.invoke([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ])
  const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
  return { text: content }
}
