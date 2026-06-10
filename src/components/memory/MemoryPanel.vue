<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import PanelSaveBar from '@/components/forms/PanelSaveBar.vue'
import NcIcon from '@/components/icons/NcIcon.vue'
import MonacoFieldEditor from '@/components/editor/MonacoFieldEditor.vue'
import ChapterSummaryCard from '@/components/memory/ChapterSummaryCard.vue'
import ForeshadowingForm from '@/components/memory/ForeshadowingForm.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useMemoryStore } from '@/stores/memory.store'

const memory = useMemoryStore()
const layout = useLayoutStore()
const {
  doc,
  tab,
  highlightChapterId,
  lastUpdate,
  dirty,
  saving,
  sortedChapterSummaries,
  stats,
  activeForeshadowing,
  resolvedForeshadowing
} = storeToRefs(memory)

const latestChapter = computed(() => {
  const list = sortedChapterSummaries.value
  return list.length ? list[list.length - 1] : null
})

function markDirty(): void {
  memory.markDirty()
}

function updateBannerText(): string {
  const u = lastUpdate.value
  if (!u) return ''
  const parts: string[] = [`${u.chapterId} 生成完成`]
  if (u.chapterSummaryUpdated) parts.push('章摘要已更新')
  if (u.globalDeltaAdded) parts.push('全局摘要已追加')
  if (u.foreshadowingChanged > 0) parts.push(`伏笔 ${u.foreshadowingChanged} 条`)
  return parts.join(' · ')
}

function isHighlighted(chapterId: string): boolean {
  return highlightChapterId.value === chapterId
}

function removeChapterById(chapterId: string): void {
  const idx = doc.value?.chapterSummaries.findIndex((s) => s.chapterId === chapterId) ?? -1
  if (idx >= 0) memory.removeChapterSummary(idx)
}

function removeForeshadowingById(id: string): void {
  const idx = doc.value?.foreshadowing.findIndex((f) => f.id === id) ?? -1
  if (idx >= 0) memory.removeForeshadowing(idx)
}
</script>

<template>
  <div class="memory-panel">
    <header class="tabs">
      <button
        v-for="t in (['overview', 'global', 'chapters', 'foreshadowing'] as const)"
        :key="t"
        type="button"
        class="tab"
        :class="{ active: tab === t }"
        @click="tab = t"
      >
        {{ { overview: '概览', global: '全局', chapters: '章摘要', foreshadowing: '伏笔' }[t] }}
      </button>
    </header>

    <p class="tip">有正文但缺摘要时，打开记忆面板会自动从正文补全；也可手动点击「补全缺失摘要」。</p>

    <div class="row-actions">
      <button type="button" class="nc-btn nc-btn-sm" @click="memory.backfillMissing()">补全缺失摘要</button>
    </div>

    <div v-if="lastUpdate" class="update-banner">
      <span class="banner-text">
        <NcIcon name="check" :size="14" />
        {{ updateBannerText() }}
      </span>
      <button type="button" class="link-btn" @click="memory.focusChapter(lastUpdate.chapterId)">查看</button>
    </div>

    <template v-if="doc">
      <div v-show="tab === 'overview'" class="pane">
        <div class="stats">
          <div class="stat">
            <strong>{{ stats.chapters }}</strong>
            <span>章摘要</span>
          </div>
          <div class="stat">
            <strong>{{ stats.foreshadowingOpen }}</strong>
            <span>未解伏笔</span>
          </div>
          <div class="stat">
            <strong>{{ stats.globalLength }}</strong>
            <span>全局字数</span>
          </div>
        </div>

        <section v-if="doc.globalSummary" class="preview-block">
          <h4>全局摘要（节选）</h4>
          <p class="preview-text">
            {{ doc.globalSummary.slice(0, 280) }}{{ doc.globalSummary.length > 280 ? '…' : '' }}
          </p>
          <button type="button" class="nc-btn nc-btn-sm" @click="tab = 'global'">查看全文</button>
        </section>

        <section v-if="latestChapter" class="preview-block">
          <h4>最新章摘要 · {{ latestChapter.chapterId }}</h4>
          <ChapterSummaryCard :entry="latestChapter" :highlight="isHighlighted(latestChapter.chapterId)" />
        </section>

        <section v-if="activeForeshadowing.length" class="preview-block">
          <h4>活跃伏笔（{{ activeForeshadowing.length }}）</h4>
          <ul class="thread-list">
            <li v-for="fs in activeForeshadowing.slice(0, 5)" :key="fs.id">
              <code>{{ fs.id }}</code> {{ fs.description }}
            </li>
          </ul>
          <button type="button" class="nc-btn nc-btn-sm" @click="tab = 'foreshadowing'">全部伏笔</button>
        </section>

        <p v-if="!doc.globalSummary && !sortedChapterSummaries.length" class="hint">
          尚无记忆。生成章节成功后，此处将自动展示摘要与伏笔。
        </p>
      </div>

      <div v-show="tab === 'global'" class="pane">
        <label class="field">
          <span>全书全局摘要（生成后自动追加 globalSummaryDelta）</span>
          <MonacoFieldEditor
            v-model="doc.globalSummary"
            :min-height="200"
            placeholder="已发生主线、世界观共识…"
            @update:model-value="markDirty"
          />
        </label>
      </div>

      <div v-show="tab === 'chapters'" class="pane">
        <div class="row-actions">
          <button type="button" class="nc-btn nc-btn-sm" @click="memory.addChapterSummary(layout.selectedChapterId)">
            + 当前章摘要
          </button>
        </div>
        <ChapterSummaryCard
          v-for="entry in sortedChapterSummaries"
          :key="entry.chapterId"
          :entry="entry"
          editable
          :highlight="isHighlighted(entry.chapterId)"
          @remove="removeChapterById(entry.chapterId)"
          @dirty="markDirty"
        />
        <p v-if="!sortedChapterSummaries.length" class="hint">暂无章摘要；成功生成章节后会自动追加。</p>
      </div>

      <div v-show="tab === 'foreshadowing'" class="pane">
        <button type="button" class="nc-btn nc-btn-sm" @click="memory.addForeshadowing()">+ 伏笔</button>

        <template v-if="activeForeshadowing.length">
          <h4 class="section-title">未揭示</h4>
          <div v-for="fs in activeForeshadowing" :key="fs.id" class="card">
            <ForeshadowingForm :entry="fs" @dirty="markDirty" @remove="removeForeshadowingById(fs.id)" />
          </div>
        </template>

        <template v-if="resolvedForeshadowing.length">
          <h4 class="section-title muted">已揭示</h4>
          <div v-for="fs in resolvedForeshadowing" :key="'r-' + fs.id" class="card resolved">
            <ForeshadowingForm :entry="fs" @dirty="markDirty" @remove="removeForeshadowingById(fs.id)" />
          </div>
        </template>

        <p v-if="!doc.foreshadowing.length" class="hint">暂无伏笔记录。</p>
      </div>

      <PanelSaveBar :dirty="dirty" :saving="saving" label="保存记忆" @save="memory.save()" />
    </template>
  </div>
</template>

<style scoped>
.memory-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow: auto;
  font-size: 13px;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tab {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--nc-border);
  border-radius: 4px;
  background: var(--nc-bg-base);
  color: var(--nc-text-muted);
}
.tab.active {
  border-color: var(--nc-accent);
  color: var(--nc-text-primary);
}
.tip {
  font-size: 11px;
  color: var(--nc-text-muted);
  margin: 0;
}
.update-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(46, 160, 67, 0.12);
  border: 1px solid var(--nc-success);
  font-size: 12px;
  color: var(--nc-success);
}
.banner-text {
  display: flex;
  align-items: center;
  gap: 6px;
}
.link-btn {
  border: none;
  background: none;
  color: var(--nc-accent);
  cursor: pointer;
  font-size: 12px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.stat {
  padding: 10px;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  text-align: center;
  background: var(--nc-bg-base);
}
.stat strong {
  display: block;
  font-size: 18px;
}
.stat span {
  font-size: 11px;
  color: var(--nc-text-muted);
}
.preview-block {
  padding: 10px;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  background: var(--nc-bg-base);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview-block h4 {
  margin: 0;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.preview-text {
  margin: 0;
  line-height: 1.5;
  font-size: 12px;
  white-space: pre-wrap;
}
.pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.area {
  resize: vertical;
}
.card {
  padding: 10px;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  background: var(--nc-bg-base);
}
.card.resolved {
  opacity: 0.75;
}
.section-title {
  margin: 4px 0;
  font-size: 12px;
}
.section-title.muted {
  color: var(--nc-text-muted);
}
.thread-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.5;
}
.thread-list code {
  font-size: 11px;
  color: var(--nc-accent);
}
.hint {
  font-size: 12px;
  color: var(--nc-text-muted);
}
.nc-btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
</style>
