<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  DIFY_WORKFLOW_DEFINITIONS,
  type DifyWorkflowKeys,
  type DifyWorkflowSlot,
  emptyDifyWorkflowKeys
} from '@/constants/dify-workflows'
import type { AiEngineId } from '@/types/api'
import NcStatusLine from '@/components/icons/NcStatusLine.vue'
import LlmProviderFields from '@/components/settings/LlmProviderFields.vue'

type StatusMsg = { kind: 'ok' | 'err' | 'info'; text: string }

const engine = ref<AiEngineId>('local')
const showDifyAdvanced = ref(false)
const llmFieldsRef = ref<InstanceType<typeof LlmProviderFields> | null>(null)
const assistantApiKey = ref('')
const assistantConfigured = ref(false)
const assistantTestMessage = ref<StatusMsg | null>(null)
const assistantTesting = ref(false)
const baseUrl = ref('http://127.0.0.1/v1')
const workflowKeys = reactive<DifyWorkflowKeys>(emptyDifyWorkflowKeys())
const configured = reactive<Record<DifyWorkflowSlot, boolean>>({
  chapter: false,
  outline: false,
  society: false,
  knowledge: false
})
const testMessages = reactive<Partial<Record<DifyWorkflowSlot, StatusMsg>>>({})
const testingSlot = ref<DifyWorkflowSlot | null>(null)
const saving = ref(false)
const saveMessage = ref<StatusMsg | null>(null)

const SAVED_KEY_HINT = '已保存；留空并保存将删除 Key'

async function reloadFromDisk(): Promise<void> {
  if (!window.novelsCreator) return
  const config = await window.novelsCreator.config.get()
  engine.value = config.ai?.engine ?? 'local'
  showDifyAdvanced.value = engine.value === 'dify'
  const localBaseUrl =
    config.ai?.assistant?.baseUrl ?? config.ai?.local?.baseUrl ?? 'https://api.deepseek.com'
  const localModel = config.ai?.assistant?.model ?? config.ai?.local?.model ?? 'deepseek-chat'
  const localReasoning = config.ai?.local?.reasoningModel ?? localModel
  llmFieldsRef.value?.loadFromConfig(localBaseUrl, localModel, localReasoning)
  assistantConfigured.value = Boolean(config.ai?.assistant?.configured)
  assistantApiKey.value = ''
  baseUrl.value = config.dify.baseUrl
  for (const def of DIFY_WORKFLOW_DEFINITIONS) {
    const w = config.dify.workflows[def.slot]
    configured[def.slot] = w.configured
    workflowKeys[def.slot] = ''
  }
}

function buildWorkflowsPayload(): Partial<DifyWorkflowKeys> {
  const workflows: Partial<DifyWorkflowKeys> = {}
  for (const def of DIFY_WORKFLOW_DEFINITIONS) {
    const trimmed = workflowKeys[def.slot].trim()
    if (trimmed) {
      workflows[def.slot] = trimmed
    } else if (configured[def.slot]) {
      workflows[def.slot] = ''
    }
  }
  return workflows
}

function resolveAssistantApiKeyForSave(): string | undefined {
  const trimmed = assistantApiKey.value.trim()
  if (trimmed) return trimmed
  if (assistantConfigured.value) return ''
  return undefined
}

onMounted(async () => {
  if (!window.novelsCreator) {
    saveMessage.value = { kind: 'err', text: '预加载脚本未加载，请重启应用' }
    return
  }
  await reloadFromDisk()
})

async function save(): Promise<void> {
  if (!window.novelsCreator) {
    saveMessage.value = { kind: 'err', text: '预加载脚本未加载，请重启应用' }
    return
  }
  saving.value = true
  saveMessage.value = null
  try {
    const llm = llmFieldsRef.value?.getResolved()
    if (!llm?.baseUrl || !llm.model) {
      saveMessage.value = { kind: 'err', text: '请选择 API 服务商并填写模型' }
      return
    }
    await window.novelsCreator.config.setAiEngine({ engine: engine.value })
    await window.novelsCreator.config.setAiLocal({
      baseUrl: llm.baseUrl,
      model: llm.model,
      reasoningModel: llm.reasoningModel || llm.model,
      apiKey: resolveAssistantApiKeyForSave()
    })
    await window.novelsCreator.config.setAiAssistant({
      model: llm.model,
      baseUrl: llm.baseUrl,
      apiKey: resolveAssistantApiKeyForSave()
    })
    await window.novelsCreator.config.setDify({
      baseUrl: baseUrl.value.trim(),
      workflows: buildWorkflowsPayload()
    })
    await reloadFromDisk()
    saveMessage.value = { kind: 'ok', text: '已保存' }
  } catch (e) {
    saveMessage.value = {
      kind: 'err',
      text: `保存失败：${e instanceof Error ? e.message : String(e)}`
    }
  } finally {
    saving.value = false
  }
}

async function testConnection(slot: DifyWorkflowSlot): Promise<void> {
  if (!window.novelsCreator) {
    testMessages[slot] = { kind: 'err', text: '预加载脚本未加载' }
    return
  }
  testingSlot.value = slot
  testMessages[slot] = { kind: 'info', text: '测试中…' }
  try {
    const res = await window.novelsCreator.config.testDify({
      slot,
      baseUrl: baseUrl.value.trim(),
      apiKey: workflowKeys[slot].trim()
    })
    testMessages[slot] = res.ok
      ? { kind: 'ok', text: res.message }
      : { kind: 'err', text: res.message }
  } catch (e) {
    testMessages[slot] = {
      kind: 'err',
      text: e instanceof Error ? e.message : String(e)
    }
  } finally {
    testingSlot.value = null
  }
}

function keyPlaceholder(slot: DifyWorkflowSlot): string {
  return configured[slot] ? SAVED_KEY_HINT : 'app-...'
}

async function testAssistantLlm(): Promise<void> {
  if (!window.novelsCreator) {
    assistantTestMessage.value = { kind: 'err', text: '预加载脚本未加载' }
    return
  }
  assistantTesting.value = true
  assistantTestMessage.value = { kind: 'info', text: '测试中…' }
  try {
    const llm = llmFieldsRef.value?.getResolved()
    if (!llm?.baseUrl || !llm.model) {
      assistantTestMessage.value = { kind: 'err', text: '请先选择服务商与模型' }
      return
    }
    const res = await window.novelsCreator.config.testAssistantLlm({
      baseUrl: llm.baseUrl,
      apiKey: assistantApiKey.value.trim(),
      model: llm.model
    })
    assistantTestMessage.value = res.ok
      ? { kind: 'ok', text: res.message }
      : { kind: 'err', text: res.message }
  } catch (e) {
    assistantTestMessage.value = {
      kind: 'err',
      text: e instanceof Error ? e.message : String(e)
    }
  } finally {
    assistantTesting.value = false
  }
}
</script>

<template>
  <div class="panel">
    <section class="engine-block">
      <h3 class="section-title">AI 引擎</h3>
      <label class="field">
        <span>工作流引擎</span>
        <select v-model="engine" class="nc-input" @change="showDifyAdvanced = engine === 'dify'">
          <option value="local">内置 LangGraph（推荐）</option>
          <option value="dify">Dify Legacy（高级）</option>
        </select>
      </label>
      <p class="hint">
        默认使用内置 LangGraph：<strong>大纲 / 知识库 / 社会层 / 章节</strong>均在本地执行；创作模型用于 N1/N3/N4，推理模型用于 N2/N5。仅需填写上方 API Key，无需部署 Dify。
      </p>
    </section>

    <section class="engine-block">
      <h3 class="section-title">内置 LLM（助手 + Local 工作流）</h3>
      <p class="hint">
        OpenAI 兼容 API，与 Dify 工作流 Key <strong>相互独立</strong>。Local 大纲的 O1 用「创作模型」，O2 用「推理模型」。
      </p>
      <LlmProviderFields
        ref="llmFieldsRef"
        v-model:api-key="assistantApiKey"
        :api-key-configured="assistantConfigured"
        :api-key-placeholder="assistantConfigured ? SAVED_KEY_HINT : 'sk-...'"
        :show-reasoning="true"
      />
      <button
        type="button"
        class="nc-btn nc-btn-sm"
        :disabled="assistantTesting"
        @click="testAssistantLlm"
      >
        {{ assistantTesting ? '测试中…' : '测试助手连接' }}
      </button>
      <NcStatusLine
        v-if="assistantTestMessage && assistantTestMessage.kind !== 'info'"
        :kind="assistantTestMessage.kind === 'ok' ? 'ok' : 'err'"
        :text="assistantTestMessage.text"
      />
      <p v-else-if="assistantTestMessage" class="info-msg">{{ assistantTestMessage.text }}</p>
    </section>

    <details class="dify-advanced" :open="showDifyAdvanced">
      <summary class="dify-summary">高级：Dify Legacy 工作流</summary>
      <p class="intro">
        自托管 Dify 时使用。各应用 API Key 不同，Base URL 通常共用（如
        <code>http://127.0.0.1/v1</code>）。切换引擎为「Dify Legacy」后生效。
      </p>

      <label class="field">
        <span>Base URL（共用）</span>
        <input v-model="baseUrl" class="nc-input" placeholder="http://127.0.0.1/v1" />
      </label>

      <section v-for="def in DIFY_WORKFLOW_DEFINITIONS" :key="def.slot" class="workflow-block">
        <h4 class="workflow-title">{{ def.label }}</h4>
        <p class="workflow-meta">
          <code>{{ def.workflowId }}</code> · {{ def.description }}
        </p>

        <label class="field">
          <span>API Key</span>
          <input
            v-model="workflowKeys[def.slot]"
            class="nc-input"
            type="password"
            :placeholder="keyPlaceholder(def.slot)"
          />
        </label>

        <button
          type="button"
          class="nc-btn nc-btn-sm"
          :disabled="testingSlot === def.slot"
          @click="testConnection(def.slot)"
        >
          {{ testingSlot === def.slot ? '测试中…' : '测试连接' }}
        </button>

        <NcStatusLine
          v-if="testMessages[def.slot] && testMessages[def.slot]!.kind !== 'info'"
          :kind="testMessages[def.slot]!.kind === 'ok' ? 'ok' : 'err'"
          :text="testMessages[def.slot]!.text"
        />
        <p v-else-if="testMessages[def.slot]" class="info-msg">{{ testMessages[def.slot]!.text }}</p>
      </section>
    </details>

    <footer class="footer">
      <NcStatusLine v-if="saveMessage" :kind="saveMessage.kind === 'ok' ? 'ok' : 'err'" :text="saveMessage.text" />
      <button type="button" class="nc-btn nc-btn-primary" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : '保存 AI 配置' }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.section-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.engine-block {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--nc-border);
}
.dify-advanced {
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid var(--nc-border);
  border-radius: var(--nc-radius-sm);
  background: var(--nc-bg-base);
}
.dify-summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--nc-text-primary);
  margin-bottom: 8px;
}
.dify-advanced[open] .dify-summary {
  margin-bottom: 12px;
}
.hint {
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--nc-text-muted);
}
.intro {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--nc-text-muted);
}
.intro code {
  font-size: 11px;
}
.field {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--nc-text-muted);
}
.workflow-block {
  border: 1px solid var(--nc-border);
  border-radius: var(--nc-radius-sm);
  padding: 12px 14px;
  margin-bottom: 10px;
  background: var(--nc-bg-base);
}
.workflow-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
}
.workflow-meta {
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--nc-text-muted);
}
.workflow-meta code {
  font-size: 10px;
}
.info-msg {
  font-size: 12px;
  color: var(--nc-text-muted);
  margin: 8px 0 0;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--nc-border);
}
</style>
