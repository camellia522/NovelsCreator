import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

declare global {
  // eslint-disable-next-line no-var
  var MonacoEnvironment: { getWorker: () => Worker } | undefined
}

globalThis.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  }
}

export {}
