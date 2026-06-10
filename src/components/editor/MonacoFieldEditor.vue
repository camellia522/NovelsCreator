<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { monaco } from '@/monaco/editor'
import { applyMonacoTheme, defineNovelsCreatorThemes } from '@/monaco/theme'
import { useConfigStore } from '@/stores/config.store'
import { monacoThemeName } from '@/utils/apply-theme'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    minHeight?: number
    lineNumbers?: boolean | null
  }>(),
  {
    placeholder: '',
    minHeight: 120,
    lineNumbers: null
  }
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const config = useConfigStore()
const { editorFontSize, editorLineNumbers, effectiveTheme } = storeToRefs(config)

const showLineNumbers = computed(() =>
  props.lineNumbers != null ? props.lineNumbers : editorLineNumbers.value
)
const fieldFontSize = computed(() => Math.max(11, editorFontSize.value - 2))

const container = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let suppressChange = false

function setEditorValue(value: string): void {
  if (!editor) return
  if (editor.getValue() === value) return
  suppressChange = true
  editor.setValue(value)
  suppressChange = false
}

function applyEditorPrefs(): void {
  if (!editor) return
  applyMonacoTheme(effectiveTheme.value)
  const lh = Math.round(fieldFontSize.value * 1.5)
  editor.updateOptions({
    fontSize: fieldFontSize.value,
    lineHeight: lh,
    lineNumbers: showLineNumbers.value ? 'on' : 'off'
  })
}

onMounted(() => {
  defineNovelsCreatorThemes()
  applyMonacoTheme(effectiveTheme.value)
  if (!container.value) return

  const lh = Math.round(fieldFontSize.value * 1.5)
  editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: 'plaintext',
    theme: monacoThemeName(effectiveTheme.value),
    automaticLayout: true,
    wordWrap: 'on',
    lineNumbers: showLineNumbers.value ? 'on' : 'off',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontFamily: 'JetBrains Mono, Consolas, monospace',
    fontSize: fieldFontSize.value,
    lineHeight: lh,
    padding: { top: 8, bottom: 8 },
    folding: false,
    renderLineHighlight: 'line',
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8
    },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false
  })

  editor.onDidChangeModelContent(() => {
    if (suppressChange || !editor) return
    emit('update:modelValue', editor.getValue())
  })
})

watch([effectiveTheme, editorFontSize, editorLineNumbers, showLineNumbers], () => {
  applyEditorPrefs()
})

watch(
  () => props.modelValue,
  (val) => {
    setEditorValue(val)
  }
)

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})
</script>

<template>
  <div
    ref="container"
    class="monaco-field"
    :style="{ minHeight: `${minHeight}px` }"
    :data-placeholder="placeholder || undefined"
  />
</template>

<style scoped>
.monaco-field {
  width: 100%;
  border: 1px solid var(--nc-border);
  border-radius: var(--nc-radius-sm);
  overflow: hidden;
  background: var(--nc-bg-base);
  transition: border-color var(--nc-transition-fast);
}
.monaco-field:focus-within {
  border-color: var(--nc-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--nc-accent) 18%, transparent);
}
</style>
