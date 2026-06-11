import { ipcMain } from 'electron'
import type {
  GenerateChapterOptions,
  GenerateKnowledgeOptions,
  GenerateOutlineOptions
} from '../../src/types/api'
import {
  handleGenerateChapter,
  handleGenerateKnowledge,
  handleGenerateOutline
} from './ai-generation.handlers'

export function registerAiIpc(): void {
  ipcMain.handle('ai:generateChapter', handleGenerateChapter)
  ipcMain.handle('ai:generateOutline', handleGenerateOutline)
  ipcMain.handle('ai:generateKnowledge', handleGenerateKnowledge)

  // Legacy aliases (deprecated, remove in v1.1)
  ipcMain.handle('dify:generateChapter', (_e, options: GenerateChapterOptions) =>
    handleGenerateChapter(_e, options)
  )
  ipcMain.handle('dify:generateOutline', (event, options: GenerateOutlineOptions) =>
    handleGenerateOutline(event, options)
  )
  ipcMain.handle('dify:generateKnowledge', (_e, options: GenerateKnowledgeOptions) =>
    handleGenerateKnowledge(_e, options)
  )
}
