import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** 原子写入 JSON；Windows 下先删目标再 rename，失败则直写 */
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const content = JSON.stringify(data, null, 2)
  const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`
  await writeFile(tmp, content, 'utf-8')
  try {
    await rm(path, { force: true })
    await rename(tmp, path)
  } catch {
    await writeFile(path, content, 'utf-8')
    await rm(tmp, { force: true })
  }
}

/** 按 key 串行执行，避免并发 flush 竞态 */
export function createSerializedQueue<T extends string>() {
  const chains = new Map<T, Promise<void>>()

  return (key: T, task: () => Promise<void>): Promise<void> => {
    const prev = chains.get(key) ?? Promise.resolve()
    const next = prev.then(task, task).finally(() => {
      if (chains.get(key) === next) chains.delete(key)
    })
    chains.set(key, next)
    return next
  }
}
