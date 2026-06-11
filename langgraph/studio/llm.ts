import { ChatOpenAI } from '@langchain/openai'

export type LlmRole = 'creative' | 'reasoning'

export interface StudioLlmCreds {
  baseUrl: string
  apiKey: string
  creativeModel: string
  reasoningModel: string
}

export function loadStudioLlmCreds(): StudioLlmCreds {
  const apiKey = process.env.LOCAL_LLM_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'Studio 需要 LOCAL_LLM_API_KEY。请复制 .env.studio.example 为 .env 并填写 API Key。'
    )
  }
  const baseUrl = (process.env.LOCAL_LLM_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
  const creativeModel = process.env.LOCAL_LLM_MODEL?.trim() || 'deepseek-chat'
  const reasoningModel =
    process.env.LOCAL_LLM_REASONING_MODEL?.trim() || creativeModel
  return { baseUrl, apiKey, creativeModel, reasoningModel }
}

export function createStudioChatModel(role: LlmRole, creds = loadStudioLlmCreds()): ChatOpenAI {
  return new ChatOpenAI({
    model: role === 'reasoning' ? creds.reasoningModel : creds.creativeModel,
    apiKey: creds.apiKey,
    temperature: role === 'reasoning' ? 0.2 : 0.55,
    configuration: { baseURL: creds.baseUrl }
  })
}

export async function invokeLlmText(model: ChatOpenAI, system: string, user: string): Promise<string> {
  const res = await model.invoke([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ])
  return typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
}
