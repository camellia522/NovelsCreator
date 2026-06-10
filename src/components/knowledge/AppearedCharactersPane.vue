<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useMemoryStore } from '@/stores/memory.store'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useLayoutStore } from '@/stores/layout.store'
import { unpromotedAppeared } from '@/utils/appeared-characters'

const memory = useMemoryStore()
const knowledge = useKnowledgeStore()
const layout = useLayoutStore()
const { doc: memoryDoc } = storeToRefs(memory)

const selected = ref<Set<string>>(new Set())
const busy = ref(false)
const message = ref('')

const pending = computed(() =>
  unpromotedAppeared(memoryDoc.value?.appearedCharacters ?? [])
)

const promoted = computed(() =>
  (memoryDoc.value?.appearedCharacters ?? []).filter((e) => e.promoted)
)

function toggle(name: string, checked: boolean): void {
  const next = new Set(selected.value)
  if (checked) next.add(name)
  else next.delete(name)
  selected.value = next
}

function selectAll(): void {
  selected.value = new Set(pending.value.map((e) => e.name))
}

function clearSelection(): void {
  selected.value = new Set()
}

async function promoteSelected(): Promise<void> {
  if (!window.novelsCreator?.project.promoteAppearedCharacters) return
  const names = [...selected.value]
  if (!names.length) {
    message.value = '请先勾选要加入角色库的人名'
    return
  }
  busy.value = true
  message.value = ''
  try {
    const result = await window.novelsCreator.project.promoteAppearedCharacters(names)
    await memory.load()
    await knowledge.load()
    if (result.promoted.length) {
      message.value = `已加入角色库：${result.promoted.join('、')}`
      knowledge.selectCharacter(
        memoryDoc.value?.appearedCharacters?.find((e) => e.name === result.promoted[0])
          ?.knowledgeCharacterId ?? knowledge.doc?.characters.slice(-1)[0]?.id ?? null
      )
    }
    if (result.skipped.length && !result.promoted.length) {
      message.value = '所选人名已在库中或不存在'
    }
    clearSelection()
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function rescanCurrentChapter(): Promise<void> {
  if (!window.novelsCreator?.project.scanAppearedCharacters) return
  const chapterId = layout.selectedChapterId
  busy.value = true
  message.value = ''
  try {
    const novel = await window.novelsCreator.project.getChapterText(chapterId, 'novel')
    if (!novel.trim()) {
      message.value = `${chapterId} 暂无正文，无法扫描`
      return
    }
    const scan = await window.novelsCreator.project.scanAppearedCharacters(chapterId, novel)
    await memory.load()
    message.value = scan.newCount
      ? `已扫描 ${chapterId}：新增 ${scan.newCount} 人（${scan.newNames.join('、')}）`
      : `已扫描 ${chapterId}：无新人名`
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="appeared-pane">
    <p class="hint">
      从章节正文与剧情记忆中自动提取<strong>未登记</strong>人名。勾选后点「加入角色库」，会写入「人物」并标记为配角。
    </p>

    <div class="row-actions">
      <button type="button" class="nc-btn nc-btn-sm" :disabled="busy" @click="rescanCurrentChapter">
        扫描当前章 {{ layout.selectedChapterId }}
      </button>
      <button type="button" class="nc-btn nc-btn-sm" :disabled="!pending.length" @click="selectAll">
        全选待处理
      </button>
      <button
        type="button"
        class="nc-btn nc-btn-sm nc-btn-primary"
        :disabled="busy || !selected.size"
        @click="promoteSelected"
      >
        {{ busy ? '处理中…' : `加入角色库（${selected.size}）` }}
      </button>
    </div>

    <p v-if="message" class="msg">{{ message }}</p>

    <section v-if="pending.length" class="block">
      <h4 class="section-title">待加入（{{ pending.length }}）</h4>
      <ul class="list">
        <li v-for="entry in pending" :key="entry.name" class="item">
          <label class="check">
            <input
              type="checkbox"
              :checked="selected.has(entry.name)"
              @change="toggle(entry.name, ($event.target as HTMLInputElement).checked)"
            />
            <span class="name">{{ entry.name }}</span>
          </label>
          <span class="meta">
            首见 {{ entry.firstSeenIn }}
            <template v-if="entry.lastSeenIn !== entry.firstSeenIn"> · 末见 {{ entry.lastSeenIn }}</template>
          </span>
          <p v-if="entry.lastState" class="state">{{ entry.lastState }}</p>
        </li>
      </ul>
    </section>

    <p v-else class="empty">暂无待处理人名。生成章节后会自动扫描并出现在此。</p>

    <section v-if="promoted.length" class="block muted-block">
      <h4 class="section-title">已加入角色库（{{ promoted.length }}）</h4>
      <ul class="promoted-list">
        <li v-for="entry in promoted" :key="`p-${entry.name}`">
          {{ entry.name }}
          <span class="meta">← {{ entry.knowledgeCharacterId ?? 'char-???' }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.appeared-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--nc-text-muted);
  line-height: 1.5;
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.msg {
  margin: 0;
  font-size: 12px;
  color: var(--nc-success);
}
.block {
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  padding: 10px;
  background: var(--nc-bg-base);
}
.muted-block {
  opacity: 0.85;
}
.section-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.item {
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--nc-border);
}
.item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.name {
  font-weight: 600;
  font-size: 14px;
}
.meta {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--nc-text-muted);
}
.state {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--nc-text-muted);
}
.empty {
  margin: 0;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.promoted-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
}
</style>
