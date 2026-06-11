import { readFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { app } from 'electron'
import { MemorySaver } from '@langchain/langgraph-checkpoint'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { Checkpoint, CheckpointMetadata } from '@langchain/langgraph-checkpoint'
import { createSerializedQueue, writeJsonAtomic } from '../utils/atomic-json-write'

type MemoryStorage = Record<string, Record<string, Record<string, unknown>>>
type MemoryWrites = Record<string, Record<string, unknown>>

const loadedThreads = new Set<string>()
const enqueueFlush = createSerializedQueue<string>()

function checkpointsDir(): string {
  return join(app.getPath('userData'), 'assistant-sessions', 'checkpoints')
}

function checkpointFile(threadId: string): string {
  return join(checkpointsDir(), `${threadId}.json`)
}

/** MemorySaver + 按 thread 落盘，重启后恢复 LangGraph 对话状态 */
export class PersistingMemorySaver extends MemorySaver {
  private storageRef(): MemoryStorage {
    return (this as unknown as { storage: MemoryStorage }).storage
  }

  private writesRef(): MemoryWrites {
    return (this as unknown as { writes: MemoryWrites }).writes
  }

  private collectWritesForThread(threadId: string): MemoryWrites {
    const out: MemoryWrites = {}
    for (const [key, value] of Object.entries(this.writesRef())) {
      try {
        const parsed = JSON.parse(key) as [string, string, string]
        if (parsed[0] === threadId) out[key] = value
      } catch {
        /* ignore malformed keys */
      }
    }
    return out
  }

  private async ensureLoaded(threadId: string): Promise<void> {
    if (loadedThreads.has(threadId)) return
    loadedThreads.add(threadId)
    try {
      const raw = JSON.parse(await readFile(checkpointFile(threadId), 'utf-8')) as {
        storage?: MemoryStorage[string]
        writes?: MemoryWrites
      }
      if (raw.storage) {
        this.storageRef()[threadId] = raw.storage
      }
      if (raw.writes) {
        Object.assign(this.writesRef(), raw.writes)
      }
    } catch {
      /* 新 thread */
    }
  }

  private async flushThreadUnsafe(threadId: string): Promise<void> {
    const storage = this.storageRef()[threadId]
    const writes = this.collectWritesForThread(threadId)
    if (!storage && !Object.keys(writes).length) return
    await writeJsonAtomic(checkpointFile(threadId), {
      version: 1,
      threadId,
      storage: storage ?? {},
      writes
    })
  }

  private flushThread(threadId: string): Promise<void> {
    return enqueueFlush(threadId, async () => {
      try {
        await this.flushThreadUnsafe(threadId)
      } catch (err) {
        console.warn('[assistant-checkpoint] flush failed:', err)
      }
    })
  }

  override async getTuple(config: RunnableConfig) {
    const threadId = config.configurable?.thread_id as string | undefined
    if (threadId) await this.ensureLoaded(threadId)
    return super.getTuple(config)
  }

  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ) {
    const result = await super.put(config, checkpoint, metadata)
    const threadId = config.configurable?.thread_id as string | undefined
    if (threadId) await this.flushThread(threadId)
    return result
  }

  override async putWrites(
    config: RunnableConfig,
    writes: [string, unknown][],
    taskId: string
  ) {
    await super.putWrites(config, writes, taskId)
    const threadId = config.configurable?.thread_id as string | undefined
    if (threadId) await this.flushThread(threadId)
    return
  }

  override async deleteThread(threadId: string) {
    await super.deleteThread(threadId)
    loadedThreads.delete(threadId)
    await rm(checkpointFile(threadId), { force: true })
  }
}
