<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAssistantStore } from '@/stores/assistant.store'
import { useProjectStore } from '@/stores/project.store'
import { ASSISTANT_TOOL_LABELS, truncateAssistantPreview } from '@/constants/assistant-tool-labels'
import type { AssistantActivityStep } from '@/types/api'

const assistant = useAssistantStore()
const project = useProjectStore()
const input = ref('')

const pendingToolLabel = computed(() => {
  const name = assistant.pendingApproval?.toolName
  if (!name) return ''
  return ASSISTANT_TOOL_LABELS[name] ?? name
})

function statusSymbol(status: AssistantActivityStep['status']): string {
  if (status === 'running') return '◔'
  if (status === 'waiting') return '⏸'
  if (status === 'error') return '✕'
  return '✓'
}

function previewText(text: string | undefined): string {
  if (!text) return ''
  return truncateAssistantPreview(text)
}

function showActivities(msg: { activities?: AssistantActivityStep[] }, index: number): AssistantActivityStep[] {
  if (msg.activities?.length) return msg.activities
  if (assistant.loading && index === assistant.messages.length - 1) {
    return assistant.liveActivities
  }
  return []
}

let unbindMutated: (() => void) | undefined

onMounted(() => {
  void assistant.loadSessionForProject()
  unbindMutated = assistant.bindProjectMutatedListener()
})

watch(
  () => project.current?.id,
  (id, prevId) => {
    if (!id || id === prevId) return
    void assistant.loadSessionForProject()
  }
)

onUnmounted(() => {
  unbindMutated?.()
})

async function onSend(): Promise<void> {
  const text = input.value
  input.value = ''
  await assistant.send(text)
}

function useSuggestion(prompt: string): void {
  input.value = prompt
}
</script>

<template>
  <div class="assistant-panel">
    <header class="head">
      <h2>小说助手</h2>
      <button type="button" class="nc-btn nc-btn-sm" :disabled="assistant.loading" @click="assistant.clearThread()">
        清空
      </button>
    </header>

    <div v-if="assistant.suggestions.length" class="chips">
      <button
        v-for="chip in assistant.suggestions"
        :key="chip.id"
        type="button"
        class="chip"
        @click="useSuggestion(chip.prompt)"
      >
        {{ chip.label }}
      </button>
    </div>

    <div class="messages">
      <p v-if="!assistant.messages.length" class="empty">问我关于设定、大纲或下一章的建议。</p>
      <div
        v-for="(msg, i) in assistant.messages"
        :key="i"
        class="msg-block"
        :class="msg.role"
      >
        <div v-if="showActivities(msg, i).length" class="activity-list">
          <div
            v-for="step in showActivities(msg, i)"
            :key="step.id"
            class="activity-row"
            :class="step.status"
          >
            <span class="activity-icon">{{ statusSymbol(step.status) }}</span>
            <div class="activity-body">
              <span class="activity-label">{{ step.label }}</span>
              <span v-if="step.detail" class="activity-detail">{{ previewText(step.detail) }}</span>
            </div>
          </div>
        </div>
        <div v-if="msg.content" class="msg" :class="msg.role">
          {{ msg.content }}
        </div>
      </div>
      <p v-if="assistant.loading && !assistant.isStreaming && !assistant.liveActivities.length" class="typing">
        思考中…
      </p>
    </div>

    <div v-if="assistant.pendingApproval" class="approval">
      <p>
        助手请求执行：<strong>{{ pendingToolLabel }}</strong>
        <span v-if="(assistant.pendingApproval.count ?? 1) > 1" class="approval-count">
          （共 {{ assistant.pendingApproval.count }} 项，一次确认全部执行）
        </span>
      </p>
      <ul v-if="(assistant.pendingApproval.items?.length ?? 0) > 1" class="approval-list">
        <li v-for="(item, idx) in assistant.pendingApproval.items" :key="idx">
          {{ previewText(item.description) }}
        </li>
      </ul>
      <p v-else class="approval-desc">{{ previewText(assistant.pendingApproval.description) }}</p>
      <div class="approval-actions">
        <button
          type="button"
          class="nc-btn nc-btn-primary nc-btn-sm"
          :disabled="assistant.loading"
          @click="assistant.resume(true)"
        >
          确认{{ (assistant.pendingApproval.count ?? 1) > 1 ? `全部 ${assistant.pendingApproval.count} 项` : '' }}
        </button>
        <button
          type="button"
          class="nc-btn nc-btn-sm"
          :disabled="assistant.loading"
          @click="assistant.resume(false)"
        >
          取消
        </button>
      </div>
    </div>

    <footer class="composer">
      <textarea
        v-model="input"
        class="nc-input input"
        rows="2"
        placeholder="输入消息…"
        :disabled="assistant.loading"
        @keydown.enter.exact.prevent="onSend"
      />
      <button type="button" class="nc-btn nc-btn-primary" :disabled="assistant.loading || !input.trim()" @click="onSend">
        发送
      </button>
    </footer>
  </div>
</template>

<style scoped>
.assistant-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: 100%;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  border: 1px solid var(--nc-border);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  background: var(--nc-bg-base);
  color: var(--nc-text-muted);
  cursor: pointer;
}
.chip:hover {
  border-color: var(--nc-accent);
  color: var(--nc-text-primary);
}
.messages {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}
.empty {
  margin: 0;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.msg-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 92%;
}
.msg-block.user {
  align-self: flex-end;
}
.msg-block.assistant,
.msg-block.error {
  align-self: flex-start;
}
.msg {
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 10px;
  border-radius: var(--nc-radius-sm);
  white-space: pre-wrap;
}
.msg.user {
  background: color-mix(in srgb, var(--nc-accent) 12%, var(--nc-bg-elevated));
}
.msg.assistant {
  background: var(--nc-bg-elevated);
}
.msg.error {
  background: color-mix(in srgb, #c0392b 12%, var(--nc-bg-elevated));
  color: #e74c3c;
}
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: var(--nc-radius-sm);
  background: color-mix(in srgb, var(--nc-bg-elevated) 88%, var(--nc-bg-base));
  border: 1px solid var(--nc-border);
}
.activity-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11px;
  line-height: 1.4;
}
.activity-icon {
  width: 14px;
  flex-shrink: 0;
  text-align: center;
  color: var(--nc-text-muted);
  font-size: 10px;
  margin-top: 1px;
}
.activity-row.running .activity-icon {
  color: var(--nc-accent);
  animation: spin 1.2s linear infinite;
}
.activity-row.waiting .activity-icon {
  color: #d68910;
}
.activity-row.done .activity-icon {
  color: #27ae60;
}
.activity-row.error .activity-icon {
  color: #e74c3c;
}
.activity-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.activity-label {
  color: var(--nc-text-primary);
  font-family: var(--nc-font-mono, ui-monospace, monospace);
}
.activity-detail {
  color: var(--nc-text-muted);
  font-size: 10px;
}
.typing {
  font-size: 11px;
  color: var(--nc-text-muted);
  margin: 0;
}
.approval {
  border: 1px solid var(--nc-accent);
  border-radius: var(--nc-radius-sm);
  padding: 10px;
  font-size: 12px;
  background: color-mix(in srgb, var(--nc-accent) 8%, var(--nc-bg-base));
}
.approval-desc {
  margin: 4px 0 8px;
  color: var(--nc-text-muted);
}
.approval-count {
  color: var(--nc-text-muted);
  font-size: 11px;
  font-weight: normal;
}
.approval-list {
  margin: 4px 0 8px;
  padding-left: 18px;
  color: var(--nc-text-muted);
  font-size: 11px;
  max-height: 120px;
  overflow-y: auto;
}
.approval-list li {
  margin-bottom: 4px;
}
.approval-actions {
  display: flex;
  gap: 8px;
}
.composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: end;
}
.input {
  resize: vertical;
  min-height: 52px;
  font-size: 12px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
