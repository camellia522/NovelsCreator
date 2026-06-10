<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { monaco } from '@/monaco/editor'
import { applyMonacoTheme, defineNovelsCreatorThemes } from '@/monaco/theme'
import { useConfigStore } from '@/stores/config.store'
import { monacoThemeName } from '@/utils/apply-theme'

const props = defineProps<{
  tabId: string
  resourceKey: string
  content: string
}>()

const emit = defineEmits<{ 'update:content': [value: string] }>()

const config = useConfigStore()
const { editorFontSize, editorLineNumbers, effectiveTheme } = storeToRefs(config)

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

function createOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    value: props.content,
    language: 'plaintext',
    theme: monacoThemeName(effectiveTheme.value),
    automaticLayout: true,
    wordWrap: 'on',
    lineNumbers: editorLineNumbers.value ? 'on' : 'off',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontFamily: 'JetBrains Mono, Consolas, monospace',
    fontSize: editorFontSize.value,
    lineHeight: Math.round(editorFontSize.value * 1.55),
    padding: { top: 12, bottom: 12 },
    folding: false,
    renderLineHighlight: 'line',
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10
    }
  }
}

function applyEditorPrefs(): void {
  if (!editor) return
  applyMonacoTheme(effectiveTheme.value)
  editor.updateOptions({
    fontSize: editorFontSize.value,
    lineHeight: Math.round(editorFontSize.value * 1.55),
    lineNumbers: editorLineNumbers.value ? 'on' : 'off'
  })
}

onMounted(() => {
  defineNovelsCreatorThemes()
  applyMonacoTheme(effectiveTheme.value)
  if (!container.value) return

  editor = monaco.editor.create(container.value, createOptions())

  editor.onDidChangeModelContent(() => {
    if (suppressChange || !editor) return
    emit('update:content', editor.getValue())
  })
})

watch([effectiveTheme, editorFontSize, editorLineNumbers], () => {
  applyEditorPrefs()
})

watch(
  () => props.tabId,
  () => {
    setEditorValue(props.content)
  }
)

watch(
  () => props.content,
  (val) => {
    setEditorValue(val)
  }
)

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})

function focus(): void {
  editor?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div ref="container" class="monaco-host" />
</template>

<style scoped>
.monaco-host {
  flex: 1;
  min-height: 0;
  width: 100%;
}
</style>
