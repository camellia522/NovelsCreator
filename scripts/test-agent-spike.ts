/**
 * Deep Agents Harness spike：验证 createDeepAgent + StateBackend + mock tool。
 * 不调用真实 LLM（无 API Key 时仅测实例化）。
 */
import { createDeepAgent, StateBackend } from 'deepagents'
import { tool } from 'langchain'
import { z } from 'zod'

const ping = tool(({ msg }) => `pong: ${msg}`, {
  name: 'ping',
  description: 'Echo test tool',
  schema: z.object({ msg: z.string() })
})

const agent = createDeepAgent({
  model: 'openai:gpt-4o-mini',
  tools: [ping],
  systemPrompt: 'NovelsCreator agent spike',
  backend: () => new StateBackend(),
  interruptOn: {
    ping: false
  }
})

console.log('[agent-spike] createDeepAgent OK, invoke=', typeof agent.invoke)

if (process.env.NOVELS_AGENT_SPIKE_LIVE === '1' && process.env.OPENAI_API_KEY) {
  const result = await agent.invoke({
    messages: [{ role: 'user', content: 'Call ping with msg hello' }]
  })
  console.log('[agent-spike] live result keys:', Object.keys(result))
} else {
  console.log('[agent-spike] skip live invoke (set NOVELS_AGENT_SPIKE_LIVE=1 + OPENAI_API_KEY to run)')
}
