<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  DIFY_WORKFLOW_DEFINITIONS,
  type DifyWorkflowKeys,
  type DifyWorkflowSlot,
  emptyDifyWorkflowKeys
} from '@/constants/dify-workflows'
import NcStatusLine from '@/components/icons/NcStatusLine.vue'

type StatusMsg = { kind: 'ok' | 'err' | 'info'; text: string }

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
</script>

<template>
  <div class="panel">
    <p class="intro">
      各 Dify 应用 API Key 不同，请分别填写。Base URL 通常共用（如
      <code>http://127.0.0.1/v1</code>）。
    </p>

    <label class="field">
      <span>Base URL（共用）</span>
      <input v-model="baseUrl" class="nc-input" placeholder="http://127.0.0.1/v1" />
    </label>

    <section v-for="def in DIFY_WORKFLOW_DEFINITIONS" :key="def.slot" class="workflow-block">
      <h3 class="workflow-title">{{ def.label }}</h3>
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

    <footer class="footer">
      <NcStatusLine v-if="saveMessage" :kind="saveMessage.kind === 'ok' ? 'ok' : 'err'" :text="saveMessage.text" />
      <button type="button" class="nc-btn nc-btn-primary" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : '保存 Dify 配置' }}
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
  font-size: 14px;
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
