import type { NovelsCreatorAPI } from '@/types/api'

declare global {
  interface Window {
    novelsCreator: NovelsCreatorAPI
    /** Electron 关闭窗口前调用，将未保存内容写入项目目录 */
    __ncFlushProject?: () => Promise<void>
  }
}

declare module '*?worker' {
  const WorkerFactory: new () => Worker
  export default WorkerFactory
}

export {}
