<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  LLM_MODEL_CUSTOM_ID,
  LLM_PROVIDER_CUSTOM_ID,
  LLM_PROVIDERS,
  loadLlmSelectionFromConfig,
  modelOptionsForProvider,
  onProviderChanged,
  resolveLlmSelection
} from '@/constants/llm-providers'

const props = withDefaults(
  defineProps<{
    showReasoning?: boolean
    apiKey?: string
    apiKeyConfigured?: boolean
    apiKeyPlaceholder?: string
  }>(),
  {
    showReasoning: true,
    apiKey: '',
    apiKeyConfigured: false,
    apiKeyPlaceholder: 'sk-...'
  }
)

const emit = defineEmits<{
  'update:apiKey': [value: string]
}>()

const providerId = ref('deepseek')
const customBaseUrl = ref('')
const creativeSelectId = ref('deepseek-chat')
const customCreativeModel = ref('')
const reasoningSelectId = ref('deepseek-chat')
const customReasoningModel = ref('')

const providerOptions = LLM_PROVIDERS

const isCustomProvider = computed(() => providerId.value === LLM_PROVIDER_CUSTOM_ID)

const creativeModelOptions = computed(() => modelOptionsForProvider(providerId.value, 'creative'))

const reasoningModelOptions = computed(() => modelOptionsForProvider(providerId.value, 'reasoning'))

const showCustomCreative = computed(
  () => isCustomProvider.value || creativeSelectId.value === LLM_MODEL_CUSTOM_ID
)

const showCustomReasoning = computed(
  () =>
    props.showReasoning &&
    (isCustomProvider.value || reasoningSelectId.value === LLM_MODEL_CUSTOM_ID)
)

function applyProviderDefaults(): void {
  const next = onProviderChanged(providerId.value)
  customBaseUrl.value = next.customBaseUrl
  creativeSelectId.value = next.creativeSelectId
  customCreativeModel.value = next.customCreativeModel
  reasoningSelectId.value = next.reasoningSelectId
  customReasoningModel.value = next.customReasoningModel
}

watch(providerId, () => {
  applyProviderDefaults()
})

function loadFromConfig(baseUrl: string, model: string, reasoningModel: string): void {
  const loaded = loadLlmSelectionFromConfig({ baseUrl, model, reasoningModel })
  providerId.value = loaded.providerId
  customBaseUrl.value = loaded.customBaseUrl
  creativeSelectId.value = loaded.creativeSelectId
  customCreativeModel.value = loaded.customCreativeModel
  reasoningSelectId.value = loaded.reasoningSelectId
  customReasoningModel.value = loaded.customReasoningModel
}

function getResolved(): { baseUrl: string; model: string; reasoningModel: string } {
  return resolveLlmSelection({
    providerId: providerId.value,
    customBaseUrl: customBaseUrl.value,
    creativeSelectId: creativeSelectId.value,
    customCreativeModel: customCreativeModel.value,
    reasoningSelectId: reasoningSelectId.value,
    customReasoningModel: customReasoningModel.value
  })
}

defineExpose({ loadFromConfig, getResolved })
</script>

<template>
  <div class="llm-fields">
    <label class="field">
      <span>API 服务商</span>
      <select v-model="providerId" class="nc-input">
        <option v-for="p in providerOptions" :key="p.id" :value="p.id">
          {{ p.name }}
        </option>
      </select>
    </label>

    <label v-if="isCustomProvider" class="field">
      <span>API Base URL（自定义）</span>
      <input
        v-model="customBaseUrl"
        class="nc-input"
        placeholder="https://your-api.example.com/v1"
      />
    </label>
    <p v-else class="url-hint">
      Base URL：<code>{{ providerOptions.find((p) => p.id === providerId)?.baseUrl }}</code>
    </p>

    <label class="field">
      <span>API Key</span>
      <input
        :value="apiKey"
        class="nc-input"
        type="password"
        :placeholder="apiKeyPlaceholder"
        @input="emit('update:apiKey', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="field">
      <span>{{ showReasoning ? '创作模型（O1 / N1 等）' : '模型' }}</span>
      <select
        v-if="!isCustomProvider && creativeModelOptions.length"
        v-model="creativeSelectId"
        class="nc-input"
      >
        <option v-for="m in creativeModelOptions" :key="m.id" :value="m.id">
          {{ m.name }}
        </option>
        <option :value="LLM_MODEL_CUSTOM_ID">其他（手动输入模型 ID）</option>
      </select>
      <input
        v-else
        v-model="customCreativeModel"
        class="nc-input"
        placeholder="模型 ID，如 deepseek-chat"
      />
    </label>
    <label v-if="showCustomCreative && !isCustomProvider" class="field sub">
      <span>自定义创作模型 ID</span>
      <input v-model="customCreativeModel" class="nc-input" placeholder="模型 ID" />
    </label>

    <template v-if="showReasoning">
      <label class="field">
        <span>推理模型（O2 / N2 校验等）</span>
        <select
          v-if="!isCustomProvider && reasoningModelOptions.length"
          v-model="reasoningSelectId"
          class="nc-input"
        >
          <option v-for="m in reasoningModelOptions" :key="m.id" :value="m.id">
            {{ m.name }}
          </option>
          <option :value="LLM_MODEL_CUSTOM_ID">其他（手动输入模型 ID）</option>
        </select>
        <input
          v-else
          v-model="customReasoningModel"
          class="nc-input"
          placeholder="模型 ID，如 deepseek-reasoner"
        />
      </label>
      <label v-if="showCustomReasoning && !isCustomProvider" class="field sub">
        <span>自定义推理模型 ID</span>
        <input v-model="customReasoningModel" class="nc-input" placeholder="模型 ID" />
      </label>
    </template>
  </div>
</template>

<style scoped>
.llm-fields {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.field {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--nc-text-muted);
}
.field.sub {
  margin-top: -6px;
  margin-bottom: 12px;
}
.url-hint {
  margin: -4px 0 12px;
  font-size: 11px;
  color: var(--nc-text-muted);
}
.url-hint code {
  font-size: 10px;
  word-break: break-all;
}
</style>
