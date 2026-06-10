import type { ChapterStatus } from '../../../src/types/project'
import { readOutline, saveOutline } from '../services/project-files.service'

/** 更新 outline.json 中指定章的状态（找不到则静默跳过） */
export async function setOutlineChapterStatus(
  chapterId: string,
  status: ChapterStatus
): Promise<boolean> {
  const doc = await readOutline()
  let changed = false
  for (const vol of doc.volumes ?? []) {
    for (const ch of vol.chapters ?? []) {
      if (ch.id === chapterId && ch.status !== status) {
        ch.status = status
        changed = true
        break
      }
    }
    if (changed) break
  }
  if (changed) await saveOutline(doc)
  return changed
}
