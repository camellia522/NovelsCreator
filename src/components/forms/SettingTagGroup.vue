<script setup lang="ts">
import { computed } from 'vue'

export interface SettingTagOption {
  value: string
  label: string
  desc?: string
}

const props = withDefaults(
  defineProps<{
    label: string
    options?: readonly string[]
    optionItems?: readonly SettingTagOption[]
    /** 单选为 string；多选为 string[] */
    modelValue: string | string[]
    multiple?: boolean
    max?: number
    disabled?: boolean
  }>(),
  { multiple: false, max: 3, disabled: false, options: () => [] as readonly string[] }
)

const emit = defineEmits<{ 'update:modelValue': [value: string | string[]] }>()

const items = computed((): SettingTagOption[] => {
  if (props.optionItems?.length) return [...props.optionItems]
  return props.options.map((o) => ({ value: o, label: o }))
})

const selectedSet = computed(() => {
  if (props.multiple) {
    return new Set(Array.isArray(props.modelValue) ? props.modelValue : [])
  }
  return new Set(typeof props.modelValue === 'string' && props.modelValue ? [props.modelValue] : [])
})

function isOn(option: SettingTagOption): boolean {
  return selectedSet.value.has(option.value)
}

function onClick(option: SettingTagOption): void {
  if (props.disabled) return
  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const idx = current.indexOf(option.value)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else if (current.length < props.max) {
      current.push(option.value)
    }
    emit('update:modelValue', current)
    return
  }
  emit('update:modelValue', option.value)
}
</script>

<template>
  <div class="tags">
    <span class="label">{{ label }}</span>
    <button
      v-for="o in items"
      :key="o.value"
      type="button"
      class="tag"
      :class="{ on: isOn(o), 'has-desc': !!o.desc }"
      :disabled="disabled"
      :title="o.desc"
      @click="onClick(o)"
    >
      {{ o.label }}
      <span v-if="o.desc" class="desc">{{ o.desc }}</span>
    </button>
  </div>
</template>

<style scoped>
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 10px;
}
.label {
  font-size: 12px;
  color: var(--nc-text-muted);
  margin-right: 4px;
  width: 100%;
}
.tag {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--nc-border);
  background: var(--nc-bg-base);
  color: var(--nc-text-muted);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.tag.has-desc {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.tag .desc {
  font-size: 10px;
  opacity: 0.75;
}
.tag.on {
  border-color: var(--nc-accent);
  color: var(--nc-text-primary);
}
.tag:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
