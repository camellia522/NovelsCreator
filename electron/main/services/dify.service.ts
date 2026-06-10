import axios from 'axios'
import type { DifyWorkflowSlot } from '@/constants/dify-workflows'
import type {
  ChapterGenerateInputs,
  GenerateChapterResponse,
  GenerateOutlineResponse,
  GenerateKnowledgeResponse,
  KnowledgeGenerateInputs,
  MemoryPatch,
  OutlineGenerateInputs,
  OutlineWorkflowOutputs,
  KnowledgeWorkflowOutputs,
  ValidationReport,
  WorkflowOutputs
} from '../../src/types/api'
import { getDifyCredentials } from './config.service'
import { isOutlineValidationPassed, parseBoolish } from '../utils/outline-bool-parse'
import {
  buildDifyWorkflowInputs,
  deriveRetryIssuesJson,
  stringifyWorkflowInputs,
  stringifyWorkflowInputsKeepNumbers,
  type DifyInputProfile
} from './dify-inputs'
import {
  buildOutlineWorkflowInputs,
  stringifyOutlineWorkflowInputs
} from './outline-dify-inputs'
import {
  buildKnowledgeWorkflowInputs,
  stringifyKnowledgeWorkflowInputs
} from './knowledge-dify-inputs'
import { formatOutlineValidationIssues } from '@/utils/outline-validation-report'
import { parseMemoryPatchFromRaw } from '../utils/memory-patch-parse'

export function formatDifyHttpError(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : String(err)
  }
  const status = err.response?.status
  const data = err.response?.data
  if (data && typeof data === 'object') {
    const msg =
      'message' in data && data.message != null
        ? String(data.message)
        : 'error' in data && data.error != null
          ? String(data.error)
          : ''
    const code = 'code' in data && data.code != null ? String(data.code) : ''
    if (msg) {
      const prefix = status ? `${status}` : 'HTTP'
      return code ? `${prefix} [${code}] ${msg}` : `${prefix}: ${msg}`
    }
  }
  return err.message
}

function parseMaybeJson<T>(value: unknown): T | undefined {
  if (value == null) return undefined
  if (typeof value === 'object') return value as T
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value) as T
    } catch {
      return undefined
    }
  }
  return undefined
}

export function normalizeOutputs(raw: Record<string, unknown>): WorkflowOutputs {
  if (typeof raw.end_outputs === 'string') {
    try {
      return normalizeOutputs(JSON.parse(raw.end_outputs) as Record<string, unknown>)
    } catch {
      /* fall through */
    }
  }

  const memoryPatch =
    parseMemoryPatchFromRaw(raw.memory_patch) ??
    parseMaybeJson<MemoryPatch>(raw.memory_patch) ??
    (typeof raw.memory_patch === 'object' ? (raw.memory_patch as MemoryPatch) : undefined)

  const validationReport =
    parseMaybeJson<ValidationReport>(raw.validation_report) ??
    (typeof raw.validation_report === 'object'
      ? (raw.validation_report as ValidationReport)
      : undefined)

  return {
    status: (raw.status as WorkflowOutputs['status']) ?? 'error',
    circuit_break: Boolean(raw.circuit_break),
    human_action_required: Boolean(raw.human_action_required),
    retry_count: Number(raw.retry_count ?? 0),
    novel_body: String(raw.novel_body ?? ''),
    video_script: String(raw.video_script ?? ''),
    draft_text: String(raw.draft_text ?? ''),
    retry_issues_formatted: String(raw.retry_issues_formatted ?? ''),
    retry_issues: String(raw.retry_issues ?? ''),
    memory_patch: memoryPatch,
    validation_report: validationReport,
    workflow_version: String(raw.workflow_version ?? '')
  }
}

export async function runChapterGenerationWithRetry(
  baseInputs: ChapterGenerateInputs,
  options?: { inputProfile?: DifyInputProfile }
): Promise<GenerateChapterResponse> {
  const { baseUrl, apiKey } = await getDifyCredentials('chapter')
  if (!apiKey) {
    return { ok: false, error: '未配置章节工作流 API Key，请在设置 → Dify → 章节生成 中填写' }
  }

  const inputProfile = options?.inputProfile ?? 'v1.1'

  let retryCount = baseInputs.retry_count ?? 0
  let retryIssuesFormatted = baseInputs.retry_issues_formatted ?? ''
  let retryIssuesJson = baseInputs.retry_issues ?? '[]'

  async function postWorkflow(
    workflowInputs: Record<string, string | number>,
    user: string
  ) {
    return axios.post(
      `${baseUrl}/workflows/run`,
      {
        inputs: workflowInputs,
        response_mode: 'blocking',
        user
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 900_000
      }
    )
  }

  for (let attempt = 0; attempt < 32; attempt++) {
    const inputs: ChapterGenerateInputs = {
      ...baseInputs,
      retry_count: retryCount,
      retry_issues_formatted: retryIssuesFormatted,
      retry_issues: retryIssuesJson
    }

    const workflowInputs = buildDifyWorkflowInputs(inputs, inputProfile)
    const user = `novelscreator-${inputs.project_id}-${inputs.chapter_id}`

    try {
      let res
      try {
        res = await postWorkflow(workflowInputs, user)
      } catch (firstErr: unknown) {
        if (axios.isAxiosError(firstErr) && firstErr.response?.status === 400) {
          try {
            res = await postWorkflow(stringifyWorkflowInputsKeepNumbers(workflowInputs), user)
          } catch (secondErr: unknown) {
            if (axios.isAxiosError(secondErr) && secondErr.response?.status === 400) {
              res = await postWorkflow(stringifyWorkflowInputs(workflowInputs), user)
            } else {
              throw secondErr
            }
          }
        } else {
          throw firstErr
        }
      }

      if (res.data?.data?.status === 'failed') {
        return {
          ok: false,
          error: res.data?.data?.error ?? 'Dify workflow failed',
          workflowRunId: res.data?.data?.id
        }
      }

      const outputs = normalizeOutputs((res.data?.data?.outputs ?? {}) as Record<string, unknown>)

      if (outputs.status === 'retry') {
        retryCount = outputs.retry_count
        retryIssuesFormatted = outputs.retry_issues_formatted ?? ''
        retryIssuesJson =
          outputs.retry_issues?.trim() ||
          deriveRetryIssuesJson(undefined, retryIssuesFormatted)
        continue
      }

      return {
        ok: true,
        outputs,
        workflowRunId: res.data?.data?.id
      }
    } catch (err: unknown) {
      const message = formatDifyHttpError(err)
      const isTimeout =
        axios.isAxiosError(err) &&
        (err.code === 'ECONNABORTED' || /timeout/i.test(err.message))
      const hint = isTimeout
        ? '（Dify 在 15 分钟内未返回，请检查工作流是否卡住、模型是否过慢，或 Dify 服务是否正常）'
        : axios.isAxiosError(err) && err.response?.status === 400
          ? '（请核对 Dify「开始」节点是否含 estimated_duration_sec、retry_count 等数字变量）'
          : ''
      return { ok: false, error: message + hint }
    }
  }

  return { ok: false, error: '客户端重试次数过多，请检查 Dify max_retry 配置' }
}

export function normalizeOutlineOutputs(raw: Record<string, unknown>): OutlineWorkflowOutputs {
  if (typeof raw.end_outputs === 'string') {
    try {
      return normalizeOutlineOutputs(JSON.parse(raw.end_outputs) as Record<string, unknown>)
    } catch {
      /* fall through */
    }
  }

  const validationReport =
    parseMaybeJson<ValidationReport>(raw.validation_report) ??
    (typeof raw.validation_report === 'object'
      ? (raw.validation_report as ValidationReport)
      : undefined)

  let outlineJson = raw.outline_json
  if (outlineJson != null && typeof outlineJson === 'object') {
    outlineJson = JSON.stringify(outlineJson)
  }

  return {
    status: (raw.status as OutlineWorkflowOutputs['status']) ?? 'error',
    circuit_break: parseBoolish(raw.circuit_break),
    human_action_required: parseBoolish(raw.human_action_required),
    retry_count: Number(raw.retry_count ?? 0),
    outline_summary: String(raw.outline_summary ?? ''),
    outline_json: String(outlineJson ?? ''),
    validation_report: validationReport,
    retry_issues_formatted: String(raw.retry_issues_formatted ?? ''),
    workflow_version: String(raw.workflow_version ?? '')
  }
}

export async function runOutlineGenerationWithRetry(
  baseInputs: OutlineGenerateInputs
): Promise<GenerateOutlineResponse> {
  const { baseUrl, apiKey } = await getDifyCredentials('outline')
  if (!apiKey) {
    return { ok: false, error: '未配置大纲工作流 API Key，请在设置 → Dify → 大纲生成 中填写' }
  }

  let retryCount = baseInputs.retry_count ?? 0
  let retryIssuesFormatted = baseInputs.retry_issues_formatted ?? ''
  let clientRetryRounds = 0

  async function postWorkflow(workflowInputs: Record<string, string | number>, user: string) {
    return axios.post(
      `${baseUrl}/workflows/run`,
      {
        inputs: workflowInputs,
        response_mode: 'blocking',
        user
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 900_000
      }
    )
  }

  for (let attempt = 0; attempt < 32; attempt++) {
    const inputs: OutlineGenerateInputs = {
      ...baseInputs,
      retry_count: retryCount,
      retry_issues_formatted: retryIssuesFormatted
    }

    const workflowInputs = buildOutlineWorkflowInputs(inputs)
    const user = `novelscreator-outline-${inputs.project_id}`

    try {
      let res
      try {
        res = await postWorkflow(workflowInputs, user)
      } catch (firstErr: unknown) {
        if (axios.isAxiosError(firstErr) && firstErr.response?.status === 400) {
          res = await postWorkflow(stringifyOutlineWorkflowInputs(workflowInputs), user)
        } else {
          throw firstErr
        }
      }

      if (res.data?.data?.status === 'failed') {
        return {
          ok: false,
          error: res.data?.data?.error ?? 'Dify workflow failed',
          workflowRunId: res.data?.data?.id
        }
      }

      const outputs = normalizeOutlineOutputs(
        (res.data?.data?.outputs ?? {}) as Record<string, unknown>
      )

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
        workflowRunId: res.data?.data?.id,
        clientRetryRounds
      }
    } catch (err: unknown) {
      const message = formatDifyHttpError(err)
      const isTimeout =
        axios.isAxiosError(err) &&
        (err.code === 'ECONNABORTED' || /timeout/i.test(err.message))
      const hint = isTimeout
        ? '（Dify 在 15 分钟内未返回，请检查工作流是否卡住、模型是否过慢，或 Dify 服务是否正常）'
        : ''
      return { ok: false, error: message + hint }
    }
  }

  return { ok: false, error: '客户端重试次数过多，请检查 Dify max_retry 配置' }
}

export function normalizeKnowledgeOutputs(raw: Record<string, unknown>): KnowledgeWorkflowOutputs {
  if (typeof raw.end_outputs === 'string') {
    try {
      return normalizeKnowledgeOutputs(JSON.parse(raw.end_outputs) as Record<string, unknown>)
    } catch {
      /* fall through */
    }
  }

  const validationReport =
    parseMaybeJson<ValidationReport>(raw.validation_report) ??
    (typeof raw.validation_report === 'object'
      ? (raw.validation_report as ValidationReport)
      : undefined)

  let knowledgeJson = raw.knowledge_json
  if (knowledgeJson != null && typeof knowledgeJson === 'object') {
    knowledgeJson = JSON.stringify(knowledgeJson)
  }

  return {
    status: (raw.status as KnowledgeWorkflowOutputs['status']) ?? 'error',
    circuit_break: parseBoolish(raw.circuit_break),
    human_action_required: parseBoolish(raw.human_action_required),
    retry_count: Number(raw.retry_count ?? 0),
    knowledge_summary: String(raw.knowledge_summary ?? ''),
    knowledge_json: String(knowledgeJson ?? ''),
    validation_report: validationReport,
    retry_issues_formatted: String(raw.retry_issues_formatted ?? ''),
    workflow_version: String(raw.workflow_version ?? '')
  }
}

export async function runKnowledgeGenerationWithRetry(
  baseInputs: KnowledgeGenerateInputs
): Promise<GenerateKnowledgeResponse> {
  const { baseUrl, apiKey } = await getDifyCredentials('knowledge')
  if (!apiKey) {
    return {
      ok: false,
      error: '未配置知识库工作流 API Key，请在设置 → Dify → 知识库生成 中填写'
    }
  }

  let retryCount = baseInputs.retry_count ?? 0
  let retryIssuesFormatted = baseInputs.retry_issues_formatted ?? ''
  let clientRetryRounds = 0

  async function postWorkflow(workflowInputs: Record<string, string | number>, user: string) {
    return axios.post(
      `${baseUrl}/workflows/run`,
      {
        inputs: workflowInputs,
        response_mode: 'blocking',
        user
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 900_000
      }
    )
  }

  for (let attempt = 0; attempt < 32; attempt++) {
    const inputs: KnowledgeGenerateInputs = {
      ...baseInputs,
      retry_count: retryCount,
      retry_issues_formatted: retryIssuesFormatted
    }
    const workflowInputs = buildKnowledgeWorkflowInputs(inputs)
    const user = `novelscreator-knowledge-${inputs.project_id}`

    try {
      let res
      try {
        res = await postWorkflow(workflowInputs, user)
      } catch (firstErr: unknown) {
        if (axios.isAxiosError(firstErr) && firstErr.response?.status === 400) {
          res = await postWorkflow(stringifyKnowledgeWorkflowInputs(workflowInputs), user)
        } else {
          throw firstErr
        }
      }

      if (res.data?.data?.status === 'failed') {
        return {
          ok: false,
          error: res.data?.data?.error ?? 'Dify workflow failed',
          workflowRunId: res.data?.data?.id
        }
      }

      const outputs = normalizeKnowledgeOutputs(
        (res.data?.data?.outputs ?? {}) as Record<string, unknown>
      )

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
        workflowRunId: res.data?.data?.id,
        clientRetryRounds
      }
    } catch (err: unknown) {
      const message = formatDifyHttpError(err)
      const isTimeout =
        axios.isAxiosError(err) &&
        (err.code === 'ECONNABORTED' || /timeout/i.test(err.message))
      const hint = isTimeout
        ? '（Dify 在 15 分钟内未返回，请检查工作流是否卡住、模型是否过慢，或 Dify 服务是否正常）'
        : ''
      return { ok: false, error: message + hint }
    }
  }

  return { ok: false, error: '客户端重试次数过多，请检查 Dify max_retry 配置' }
}

export async function healthCheck(override?: {
  baseUrl?: string
  apiKey?: string
  slot?: DifyWorkflowSlot
}): Promise<{ ok: boolean; message: string }> {
  const slot = override?.slot ?? 'chapter'
  const saved = await getDifyCredentials(slot)
  const baseUrl = (override?.baseUrl?.trim() || saved.baseUrl).replace(/\/$/, '')
  let apiKey = override?.apiKey?.trim() ?? ''
  if (!apiKey || apiKey.startsWith('*')) {
    apiKey = saved.apiKey
  }

  if (!apiKey) {
    return { ok: false, message: '请先填写该工作流的 API Key（无需先保存也可测试）' }
  }
  if (!baseUrl) {
    return { ok: false, message: '请先填写 Base URL' }
  }

  try {
    const res = await axios.get(`${baseUrl}/info`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15_000
    })
    const name = res.data?.name ? ` · ${String(res.data.name)}` : ''
    return { ok: true, message: `连接成功${name}` }
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNREFUSED') {
        return { ok: false, message: `无法连接 ${baseUrl}，请确认 Dify 已启动` }
      }
      if (err.response?.status === 401) {
        return { ok: false, message: 'API Key 无效或未授权（401）' }
      }
      if (err.response?.status === 404) {
        return { ok: false, message: '接口不存在（404），请检查 Base URL 是否为 .../v1' }
      }
      const detail =
        typeof err.response?.data === 'object' && err.response.data && 'message' in err.response.data
          ? String((err.response.data as { message: unknown }).message)
          : formatDifyHttpError(err)
      return { ok: false, message: detail }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message }
  }
}
