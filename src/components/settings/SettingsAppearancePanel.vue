<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config.store'
import { THEME_OPTIONS } from '@/constants/appearance'

const config = useConfigStore()
const { theme, editorFontSize, editorLineNumbers } = storeToRefs(config)

const fontSizeLabel = computed(() => `${editorFontSize.value}px`)
</script>

<template>
  <div class="panel">
    <section class="section">
      <h3 class="section-title">界面主题</h3>
      <p class="hint">切换后立即生效并自动保存</p>
      <div class="theme-grid">
        <button
          v-for="opt in THEME_OPTIONS"
          :key="opt.id"
          type="button"
          class="theme-card"
          :class="{ active: theme === opt.id }"
          @click="config.setTheme(opt.id)"
        >
          <span class="swatch" :data-theme-preview="opt.id" />
          <span class="theme-label">{{ opt.label }}</span>
          <span class="theme-desc">{{ opt.desc }}</span>
        </button>
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">编辑器</h3>
      <label class="field row-field">
        <span>正文字号</span>
        <div class="range-row">
          <input
            type="range"
            min="12"
            max="22"
            step="1"
            :value="editorFontSize"
            @input="config.setEditorFontSize(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="range-val">{{ fontSizeLabel }}</span>
        </div>
      </label>
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="editorLineNumbers"
          @change="config.setEditorLineNumbers(($event.target as HTMLInputElement).checked)"
        />
        <span>显示行号（正文 / 视频稿 / 侧栏长文本）</span>
      </label>
    </section>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.section-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--nc-text-muted);
}
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.theme-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--nc-border);
  border-radius: var(--nc-radius-sm);
  background: var(--nc-bg-base);
  text-align: left;
  transition:
    border-color var(--nc-transition-fast),
    box-shadow var(--nc-transition-fast),
    transform 0.1s ease;
}
.theme-card:hover {
  border-color: color-mix(in srgb, var(--nc-accent) 50%, var(--nc-border));
}
.theme-card.active {
  border-color: var(--nc-accent);
  box-shadow: 0 0 0 1px var(--nc-accent);
}
.swatch {
  width: 100%;
  height: 36px;
  border-radius: 4px;
  border: 1px solid var(--nc-border);
}
.swatch[data-theme-preview='dark'] {
  background: linear-gradient(135deg, #1e1f22 50%, #3574f0 50%);
}
.swatch[data-theme-preview='light'] {
  background: linear-gradient(135deg, #f4f5f7 50%, #0969da 50%);
}
.swatch[data-theme-preview='system'] {
  background: linear-gradient(135deg, #1e1f22 0%, #1e1f22 45%, #f4f5f7 55%, #f4f5f7 100%);
}
.theme-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--nc-text-primary);
}
.theme-desc {
  font-size: 11px;
  line-height: 1.4;
  color: var(--nc-text-muted);
}
.field {
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: var(--nc-text-muted);
}
.row-field {
  margin-top: 4px;
}
.range-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.range-row input[type='range'] {
  flex: 1;
  accent-color: var(--nc-accent);
}
.range-val {
  min-width: 36px;
  font-size: 12px;
  color: var(--nc-text-primary);
}
.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--nc-text-primary);
  cursor: pointer;
}
.toggle-row input {
  accent-color: var(--nc-accent);
  width: 16px;
  height: 16px;
}
</style>
