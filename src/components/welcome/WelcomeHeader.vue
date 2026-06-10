<script setup lang="ts">
import { useUiStore } from '@/stores/ui.store'
import { APP_TITLE } from '@/constants/app-meta'

const ui = useUiStore()
</script>

<template>
  <header class="welcome-header">
    <div class="brand">
      <span class="logo">NC</span>
      <span class="title">{{ APP_TITLE }}</span>
    </div>
    <div class="actions">
      <button type="button" class="nc-btn" @click="ui.aboutOpen = true">关于</button>
    </div>
  </header>
</template>

<style scoped>
.welcome-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--nc-border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--nc-accent);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 14px;
}
.title {
  font-size: 18px;
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 8px;
}
</style>
