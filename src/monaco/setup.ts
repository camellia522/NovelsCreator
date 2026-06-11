import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import type { Environment } from 'monaco-editor'

globalThis.MonacoEnvironment = {
  getWorker(_workerId, _label) {
    return new editorWorker()
  }
} satisfies Environment

export {}
