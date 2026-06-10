/** 将 Dify / 模型供应商原始报错转为用户可读说明 */
export function humanizeDifyError(raw: string | undefined): string {
  if (!raw?.trim()) return '未知错误'
  const text = raw.trim()

  if (/Insufficient Balance|402.*balance|余额不足/i.test(text)) {
    return (
      '模型 API 余额不足（HTTP 402 · Insufficient Balance）。' +
      '请在 Dify「设置 → 模型供应商」中为当前章节工作流使用的模型充值或更换 API Key，然后重试。'
    )
  }

  if (/401|Unauthorized|invalid api key|未授权/i.test(text)) {
    return '模型 API Key 无效或未授权（401）。请检查 Dify 模型供应商与章节工作流所用模型的密钥。'
  }

  if (/429|rate limit|too many requests/i.test(text)) {
    return '模型 API 请求过于频繁（429）。请稍后再试或降低 Dify 工作流并发。'
  }

  if (/timeout|ECONNABORTED|超时/i.test(text)) {
    return '章节生成超时：Dify 在限定时间内未返回。请确认 Dify 服务正常、工作流未卡住，或模型响应是否过慢。'
  }

  if (/ECONNREFUSED|无法连接|ENOTFOUND/i.test(text)) {
    return '无法连接 Dify 服务。请确认 Dify 已启动，且 NovelsCreator 设置中的 Base URL 正确（通常为 …/v1）。'
  }

  if (/未配置章节工作流 API Key/i.test(text)) {
    return text
  }

  if (/Plugin Daemon|plugin.daemon|plugin_daemon/i.test(text)) {
    return (
      'Dify 插件守护进程（Plugin Daemon）异常（HTTP 500）。' +
      '常见于自托管 Dify 的 plugin_daemon 容器未启动或崩溃，或工作流中使用了插件型模型/工具节点。' +
      '请检查 Dify 服务状态与工作流运行日志；修复后可在本应用重新生成大纲，将从下一章继续。'
    )
  }

  if (text.length > 320 && /PluginInvokeError|InvokeError/i.test(text)) {
    return 'Dify 工作流内模型节点调用失败。请打开 Dify 该次运行日志查看详情（Generation Console 中有 req_id）。'
  }

  return text
}
