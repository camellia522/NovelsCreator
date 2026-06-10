import { dialog } from 'electron'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProjectMeta } from '../../src/types/api'
import { addRecentProject, removeRecentProject } from './config.service'
import { readKnowledge, readOutline, readPlotMemory } from './project-files.service'
import { serializeChapterKnowledgeSnapshot } from '../utils/chapter-knowledge-snapshot'
import {
  buildKnowledgeAnchorBrief,
  filterPlotMemoryForOutline,
  mergeOutlineBriefWithAnchor,
  syncPlotMemoryFromOutlineBeats
} from '../utils/outline-plot-memory'
import {
  formatOutlineGenreForDify,
  prepareKnowledgeForOutline,
  resolveOutlineGenreTone,
  validateKnowledgeForOutline
} from '@/utils/outline-preflight'
import { validateChapterGenerationPreflight } from '@/utils/chapter-preflight'
import {
  buildOpenForeshadowingHint,
  getPreviousChapterSummaryText
} from '@/utils/chapter-plot-memory'
import { collectOutlineChapterIds } from '../utils/outline-chapter-ids'
import { isPlaceholderChapter } from '../utils/outline-chapter-id'

let currentProject: ProjectMeta | null = null

const EMPTY_KNOWLEDGE = {
  world: { title: '新世界', rules: '' },
  characters: [],
  factions: [],
  items: []
}

const EMPTY_OUTLINE = {
  volumes: [
    {
      id: 'vol-01',
      title: '第一卷',
      chapters: [
        {
          id: 'ch-001',
          title: '第一章',
          status: 'draft',
          beats: [
            { order: 1, text: '开篇建立场景与主角状态' },
            { order: 2, text: '引入本章核心冲突' }
          ]
        }
      ]
    }
  ]
}

const EMPTY_MEMORY = {
  version: 1,
  globalSummary: '',
  chapterSummaries: [],
  foreshadowing: [],
  appearedCharacters: [] as import('../../src/types/project').AppearedCharacterEntry[]
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function scaffoldProject(rootPath: string, name: string): Promise<ProjectMeta> {
  await mkdir(join(rootPath, 'knowledge'), { recursive: true })
  await mkdir(join(rootPath, 'outline'), { recursive: true })
  await mkdir(join(rootPath, 'memory'), { recursive: true })
  await mkdir(join(rootPath, 'chapters', 'vol-01', 'ch-001'), { recursive: true })
  await mkdir(join(rootPath, 'exports'), { recursive: true })
  await mkdir(join(rootPath, 'backups'), { recursive: true })

  await writeJson(join(rootPath, 'knowledge', 'world.json'), EMPTY_KNOWLEDGE.world)
  await writeJson(join(rootPath, 'knowledge', 'characters.json'), { characters: [] })
  await writeJson(join(rootPath, 'knowledge', 'factions.json'), { factions: [] })
  await writeJson(join(rootPath, 'knowledge', 'items.json'), { items: [] })
  await writeJson(join(rootPath, 'knowledge', 'locations.json'), { locations: [] })
  await writeJson(join(rootPath, 'outline', 'outline.json'), EMPTY_OUTLINE)
  await writeJson(join(rootPath, 'memory', 'plot-memory.json'), EMPTY_MEMORY)

  const meta: ProjectMeta = {
    id: randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    rootPath,
    settings: {
      videoPlatformTemplate: 'generic-v1',
      dify: { workflowId: 'novel-chapter-generation-v1.1' }
    }
  }

  await writeJson(join(rootPath, 'project.json'), meta)
  return meta
}

export async function createProject(name: string, parentDir?: string): Promise<ProjectMeta> {
  const baseDir =
    parentDir ??
    (await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })).filePaths[0]
  if (!baseDir) {
    throw new Error('未选择项目目录')
  }

  const rootPath = join(baseDir, name)
  const meta = await scaffoldProject(rootPath, name)
  currentProject = meta
  await addRecentProject(rootPath)
  return meta
}

export async function openProject(rootPath: string): Promise<ProjectMeta> {
  const raw = await readFile(join(rootPath, 'project.json'), 'utf-8')
  const meta = JSON.parse(raw) as ProjectMeta
  meta.rootPath = rootPath
  currentProject = meta
  await addRecentProject(rootPath)
  return meta
}

export async function closeProject(): Promise<void> {
  currentProject = null
}

export async function deleteProject(
  rootPath: string
): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const normalized = rootPath.trim()
  if (!normalized) {
    return { ok: false, error: '无效路径' }
  }

  let hasProjectJson = true
  try {
    await access(join(normalized, 'project.json'))
  } catch {
    hasProjectJson = false
  }

  const folderName = basename(normalized)
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['取消', hasProjectJson ? '删除项目' : '从列表移除'],
    defaultId: 0,
    cancelId: 0,
    title: hasProjectJson ? '删除项目' : '移除最近项目',
    message: hasProjectJson
      ? `确定要永久删除「${folderName}」吗？`
      : `「${folderName}」文件夹已不存在，是否从最近列表中移除？`,
    detail: hasProjectJson
      ? `${normalized}\n\n此操作不可恢复。项目文件夹及所有章节、设定、备份将被删除。`
      : normalized
  })

  if (response !== 1) {
    return { ok: false, cancelled: true }
  }

  if (currentProject?.rootPath === normalized) {
    currentProject = null
  }

  try {
    if (hasProjectJson) {
      await rm(normalized, { recursive: true, force: true })
    }
    await removeRecentProject(normalized)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function getCurrentProject(): ProjectMeta | null {
  return currentProject
}

export async function pickDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

export async function pickOpenProject(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择小说项目文件夹（含 project.json）'
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

export async function saveGeneratedChapter(
  chapterId: string,
  novelBody: string,
  videoScript: string,
  meta: Record<string, unknown>
): Promise<void> {
  if (!currentProject) {
    throw new Error('未打开项目')
  }
  const chapterDir = join(currentProject.rootPath, 'chapters', 'vol-01', chapterId)
  await mkdir(chapterDir, { recursive: true })
  await writeFile(join(chapterDir, 'novel.txt'), novelBody, 'utf-8')
  await writeFile(join(chapterDir, 'video-script.txt'), videoScript, 'utf-8')
  await writeJson(join(chapterDir, 'meta.json'), meta)
}

function assertKnowledgeSnapshotForOutline(knowledgeSnapshot: string): void {
  let parsed: {
    world?: { title?: string; rules?: string }
    characters?: unknown[]
    nations?: unknown[]
    locations?: unknown[]
  }
  try {
    parsed = JSON.parse(knowledgeSnapshot)
  } catch {
    throw new Error('知识库快照无法序列化，请检查 knowledge 文件')
  }
  const hasWorld = Boolean(parsed.world?.title?.trim() || parsed.world?.rules?.trim())
  const entityCount =
    (parsed.characters?.length ?? 0) +
    (parsed.nations?.length ?? 0) +
    (parsed.locations?.length ?? 0)
  if (!hasWorld && entityCount === 0) {
    throw new Error(
      '知识库几乎为空：请先在「设定」中填写 world.rules，并保存至少 1 个角色或国家/地点后再生成大纲'
    )
  }
  if (knowledgeSnapshot.length < 80) {
    throw new Error(
      '知识库快照过短，Dify 可能收不到有效 knowledge_snapshot。请确认项目已保存且设定非空'
    )
  }
}

export async function buildGenerationPayload(
  chapterId: string,
  options?: { useOutlineBeats?: boolean; generation_prompt_text?: string }
): Promise<{
  outline_beats: string
  knowledge_snapshot: string
  plot_memory: string
  chapter_title: string
  previous_chapter_summary: string
  generation_prompt_text: string
}> {
  if (!currentProject) {
    throw new Error('未打开项目')
  }
  const outline = await readOutline()
  const memory = await readPlotMemory()
  const knowledge = await readKnowledge()
  prepareKnowledgeForOutline(knowledge)

  let chapterTitle = chapterId
  let beats: unknown[] = []
  for (const vol of outline.volumes ?? []) {
    for (const ch of vol.chapters ?? []) {
      if (ch.id === chapterId) {
        chapterTitle = ch.title
        beats = ch.beats ?? []
      }
    }
  }

  const useBeats = options?.useOutlineBeats !== false
  const outlineChapterIds = collectOutlineChapterIds(outline)
  let memoryForDify = syncPlotMemoryFromOutlineBeats(memory, outline, chapterId)
  memoryForDify = filterPlotMemoryForOutline(
    memoryForDify,
    chapterId,
    outlineChapterIds,
    true
  )

  const preflight = validateChapterGenerationPreflight(
    chapterId,
    outline,
    knowledge,
    memoryForDify,
    { useOutlineBeats: useBeats }
  )
  if (!preflight.ok) {
    throw new Error(preflight.errors.join('；'))
  }
  if (preflight.warnings.length) {
    console.warn('[chapter] preflight warnings:', preflight.warnings.join(' | '))
  }

  const knowledge_snapshot = serializeChapterKnowledgeSnapshot(knowledge)
  const previous_chapter_summary = getPreviousChapterSummaryText(
    memoryForDify,
    outline,
    chapterId
  )

  const anchor = buildKnowledgeAnchorBrief(knowledge)
  const fsHint = buildOpenForeshadowingHint(memoryForDify)
  let brief = mergeOutlineBriefWithAnchor(options?.generation_prompt_text?.trim() ?? '', anchor)
  if (fsHint) {
    brief = brief.trim() ? `${brief}\n\n${fsHint}` : fsHint
  }

  return {
    outline_beats: useBeats ? JSON.stringify(beats) : '[]',
    knowledge_snapshot,
    plot_memory: JSON.stringify(memoryForDify),
    chapter_title: chapterTitle,
    previous_chapter_summary,
    generation_prompt_text: brief
  }
}

export async function buildOutlineGenerationPayload(options?: {
  volume_id?: string
  chapters_to_generate?: number
  next_chapter_id?: string
  generation_mode?: 'single_chapter' | 'full'
  outline_brief?: string
  genre?: string
  tone?: string
  use_plot_memory?: boolean
}): Promise<{
  knowledge_snapshot: string
  plot_memory: string
  outline_brief: string
  target_volumes: string
  target_chapters: string
  genre: string
  tone: string
  volume_id: string
  next_chapter_id: string
  generation_mode: string
  existing_volume_outline: string
}> {
  if (!currentProject) {
    throw new Error('未打开项目')
  }
  const knowledge = await readKnowledge()
  prepareKnowledgeForOutline(knowledge)
  const preflight = validateKnowledgeForOutline(knowledge)
  if (!preflight.ok) {
    throw new Error(preflight.errors.join('；'))
  }
  if (preflight.warnings.length) {
    console.warn('[outline] preflight warnings:', preflight.warnings.join(' | '))
  }

  const memory = await readPlotMemory()
  const outline = await readOutline()

  const volumeId = options?.volume_id?.trim() || 'vol-01'
  const mode = options?.generation_mode ?? 'single_chapter'
  const vol = outline.volumes?.find((v) => v.id === volumeId)
  const canonicalChapters = (vol?.chapters ?? []).filter((ch) => !isPlaceholderChapter(ch))
  const existingVolumeOutline = vol
    ? JSON.stringify({ id: vol.id, title: vol.title, chapters: canonicalChapters })
    : JSON.stringify({ id: volumeId, title: volumeId, chapters: [] })

  const chaptersToGenerate = Math.max(1, options?.chapters_to_generate ?? 1)
  const usePlotMemory = options?.use_plot_memory !== false
  const nextChapterId = options?.next_chapter_id?.trim() ?? ''
  const outlineChapterIds = collectOutlineChapterIds(outline)
  let memoryForDify = memory
  if (usePlotMemory && nextChapterId && mode === 'single_chapter') {
    memoryForDify = syncPlotMemoryFromOutlineBeats(memory, outline, nextChapterId)
  }
  const filteredMemory = filterPlotMemoryForOutline(
    memoryForDify,
    nextChapterId,
    outlineChapterIds,
    usePlotMemory
  )
  const anchor = buildKnowledgeAnchorBrief(knowledge)
  const mergedBrief = mergeOutlineBriefWithAnchor(options?.outline_brief?.trim() ?? '', anchor)
  const knowledge_snapshot = serializeChapterKnowledgeSnapshot(knowledge)
  assertKnowledgeSnapshotForOutline(knowledge_snapshot)

  const { tone } = resolveOutlineGenreTone(knowledge, options)
  const genreForDify = formatOutlineGenreForDify(knowledge, options?.genre)

  return {
    knowledge_snapshot,
    plot_memory: JSON.stringify(filteredMemory),
    outline_brief: mergedBrief,
    target_volumes: '1',
    target_chapters: mode === 'single_chapter' ? '1' : String(chaptersToGenerate),
    genre: genreForDify,
    tone,
    volume_id: volumeId,
    next_chapter_id: nextChapterId,
    generation_mode: mode,
    existing_volume_outline: existingVolumeOutline
  }
}
