import axios from 'axios'

/** 将 LLM HTTP 错误转为用户可读中文，避免把 HTML 404 页塞进聊天框 */
export function formatLlmError(err: unknown, baseUrl?: string): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data
    const text =
      typeof data === 'string'
        ? data
        : data && typeof data === 'object' && 'error' in data
          ? String((data as { error?: { message?: string }; message?: string }).error?.message ??
              (data as { message?: string }).message ??
              '')
          : ''

    if (status === 404) {
      return (
        `助手 LLM 接口返回 404。Dify 工作流地址（${baseUrl ?? '当前 Base URL'}）不能用于助手对话。` +
        `请在设置 → AI → 小说助手 填写 OpenAI 兼容地址，例如 DeepSeek：https://api.deepseek.com`
      )
    }
    if (status === 401 || status === 403) {
      return '助手 API Key 无效或无权访问，请检查设置 → AI 中的助手 API Key。'
    }
    if (text && !text.includes('<!doctype', 'i') && !text.includes('<html', 'i')) {
      return status ? `${status}: ${text}` : text
    }
    if (status) {
      return `LLM 请求失败（HTTP ${status}），请检查 Base URL 与 API Key。`
    }
  }

  const raw = err instanceof Error ? err.message : String(err)
  if (raw.includes('<!doctype', 'i') || raw.includes('<html', 'i') || raw.includes('404 Not Found')) {
    return (
      '助手 LLM 请求失败（404）。请确认已填写正确的 OpenAI 兼容 Base URL（非 Dify 工作流地址），' +
      '推荐 DeepSeek：https://api.deepseek.com'
    )
  }
  if (raw.length > 400) {
    return `${raw.slice(0, 400)}…`
  }
  return raw
}
