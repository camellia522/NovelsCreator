<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useConfigStore } from '@/stores/config.store'
import { useUiStore } from '@/stores/ui.store'
import { APP_NAME, APP_VERSION } from '@/constants/app-meta'

const config = useConfigStore()
const ui = useUiStore()
const { defaultProjectsDir } = storeToRefs(config)
</script>

<template>
  <div class="panel">
    <section class="section">
      <h3 class="section-title">默认项目目录</h3>
      <p class="hint">新建项目时预填保存位置，可随时在对话框中更改。</p>
      <div class="dir-row">
        <input
          class="nc-input"
          readonly
          :value="defaultProjectsDir || '未设置'"
          placeholder="未设置"
        />
        <button type="button" class="nc-btn" @click="config.pickDefaultProjectsDir()">浏览…</button>
        <button
          v-if="defaultProjectsDir"
          type="button"
          class="nc-btn"
          @click="config.clearDefaultProjectsDir()"
        >
          清除
        </button>
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">关于</h3>
      <p class="hint">{{ APP_NAME }} v{{ APP_VERSION }} · IDE 风格长篇小说创作工具</p>
      <button type="button" class="nc-btn" @click="ui.aboutOpen = true">打开关于对话框</button>
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
.dir-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.dir-row .nc-input {
  flex: 1;
  min-width: 200px;
}
</style>
