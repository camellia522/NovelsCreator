import { toRaw } from 'vue'

/** Electron IPC 只能传递可 structured clone 的纯数据，需去掉 Vue/Pinia 响应式代理 */
export function cloneForIpc<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(toRaw(value))) as T
  } catch (err) {
    const hint = err instanceof Error ? err.message : String(err)
    throw new Error(`无法序列化 IPC 数据：${hint}`)
  }
}
