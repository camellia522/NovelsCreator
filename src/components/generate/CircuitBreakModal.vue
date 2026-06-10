<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLayoutStore } from '@/stores/layout.store'
import { useUiStore } from '@/stores/ui.store'
import { formatOutlineValidationIssues } from '@/utils/outline-validation-report'

const router = useRouter()
const layout = useLayoutStore()
const ui = useUiStore()

const kind = computed(() => ui.circuitBreakKind)

const title = computed(() => {
  if (kind.value === 'outline') return '大纲生成熔断'
  if (kind.value === 'knowledge') return '知识库生成熔断'
  return '生成熔断 · 需人工调整'
})

const warnText = computed(() => {
  if (kind.value === 'outline') {
    return '大纲校验未通过且已达最大重试次数。常见原因：① 与知识库国家/角色不一致；② 剧情记忆里旧正文与新建大纲冲突。请修改设定/brief，或在「AI 生成大纲」中取消「使用前序章节剧情记忆」后重试。'
  }
  if (kind.value === 'knowledge') {
    return '知识库校验未通过且已达最大重试次数。请调整 AI 生成知识库表单中的 brief 字段（力量体系、实体白名单、生成数量），或手动编辑设定后重试。'
  }
  return '校验未通过且已达最大重试次数。请修改大纲或设定后重新生成。'
})

const issuesText = computed(() => {
  const out = ui.circuitBreakOutputs
  if (!out) return ''
  if (kind.value === 'outline' || kind.value === 'knowledge') {
    return formatOutlineValidationIssues(out.validation_report, out.retry_issues_formatted)
  }
  if (out.retry_issues_formatted?.trim()) return out.retry_issues_formatted
  if ('draft_text' in out && out.draft_text) return out.draft_text.slice(0, 1500)
  return ''
})

function close(): void {
  ui.closeCircuitBreak()
}

async function goOutline(): Promise<void> {
  const id = ui.circuitBreakChapterId
  ui.closeCircuitBreak()
  layout.setActivity('outline')
  if (id) layout.selectedChapterId = id
  await router.push({ name: 'workspace' })
}

function goKnowledge(): void {
  ui.closeCircuitBreak()
  layout.setActivity('knowledge')
}

function goMemory(): void {
  ui.closeCircuitBreak()
  layout.setActivity('memory')
}

function reopenKnowledgeGenerate(): void {
  ui.closeCircuitBreak()
  layout.setActivity('knowledge')
  ui.generateKnowledgeOpen = true
}

function showConsole(): void {
  layout.expandBottomPanel()
  ui.closeCircuitBreak()
}
</script>

<template>
  <div class="overlay">
    <div class="modal nc-card">
      <header class="head">
        <h2>{{ title }}</h2>
        <button type="button" class="nc-btn" @click="close">关闭</button>
      </header>

      <p class="warn">{{ warnText }}</p>
      <pre v-if="issuesText" class="issues">{{ issuesText }}</pre>

      <footer class="actions">
        <button type="button" class="nc-btn" @click="showConsole">查看控制台</button>
        <button type="button" class="nc-btn" @click="goKnowledge">修改设定</button>
        <button v-if="kind === 'outline'" type="button" class="nc-btn" @click="goMemory">剧情记忆</button>
        <button v-if="kind === 'knowledge'" type="button" class="nc-btn" @click="reopenKnowledgeGenerate">
          重新打开 AI 生成
        </button>
        <button v-if="kind === 'chapter'" type="button" class="nc-btn nc-btn-primary" @click="goOutline">
          修改大纲
        </button>
        <button v-else-if="kind === 'outline'" type="button" class="nc-btn nc-btn-primary" @click="goOutline">
          查看大纲
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: grid;
  place-items: center;
  z-index: 1200;
}
.modal {
  width: min(560px, 94vw);
  max-height: 80vh;
  overflow: auto;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.head h2 {
  margin: 0;
  font-size: 17px;
}
.warn {
  color: var(--nc-danger);
  font-size: 14px;
}
.issues {
  white-space: pre-wrap;
  font-family: var(--nc-font-editor);
  font-size: 12px;
  background: var(--nc-bg-base);
  padding: 10px;
  border-radius: 6px;
  max-height: 240px;
  overflow: auto;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
