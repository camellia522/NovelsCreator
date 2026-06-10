import { useEditorStore } from '@/stores/editor.store'
import { useKnowledgeStore } from '@/stores/knowledge.store'
import { useMemoryStore } from '@/stores/memory.store'
import { useOutlineStore } from '@/stores/outline.store'

let flushing: Promise<void> | null = null

/** 已关闭自动保存；保留空实现以免各 store 的 markDirty 调用报错 */
export function scheduleProjectPersist(_delayMs?: number): void {
  /* 仅手动保存：由侧栏/工具栏「保存」按钮或 flushProjectPersist 显式触发 */
}

/** 立即将所有未落盘更改写入项目文件夹（手动保存或生成章节前同步） */
export async function flushProjectPersist(): Promise<void> {
  if (flushing) return flushing

  flushing = (async () => {
    if (!window.novelsCreator) return
    const outline = useOutlineStore()
    const knowledge = useKnowledgeStore()
    const memory = useMemoryStore()
    const editor = useEditorStore()

    await Promise.all([
      outline.saveIfDirty(),
      knowledge.saveIfDirty(),
      memory.saveIfDirty(),
      editor.saveAll()
    ])
  })()

  try {
    await flushing
  } finally {
    flushing = null
  }
}
