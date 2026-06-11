<script setup lang="ts">
import { onMounted, ref } from 'vue'
import NcStatusLine from '@/components/icons/NcStatusLine.vue'
import LlmProviderFields from '@/components/settings/LlmProviderFields.vue'

const emit = defineEmits<{ done: [] }>()

const step = ref(0)
const llmFieldsRef = ref<InstanceType<typeof LlmProviderFields> | null>(null)
const apiKey = ref('')
const testing = ref(false)
const testMessage = ref<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null)
const saving = ref(false)

onMounted(() => {
  llmFieldsRef.value?.loadFromConfig('https://api.deepseek.com', 'deepseek-chat', 'deepseek-chat')
})

async function testConnection(): Promise<void> {
  if (!window.novelsCreator) return
  const llm = llmFieldsRef.value?.getResolved()
  if (!llm?.baseUrl || !llm.model) {
    testMessage.value = { kind: 'err', text: '请先选择服务商与模型' }
    return
  }
  testing.value = true
  testMessage.value = { kind: 'info', text: '测试中…' }
  try {
    const res = await window.novelsCreator.config.testAssistantLlm({
      baseUrl: llm.baseUrl,
      apiKey: apiKey.value.trim(),
      model: llm.model
    })
    testMessage.value = res.ok
      ? { kind: 'ok', text: res.message }
      : { kind: 'err', text: res.message }
  } catch (e) {
    testMessage.value = {
      kind: 'err',
      text: e instanceof Error ? e.message : String(e)
    }
  } finally {
    testing.value = false
  }
}

async function dismissLater(): Promise<void> {
  if (window.novelsCreator?.config?.setAiOnboardingCompleted) {
    await window.novelsCreator.config.setAiOnboardingCompleted(true)
  }
  emit('done')
}

async function saveAndContinue(): Promise<void> {
  if (!window.novelsCreator) {
    step.value = 2
    return
  }
  saving.value = true
  try {
    const llm = llmFieldsRef.value?.getResolved()
    if (apiKey.value.trim() && llm?.baseUrl && llm.model) {
      await window.novelsCreator.config.setAiEngine({ engine: 'local' })
      await window.novelsCreator.config.setAiLocal({
        baseUrl: llm.baseUrl,
        model: llm.model,
        reasoningModel: llm.reasoningModel || llm.model,
        apiKey: apiKey.value.trim()
      })
      await window.novelsCreator.config.setAiAssistant({
        baseUrl: llm.baseUrl,
        model: llm.model,
        apiKey: apiKey.value.trim()
      })
    }
    step.value = 2
  } finally {
    saving.value = false
  }
}

async function complete(): Promise<void> {
  if (window.novelsCreator?.config?.setAiOnboardingCompleted) {
    await window.novelsCreator.config.setAiOnboardingCompleted(true)
  }
  emit('done')
}
</script>

<template>
  <div class="nc-modal-overlay">
    <div class="shell nc-card nc-modal-panel" role="dialog" aria-labelledby="ai-onboard-title">
      <header class="head">
        <h2 id="ai-onboard-title">欢迎使用 NovelsCreator v1.0</h2>
      </header>

      <div v-if="step === 0" class="body">
        <p class="lead">
          内置 <strong>LangGraph</strong> 工作流与 <strong>小说助手</strong> 已就绪。只需配置一个 OpenAI 兼容 API（如 DeepSeek），即可完成大纲、知识库、章节与世界观生成。
        </p>
        <ul class="bullets">
          <li>工作流默认走本地图，无需部署 Dify</li>
          <li>助手在左侧 Activity Bar「助手」面板，支持流式对话</li>
          <li>生成类操作需你确认后才会执行（HITL）</li>
        </ul>
      </div>

      <div v-else-if="step === 1" class="body">
        <p class="lead">选择 API 服务商与模型（助手与工作流共用 Key，也可之后在设置中修改）。</p>
        <LlmProviderFields
          ref="llmFieldsRef"
          v-model:api-key="apiKey"
          :show-reasoning="false"
        />
        <button type="button" class="nc-btn nc-btn-sm" :disabled="testing" @click="testConnection">
          {{ testing ? '测试中…' : '测试连接' }}
        </button>
        <NcStatusLine
          v-if="testMessage && testMessage.kind !== 'info'"
          :kind="testMessage.kind === 'ok' ? 'ok' : 'err'"
          :text="testMessage.text"
        />
        <p v-else-if="testMessage" class="hint">{{ testMessage.text }}</p>
      </div>

      <div v-else class="body">
        <p class="lead">配置已保存。打开项目后，可在左侧点击「助手」提问设定、大纲或下一章建议。</p>
        <p class="hint">菜单 → 设置 → AI 可随时修改引擎、模型或 Dify Legacy 模式。</p>
      </div>

      <footer class="foot">
        <button
          v-if="step === 0"
          type="button"
          class="nc-btn"
          :disabled="saving"
          @click="dismissLater"
        >
          稍后配置
        </button>
        <button
          v-if="step === 0"
          type="button"
          class="nc-btn nc-btn-primary"
          @click="step = 1"
        >
          开始配置
        </button>
        <button
          v-if="step === 1"
          type="button"
          class="nc-btn"
          :disabled="saving"
          @click="step = 2"
        >
          跳过
        </button>
        <button
          v-if="step === 1"
          type="button"
          class="nc-btn nc-btn-primary"
          :disabled="saving"
          @click="saveAndContinue"
        >
          {{ saving ? '保存中…' : '保存并继续' }}
        </button>
        <button
          v-if="step === 2"
          type="button"
          class="nc-btn nc-btn-primary"
          @click="complete"
        >
          开始使用
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.shell {
  width: min(480px, 92vw);
}
.head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 16px 0;
}
.lead {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--nc-text-primary);
}
.bullets {
  margin: 0;
  padding-left: 1.2em;
  font-size: 12px;
  line-height: 1.6;
  color: var(--nc-text-muted);
}
.hint {
  margin: 0;
  font-size: 11px;
  color: var(--nc-text-muted);
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--nc-border);
}
</style>
