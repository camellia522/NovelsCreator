<script setup lang="ts">
import { computed } from 'vue'
import { stringToTags, tagsToString } from '@/utils/tags'

const props = defineProps<{
  modelValue: string[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const text = computed({
  get: () => tagsToString(props.modelValue),
  set: (v: string) => emit('update:modelValue', stringToTags(v))
})
</script>

<template>
  <input
    v-model="text"
    class="nc-input"
    :placeholder="placeholder ?? '多个标签用逗号分隔，如：冷静, 腹黑'"
  />
</template>
