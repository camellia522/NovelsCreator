import type { GenerateKnowledgeOptions } from '../../src/types/api'
import { getCurrentProject } from './project.service'
import { readKnowledge } from './project-files.service'
import { serializeChapterKnowledgeSnapshot } from '../utils/chapter-knowledge-snapshot'
import { prepareKnowledgeForOutline } from '@/utils/outline-preflight'
import {
  formatOutlineGenreForDify,
  resolveOutlineGenreTone
} from '@/utils/outline-preflight'
import { readWorldSettingFields } from '@/utils/world-setting-catalog'

export async function buildKnowledgeGenerationPayload(options: GenerateKnowledgeOptions): Promise<{
  knowledge_brief: string
  existing_knowledge_snapshot: string
  genre: string
  tone: string
  era: string
  scene: string
  generation_mode: 'bootstrap' | 'expand'
}> {
  if (!getCurrentProject()) {
    throw new Error('未打开项目')
  }
  const knowledge = await readKnowledge()
  prepareKnowledgeForOutline(knowledge)
  const fields = readWorldSettingFields(knowledge.world, knowledge.map)
  const { genre, tone, era } = resolveOutlineGenreTone(knowledge, {
    genre: options.genre,
    tone: options.tone
  })

  return {
    knowledge_brief: options.knowledge_brief?.trim() ?? '',
    existing_knowledge_snapshot: serializeChapterKnowledgeSnapshot(knowledge),
    genre: formatOutlineGenreForDify(knowledge, genre),
    tone,
    era,
    scene: fields.scene,
    generation_mode: options.generation_mode ?? 'expand'
  }
}
