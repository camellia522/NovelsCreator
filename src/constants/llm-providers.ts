/** OpenAI 兼容 API 服务商与模型目录（设置页下拉） */

export const LLM_PROVIDER_CUSTOM_ID = 'custom'
export const LLM_MODEL_CUSTOM_ID = '__custom__'

export type LlmModelRole = 'creative' | 'reasoning' | 'general'

export interface LlmModelDef {
  id: string
  name: string
  roles: LlmModelRole[]
}

export interface LlmProviderDef {
  id: string
  name: string
  baseUrl: string
  models: LlmModelDef[]
}

export const LLM_PROVIDERS: LlmProviderDef[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat（创作）', roles: ['creative', 'general'] },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner（推理）', roles: ['reasoning', 'general'] }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4.1', name: 'GPT-4.1', roles: ['creative', 'reasoning', 'general'] },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', roles: ['creative', 'reasoning', 'general'] },
      { id: 'gpt-4o', name: 'GPT-4o', roles: ['creative', 'reasoning', 'general'] },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', roles: ['creative', 'general'] },
      { id: 'o3-mini', name: 'o3-mini（推理）', roles: ['reasoning', 'general'] },
      { id: 'o1', name: 'o1（推理）', roles: ['reasoning'] }
    ]
  },
  {
    id: 'dashscope',
    name: '阿里通义千问（DashScope）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-max', name: 'Qwen Max', roles: ['creative', 'reasoning', 'general'] },
      { id: 'qwen-plus', name: 'Qwen Plus', roles: ['creative', 'general'] },
      { id: 'qwen-turbo', name: 'Qwen Turbo', roles: ['creative', 'general'] },
      { id: 'qwen-long', name: 'Qwen Long（长文）', roles: ['creative', 'general'] },
      { id: 'qwq-plus', name: 'QwQ Plus（推理）', roles: ['reasoning', 'general'] }
    ]
  },
  {
    id: 'zhipu',
    name: '智谱 AI（GLM）',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus', roles: ['creative', 'reasoning', 'general'] },
      { id: 'glm-4-air', name: 'GLM-4 Air', roles: ['creative', 'general'] },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', roles: ['creative', 'general'] },
      { id: 'glm-z1-air', name: 'GLM-Z1 Air（推理）', roles: ['reasoning', 'general'] }
    ]
  },
  {
    id: 'moonshot',
    name: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'kimi-latest', name: 'Kimi Latest', roles: ['creative', 'reasoning', 'general'] },
      { id: 'moonshot-v1-128k', name: 'Moonshot 128K', roles: ['creative', 'general'] },
      { id: 'moonshot-v1-32k', name: 'Moonshot 32K', roles: ['creative', 'general'] },
      { id: 'moonshot-v1-8k', name: 'Moonshot 8K', roles: ['creative', 'general'] }
    ]
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    models: [
      { id: 'abab6.5s-chat', name: 'abab6.5s Chat', roles: ['creative', 'general'] },
      { id: 'abab6.5g-chat', name: 'abab6.5g Chat', roles: ['creative', 'general'] },
      { id: 'abab6.5t-chat', name: 'abab6.5t Chat（推理）', roles: ['reasoning', 'general'] }
    ]
  },
  {
    id: 'lingyiwanwu',
    name: '零一万物（Yi）',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    models: [
      { id: 'yi-large', name: 'Yi Large', roles: ['creative', 'reasoning', 'general'] },
      { id: 'yi-medium', name: 'Yi Medium', roles: ['creative', 'general'] },
      { id: 'yi-spark', name: 'Yi Spark', roles: ['creative', 'general'] }
    ]
  },
  {
    id: 'baichuan',
    name: '百川智能',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    models: [
      { id: 'Baichuan4', name: 'Baichuan4', roles: ['creative', 'reasoning', 'general'] },
      { id: 'Baichuan3-Turbo', name: 'Baichuan3 Turbo', roles: ['creative', 'general'] }
    ]
  },
  {
    id: 'stepfun',
    name: '阶跃星辰（Step）',
    baseUrl: 'https://api.stepfun.com/v1',
    models: [
      { id: 'step-2-16k', name: 'Step-2 16K', roles: ['creative', 'reasoning', 'general'] },
      { id: 'step-1-8k', name: 'Step-1 8K', roles: ['creative', 'general'] }
    ]
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow（硅基流动）',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', roles: ['creative', 'general'] },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1（推理）', roles: ['reasoning', 'general'] },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5 72B', roles: ['creative', 'general'] },
      { id: 'Pro/deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3 Pro', roles: ['creative', 'general'] }
    ]
  },
  {
    id: 'openrouter',
    name: 'OpenRouter（多模型聚合）',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o', roles: ['creative', 'reasoning', 'general'] },
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', roles: ['creative', 'reasoning', 'general'] },
      { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', roles: ['creative', 'reasoning', 'general'] },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', roles: ['creative', 'general'] },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1（推理）', roles: ['reasoning', 'general'] },
      { id: 'qwen/qwen-max', name: 'Qwen Max', roles: ['creative', 'general'] }
    ]
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', roles: ['creative', 'general'] },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', roles: ['creative', 'general'] },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B（推理）', roles: ['reasoning', 'general'] }
    ]
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', roles: ['creative', 'general'] },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1（推理）', roles: ['reasoning', 'general'] }
    ]
  },
  {
    id: 'volcengine',
    name: '火山引擎（豆包 Ark）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { id: 'doubao-pro-32k', name: '豆包 Pro 32K', roles: ['creative', 'general'] },
      { id: 'doubao-lite-32k', name: '豆包 Lite 32K', roles: ['creative', 'general'] },
      { id: 'deepseek-r1', name: 'DeepSeek R1（推理）', roles: ['reasoning', 'general'] }
    ]
  },
  {
    id: 'tencent',
    name: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    models: [
      { id: 'hunyuan-pro', name: '混元 Pro', roles: ['creative', 'reasoning', 'general'] },
      { id: 'hunyuan-standard', name: '混元 Standard', roles: ['creative', 'general'] },
      { id: 'hunyuan-turbo', name: '混元 Turbo', roles: ['creative', 'general'] }
    ]
  },
  {
    id: 'custom',
    name: '自定义（其他 OpenAI 兼容）',
    baseUrl: '',
    models: []
  }
]

function normUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase()
}

export function getProviderById(id: string): LlmProviderDef {
  return LLM_PROVIDERS.find((p) => p.id === id) ?? LLM_PROVIDERS.find((p) => p.id === LLM_PROVIDER_CUSTOM_ID)!
}

export function matchProviderIdByBaseUrl(baseUrl: string): string {
  const n = normUrl(baseUrl)
  if (!n) return LLM_PROVIDER_CUSTOM_ID
  for (const p of LLM_PROVIDERS) {
    if (p.id === LLM_PROVIDER_CUSTOM_ID) continue
    if (normUrl(p.baseUrl) === n) return p.id
  }
  return LLM_PROVIDER_CUSTOM_ID
}

export function modelOptionsForProvider(
  providerId: string,
  role?: 'creative' | 'reasoning'
): LlmModelDef[] {
  const provider = getProviderById(providerId)
  if (provider.id === LLM_PROVIDER_CUSTOM_ID) return []
  const models = provider.models
  if (!role) return models
  const filtered = models.filter((m) => m.roles.includes(role) || m.roles.includes('general'))
  return filtered.length ? filtered : models
}

export function matchModelSelectId(providerId: string, modelId: string): string {
  const provider = getProviderById(providerId)
  if (provider.id === LLM_PROVIDER_CUSTOM_ID) return LLM_MODEL_CUSTOM_ID
  return provider.models.some((m) => m.id === modelId) ? modelId : LLM_MODEL_CUSTOM_ID
}

export function defaultCreativeModelId(providerId: string): string {
  const opts = modelOptionsForProvider(providerId, 'creative')
  return opts[0]?.id ?? ''
}

export function defaultReasoningModelId(providerId: string): string {
  const opts = modelOptionsForProvider(providerId, 'reasoning')
  const reasoning = opts.find((m) => m.roles.includes('reasoning'))
  return reasoning?.id ?? opts[0]?.id ?? defaultCreativeModelId(providerId)
}

export function resolveLlmSelection(input: {
  providerId: string
  customBaseUrl: string
  creativeSelectId: string
  customCreativeModel: string
  reasoningSelectId: string
  customReasoningModel: string
}): { baseUrl: string; model: string; reasoningModel: string } {
  const provider = getProviderById(input.providerId)
  const baseUrl =
    provider.id === LLM_PROVIDER_CUSTOM_ID
      ? input.customBaseUrl.trim()
      : provider.baseUrl

  const model =
    input.creativeSelectId === LLM_MODEL_CUSTOM_ID
      ? input.customCreativeModel.trim()
      : input.creativeSelectId

  const reasoningModel =
    input.reasoningSelectId === LLM_MODEL_CUSTOM_ID
      ? input.customReasoningModel.trim()
      : input.reasoningSelectId

  return { baseUrl, model, reasoningModel }
}

export function loadLlmSelectionFromConfig(config: {
  baseUrl: string
  model: string
  reasoningModel: string
}): {
  providerId: string
  customBaseUrl: string
  creativeSelectId: string
  customCreativeModel: string
  reasoningSelectId: string
  customReasoningModel: string
} {
  const providerId = matchProviderIdByBaseUrl(config.baseUrl)
  const creativeSelectId = matchModelSelectId(providerId, config.model)
  const reasoningSelectId = matchModelSelectId(providerId, config.reasoningModel)
  return {
    providerId,
    customBaseUrl: providerId === LLM_PROVIDER_CUSTOM_ID ? config.baseUrl : '',
    creativeSelectId,
    customCreativeModel: creativeSelectId === LLM_MODEL_CUSTOM_ID ? config.model : '',
    reasoningSelectId,
    customReasoningModel: reasoningSelectId === LLM_MODEL_CUSTOM_ID ? config.reasoningModel : ''
  }
}

export function onProviderChanged(providerId: string): {
  customBaseUrl: string
  creativeSelectId: string
  customCreativeModel: string
  reasoningSelectId: string
  customReasoningModel: string
} {
  const creative = defaultCreativeModelId(providerId)
  const reasoning = defaultReasoningModelId(providerId)
  return {
    customBaseUrl: '',
    creativeSelectId: creative || LLM_MODEL_CUSTOM_ID,
    customCreativeModel: '',
    reasoningSelectId: reasoning || LLM_MODEL_CUSTOM_ID,
    customReasoningModel: ''
  }
}
