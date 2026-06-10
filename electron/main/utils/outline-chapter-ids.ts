import type { OutlineDocument } from '@/types/project'

export function collectOutlineChapterIds(doc: OutlineDocument | null | undefined): string[] {
  const ids: string[] = []
  for (const vol of doc?.volumes ?? []) {
    for (const ch of vol.chapters ?? []) {
      if (ch.id?.trim()) ids.push(ch.id.trim())
    }
  }
  return ids
}
