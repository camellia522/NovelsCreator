import { ipcMain } from 'electron'
import type {
  GenerateChapterOptions,
  KnowledgeDocument,
  OutlineDocument,
  PlotMemoryDocument
} from '../../src/types/project'
import {
  readChapterText,
  readKnowledge,
  readMapImageDataUrl,
  readMapImagePath,
  readOutline,
  readPlotMemory,
  saveChapterText,
  saveKnowledge,
  saveOutline,
  savePlotMemory,
  deleteChapterAssets
} from '../services/project-files.service'
import { backfillChapterSummaryById, backfillMissingSummaries } from '../services/memory.service'
import {
  promoteAppearedCharactersToKnowledge,
  scanAppearedCharactersAfterChapter
} from '../services/appeared-characters.service'

export function registerProjectFilesIpc(): void {
  ipcMain.handle('project:getOutline', async () => readOutline())
  ipcMain.handle('project:saveOutline', async (_e, doc: OutlineDocument) => {
    await saveOutline(doc)
    return doc
  })

  ipcMain.handle('project:getKnowledge', async () => readKnowledge())
  ipcMain.handle('project:getMapImage', async () => readMapImageDataUrl())
  ipcMain.handle('project:getMapImagePath', async () => readMapImagePath())
  ipcMain.handle('project:saveKnowledge', async (_e, doc: KnowledgeDocument) => {
    await saveKnowledge(doc)
    return doc
  })

  ipcMain.handle('project:getPlotMemory', async () => readPlotMemory())
  ipcMain.handle('project:savePlotMemory', async (_e, doc: PlotMemoryDocument) => {
    await savePlotMemory(doc)
    return doc
  })

  ipcMain.handle(
    'project:getChapterText',
    async (_e, chapterId: string, kind: 'novel' | 'video') => readChapterText(chapterId, kind)
  )
  ipcMain.handle(
    'project:saveChapterText',
    async (_e, chapterId: string, kind: 'novel' | 'video', content: string) => {
      await saveChapterText(chapterId, kind, content)
    }
  )

  ipcMain.handle('project:backfillMissingSummaries', async () => backfillMissingSummaries())

  ipcMain.handle('project:backfillChapterSummary', async (_e, chapterId: string) => {
    const r = await backfillChapterSummaryById(chapterId)
    return {
      chapterId: r.chapterId,
      globalDeltaAdded: r.globalDeltaAdded,
      chapterSummaryUpdated: r.chapterSummaryUpdated,
      foreshadowingChanged: r.foreshadowingChanged
    }
  })

  ipcMain.handle(
    'project:scanAppearedCharacters',
    async (_e, chapterId: string, novelBody: string, memoryPatch?: unknown) =>
      scanAppearedCharactersAfterChapter(chapterId, novelBody, memoryPatch as never)
  )

  ipcMain.handle('project:promoteAppearedCharacters', async (_e, names: string[]) =>
    promoteAppearedCharactersToKnowledge(names)
  )

  ipcMain.handle('project:deleteChapterAssets', async (_e, chapterId: string) => {
    const deleted = await deleteChapterAssets(chapterId)
    return { ok: true, deleted }
  })
}

export type { GenerateChapterOptions }
