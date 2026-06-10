<script setup lang="ts">
import { computed } from 'vue'
import { ICONS, type IconName } from '@/components/icons/icon-paths'

const props = withDefaults(
  defineProps<{
    name: IconName
    size?: number
    strokeWidth?: number
    title?: string
  }>(),
  {
    size: 18,
    strokeWidth: 1.75
  }
)

const elements = computed(() => ICONS[props.name] ?? [])
const noStroke = computed(() => props.name === 'dot-filled' || props.name === 'circle-dot')
</script>

<template>
  <svg
    class="nc-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="noStroke ? 'none' : 'currentColor'"
    :stroke-width="noStroke ? 0 : strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="title ? undefined : true"
    :aria-label="title"
    :role="title ? 'img' : undefined"
  >
    <template v-for="(el, i) in elements" :key="i">
      <path v-if="el.type === 'path'" :d="el.d" :fill="el.fill ?? 'none'" />
      <circle
        v-else
        :cx="el.cx"
        :cy="el.cy"
        :r="el.r"
        :fill="el.fill ?? 'none'"
        :stroke="el.fill ? 'none' : 'currentColor'"
      />
    </template>
  </svg>
</template>

<style scoped>
.nc-icon {
  display: block;
  flex-shrink: 0;
  color: var(--nc-icon, currentColor);
}
</style>
