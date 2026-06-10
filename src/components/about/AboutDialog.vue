<script setup lang="ts">
import { useUiStore } from '@/stores/ui.store'
import { APP_AUTHOR, APP_COPYRIGHT, APP_GITHUB_URL, APP_NAME, APP_VERSION } from '@/constants/app-meta'

const ui = useUiStore()

const WORLDENGINE_URL = 'https://github.com/Mindwerks/worldengine'
</script>

<template>
  <div class="nc-modal-overlay" @click.self="ui.aboutOpen = false">
    <div class="modal nc-card nc-modal-panel">
      <header class="head">
        <h2>关于 {{ APP_NAME }}</h2>
        <button type="button" class="nc-btn" @click="ui.aboutOpen = false">关闭</button>
      </header>
      <p class="body">
        IDE 风格长篇小说创作工具 · Dify Workflow 驱动<br />
        版本 {{ APP_VERSION }}
      </p>
      <p class="muted">大纲 / 设定 / 记忆 / 正文均可编辑与 AI 生成。</p>

      <section class="publisher" aria-labelledby="about-publisher-title">
        <h3 id="about-publisher-title">版权与作者</h3>
        <p class="publisher-line">{{ APP_COPYRIGHT }}</p>
        <p class="publisher-line">
          开发者：
          <a :href="APP_GITHUB_URL" target="_blank" rel="noopener noreferrer">{{ APP_AUTHOR }}</a>
        </p>
        <p class="publisher-line muted">
          <a :href="APP_GITHUB_URL" target="_blank" rel="noopener noreferrer">{{ APP_GITHUB_URL }}</a>
        </p>
      </section>

      <section class="credits" aria-labelledby="about-credits-title">
        <h3 id="about-credits-title">致谢</h3>
        <p class="credit-intro">
          本软件的<strong>地图生成</strong>功能使用第三方开源项目 WorldEngine，与 WorldEngine
          作者及 Mindwerks 无隶属或背书关系。
        </p>
        <dl class="credit-list">
          <dt>WorldEngine</dt>
          <dd>
            作者：Federico Tomassetti、Bret Curtis<br />
            许可：<a :href="WORLDENGINE_URL" target="_blank" rel="noopener noreferrer">MIT License</a><br />
            项目：<a :href="WORLDENGINE_URL" target="_blank" rel="noopener noreferrer">{{ WORLDENGINE_URL }}</a>
          </dd>
        </dl>
        <p class="credit-note muted">
          感谢 WorldEngine 及其作者的开源贡献。使用与再分发 WorldEngine 须遵守其 MIT
          许可证（保留版权与许可声明）。
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.modal {
  width: min(480px, 92vw);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.head h2 {
  margin: 0;
  font-size: 18px;
}
.body {
  margin: 0 0 8px;
  line-height: 1.6;
}
.muted {
  font-size: 13px;
  color: var(--nc-text-muted);
  margin: 0;
}
.publisher {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--nc-border);
}
.publisher h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.publisher-line {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.55;
}
.publisher-line a {
  color: var(--nc-accent);
  word-break: break-all;
}
.publisher-line a:hover {
  text-decoration: underline;
}
.credits {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--nc-border);
}
.credits h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.credit-intro {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--nc-text-secondary, var(--nc-text-muted));
}
.credit-list {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.55;
}
.credit-list dt {
  font-weight: 600;
  margin-bottom: 4px;
}
.credit-list dd {
  margin: 0 0 0 12px;
  color: var(--nc-text-muted);
}
.credit-list a {
  color: var(--nc-accent);
  word-break: break-all;
}
.credit-list a:hover {
  text-decoration: underline;
}
.credit-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
</style>
