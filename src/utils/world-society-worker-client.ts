import type { WorldGenConfig, WorldGenResult } from '@/types/world-gen'
import { cloneForIpc } from '@/utils/ipc-serialize'
import type {
  SocietyWorkerRequest,
  SocietyWorkerResponse
} from '@/workers/world-society.worker'
import SocietyWorker from '@/workers/world-society.worker?worker'

let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) worker = new SocietyWorker()
  return worker
}

/** 在后台线程生成本地社会层与 Dify 用 territory_json */
export function computeSocietyInWorker(
  preview: WorldGenResult,
  config: WorldGenConfig
): Promise<SocietyWorkerResponse> {
  const payload: SocietyWorkerRequest = cloneForIpc({
    preview: {
      worldRules: preview.worldRules,
      map: preview.map,
      locations: preview.locations,
      nations: preview.nations
    },
    config
  })

  return new Promise((resolve, reject) => {
    const w = getWorker()
    const onMessage = (ev: MessageEvent<SocietyWorkerResponse & { error?: string }>) => {
      cleanup()
      if (ev.data && 'error' in ev.data && typeof ev.data.error === 'string') {
        reject(new Error(ev.data.error))
        return
      }
      resolve(ev.data)
    }
    const onError = (ev: ErrorEvent) => {
      cleanup()
      reject(ev.error ?? new Error(ev.message || '社会层 Worker 失败'))
    }
    const cleanup = () => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
    }
    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
    w.postMessage(payload)
  })
}
