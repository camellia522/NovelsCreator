import { parseMemoryPatchFromRaw } from '../../../../utils/memory-patch-parse'

/** N5 · 从 LLM 原始 text 解析 memory_patch */
export function runN5ParseNode(kwargs: Record<string, unknown>): {
  memory_patch: Record<string, unknown>
  memory_patch_json: string
} {
  const raw =
    kwargs.memory_patch != null && kwargs.memory_patch !== '' && kwargs.memory_patch !== '{}'
      ? kwargs.memory_patch
      : kwargs.text
  const parsed = parseMemoryPatchFromRaw(raw)
  const patch = (parsed ?? {}) as Record<string, unknown>
  return {
    memory_patch: patch,
    memory_patch_json: JSON.stringify(patch)
  }
}
