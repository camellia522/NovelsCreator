<script setup lang="ts">
import TagsInput from '@/components/forms/TagsInput.vue'
import NcIconButton from '@/components/icons/NcIconButton.vue'
import type { ChapterSummaryEntry } from '@/types/project'

defineProps<{
  entry: ChapterSummaryEntry
  editable?: boolean
  highlight?: boolean
}>()

const emit = defineEmits<{ remove: []; dirty: [] }>()
</script>

<template>
  <article class="summary-card" :class="{ highlight, editable }">
    <header class="card-head">
      <div>
        <strong>{{ entry.chapterId }}</strong>
        <span v-if="entry.title && !editable" class="sub">{{ entry.title }}</span>
      </div>
      <NcIconButton
        v-if="editable"
        name="trash"
        :size="16"
        label="删除"
        danger
        @click="emit('remove')"
      />
    </header>

    <template v-if="editable">
      <label class="field">
        <span>标题</span>
        <input v-model="entry.title" class="nc-input" @input="emit('dirty')" />
      </label>
      <label class="field">
        <span>本章摘要</span>
        <textarea v-model="entry.summary" class="nc-input area" rows="4" @input="emit('dirty')" />
      </label>
      <label class="field">
        <span>关键事件</span>
        <TagsInput
          :model-value="entry.keyEvents ?? []"
          @update:model-value="
            (v) => {
              entry.keyEvents = v
              emit('dirty')
            }
          "
        />
      </label>
    </template>

    <p v-else-if="entry.summary" class="summary-body">{{ entry.summary }}</p>

    <ul v-if="!editable && entry.keyEvents?.length" class="events">
      <li v-for="(ev, j) in entry.keyEvents" :key="j">{{ ev }}</li>
    </ul>

    <div v-if="entry.characterStates?.length" class="meta-block">
      <span class="meta-label">角色状态</span>
      <div v-for="(cs, k) in entry.characterStates" :key="k" class="char-state">
        <strong>{{ cs.name || cs.characterId }}</strong>：{{ cs.state }}
      </div>
    </div>

    <div v-if="entry.openThreads?.length" class="meta-block">
      <span class="meta-label">未解线程</span>
      <ul class="thread-list">
        <li v-for="(t, m) in entry.openThreads" :key="m">{{ t }}</li>
      </ul>
    </div>
  </article>
</template>

<style scoped>
.summary-card {
  padding: 10px;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  background: var(--nc-bg-base);
}
.summary-card.highlight {
  border-color: var(--nc-success);
  box-shadow: 0 0 0 1px var(--nc-success);
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
}
.sub {
  margin-left: 6px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.field {
  display: grid;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.summary-body {
  margin: 0;
  line-height: 1.55;
  font-size: 12px;
  white-space: pre-wrap;
}
.events,
.thread-list {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.5;
}
.meta-block {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--nc-border);
  font-size: 12px;
}
.meta-label {
  display: block;
  font-size: 11px;
  color: var(--nc-text-muted);
  margin-bottom: 4px;
}
.char-state {
  margin-bottom: 4px;
}
.area {
  resize: vertical;
}
</style>
