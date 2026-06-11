/** 按项目路径串行化 JSON 读写的可重入异步互斥锁 */

type LockState = {
  depth: number
  tail: Promise<void>
}

const locks = new Map<string, LockState>()

function getState(key: string): LockState {
  let state = locks.get(key)
  if (!state) {
    state = { depth: 0, tail: Promise.resolve() }
    locks.set(key, state)
  }
  return state
}

export function projectFilesLockKey(rootPath: string): string {
  return `${rootPath}::project-files`
}

export async function withProjectFilesLock<T>(rootPath: string, fn: () => Promise<T>): Promise<T> {
  const key = projectFilesLockKey(rootPath)
  const state = getState(key)

  if (state.depth > 0) {
    state.depth += 1
    try {
      return await fn()
    } finally {
      state.depth -= 1
    }
  }

  const prev = state.tail
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  state.tail = prev.then(() => gate)

  await prev
  state.depth = 1
  try {
    return await fn()
  } finally {
    state.depth = 0
    release()
  }
}
