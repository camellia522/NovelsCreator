import { tool } from 'langchain'
import { z } from 'zod'
import type {
  ChapterStatus,
  KnowledgeCharacter,
  OutlineBeat,
  PlotMemoryDocument
} from '../../../../src/types/project'
import { notifyAssistantProjectMutated } from '../project-mutate-notify'
import {
  formatSyncReportAppend,
  syncProjectAfterAssistantEdit
} from '../../services/project-consistency.service'
import {
  mergeKnowledgeDocument,
  parseKnowledgeJson,
  validateMergedKnowledge
} from '../../../../src/utils/knowledge-dify-merge'
import { prepareKnowledgeForOutline } from '../../../../src/utils/outline-preflight'
import { refreshWorldSettingConstraints } from '../../../../src/utils/world-setting-catalog'
import {
  mutateKnowledge,
  readChapterText,
  readKnowledge,
  readOutline,
  readPlotMemory,
  saveChapterText,
  saveOutline,
  savePlotMemory
} from '../../services/project-files.service'
import { createProjectAssert, type NovelAssistantToolDeps } from './deps'

async function finishWrite(
  message: string,
  syncOpts?: { chapterIdForAppearedScan?: string; novelBodyForAppearedScan?: string }
): Promise<string> {
  const report = await syncProjectAfterAssistantEdit(syncOpts)
  notifyAssistantProjectMutated()
  return message + formatSyncReportAppend(report)
}

function nextEntityId(prefix: string, existing: { id: string }[], reserved: Set<string>): string {
  let max = 0
  for (const id of [...existing.map((e) => e.id), ...reserved]) {
    const m = id.match(new RegExp(`^${prefix}-(\\d+)$`, 'i'))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  let n = max + 1
  while (reserved.has(`${prefix}-${String(n).padStart(3, '0')}`)) n += 1
  const id = `${prefix}-${String(n).padStart(3, '0')}`
  reserved.add(id)
  return id
}

function ensurePatchEntityIds<T extends { id: string }>(
  incoming: T[],
  existing: T[],
  prefix: string
): T[] {
  const reserved = new Set(existing.map((e) => e.id))
  return incoming.map((item) => {
    if (item.id?.trim() && !reserved.has(item.id)) {
      reserved.add(item.id)
      return item
    }
    if (item.id?.trim() && reserved.has(item.id)) {
      return item
    }
    return { ...item, id: nextEntityId(prefix, existing, reserved) }
  })
}

function applyCharacterFields(
  ch: KnowledgeCharacter,
  fields: {
    name?: string
    role?: string
    traits?: string[]
    personality?: string | null
    appearance?: string | null
    notes?: string | null
  }
): void {
  if (fields.name?.trim()) ch.name = fields.name.trim()
  if (fields.role?.trim()) ch.role = fields.role.trim()
  if (fields.traits?.length) ch.traits = fields.traits.map((t) => t.trim()).filter(Boolean)
  if (fields.personality != null) ch.personality = fields.personality
  if (fields.appearance != null) ch.appearance = fields.appearance
  if (fields.notes != null) ch.notes = fields.notes
}

const characterUpdateFieldsSchema = z.object({
  characterId: z.string().describe('人物 id，如 char-001'),
  name: z.string().optional(),
  role: z.string().optional().describe('如 主角、配角'),
  traits: z.array(z.string()).optional(),
  personality: z.string().optional(),
  appearance: z.string().optional(),
  notes: z.string().optional()
})

export function buildWriteTools(deps: NovelAssistantToolDeps) {
  const assertProject = createProjectAssert(deps.projectId)

  const readChapterTextTool = tool(
    async ({ chapterId, kind, maxChars }) => {
      assertProject()
      const text = await readChapterText(chapterId, kind)
      if (!text.trim()) return `${chapterId} 的 ${kind} 为空或不存在`
      const limit = maxChars ?? 8000
      if (text.length <= limit) return text
      return `${text.slice(0, limit)}\n\n…（已截断，共 ${text.length} 字，可用 write 修改全文）`
    },
    {
      name: 'read_chapter_text',
      description: '读取章节正文或视频稿全文（只读）',
      schema: z.object({
        chapterId: z.string().describe('章 id，如 ch-001'),
        kind: z.enum(['novel', 'video']).default('novel').describe('novel=正文，video=视频稿'),
        maxChars: z.number().int().min(500).max(50000).optional().describe('最大返回字符数')
      })
    }
  )

  const writeChapterTextTool = tool(
    async ({ chapterId, kind, mode, content }) => {
      assertProject()
      const existing = await readChapterText(chapterId, kind)
      let next = content
      if (mode === 'append') {
        next = existing.trim() ? `${existing.trimEnd()}\n\n${content}` : content
      }
      await saveChapterText(chapterId, kind, next)
      return finishWrite(
        `已${mode === 'append' ? '追加' : '写入'} ${chapterId} ${kind === 'novel' ? '正文' : '视频稿'}（${next.length} 字）。`,
        kind === 'novel'
          ? { chapterIdForAppearedScan: chapterId, novelBodyForAppearedScan: next }
          : undefined
      )
    },
    {
      name: 'write_chapter_text',
      description: '写入或追加章节正文/视频稿（需用户确认；写后自动同步知识库与剧情记忆）',
      schema: z.object({
        chapterId: z.string(),
        kind: z.enum(['novel', 'video']).default('novel'),
        mode: z.enum(['replace', 'append']).default('replace').describe('replace=覆盖全文，append=追加'),
        content: z.string().min(1).describe('要写入的正文内容')
      })
    }
  )

  const patchOutlineChapterTool = tool(
    async ({ volumeId, chapterId, title, status, beats }) => {
      assertProject()
      const outline = await readOutline()
      const vol = outline.volumes?.find((v) => v.id === volumeId)
      if (!vol) return `未找到卷 ${volumeId}`
      const ch = vol.chapters?.find((c) => c.id === chapterId)
      if (!ch) return `卷 ${volumeId} 中未找到章 ${chapterId}`

      if (title?.trim()) ch.title = title.trim()
      if (status) ch.status = status as ChapterStatus
      if (beats?.length) {
        ch.beats = beats.map(
          (text, i): OutlineBeat => ({
            order: i + 1,
            text: text.trim()
          })
        ).filter((b) => b.text)
      }

      await saveOutline(outline)
      return finishWrite(
        `已更新大纲 ${volumeId}/${chapterId}（标题=${ch.title}，节拍 ${ch.beats?.length ?? 0} 条）。`
      )
    },
    {
      name: 'patch_outline_chapter',
      description: '修改大纲中某章的标题、状态或节拍列表（需用户确认；写后同步剧情记忆）',
      schema: z.object({
        volumeId: z.string().default('vol-01'),
        chapterId: z.string(),
        title: z.string().optional(),
        status: z.enum(['draft', 'generating', 'generated', 'published']).optional(),
        beats: z.array(z.string()).optional().describe('节拍文本列表，按顺序覆盖')
      })
    }
  )

  const updateCharacterTool = tool(
    async ({ characterId, name, role, traits, personality, appearance, notes }) => {
      assertProject()
      try {
        const knowledge = await mutateKnowledge((doc) => {
          const idx = doc.characters.findIndex((c) => c.id === characterId)
          if (idx < 0) {
            throw new Error(
              `未找到人物 ${characterId}，现有：${doc.characters.map((c) => c.id).join(', ') || '无'}`
            )
          }
          applyCharacterFields(doc.characters[idx], {
            name,
            role,
            traits,
            personality,
            appearance,
            notes
          })
        })
        const ch = knowledge.characters.find((c) => c.id === characterId)
        return finishWrite(`已更新人物 ${characterId}（${ch?.name ?? ''}）。`)
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
    {
      name: 'update_character',
      description:
        '更新**单个**已有人物（需用户确认）。**禁止**一次调用多个；批量更新必须用 update_characters 或 patch_knowledge。',
      schema: characterUpdateFieldsSchema
    }
  )

  const updateCharactersTool = tool(
    async ({ updates }) => {
      assertProject()
      if (!updates?.length) return 'updates 不能为空'
      const updated: string[] = []
      const missing: string[] = []
      try {
        await mutateKnowledge((doc) => {
          prepareKnowledgeForOutline(doc)
          refreshWorldSettingConstraints(doc.world, doc.map)
          for (const u of updates) {
            const idx = doc.characters.findIndex((c) => c.id === u.characterId)
            if (idx < 0) {
              missing.push(u.characterId)
              continue
            }
            applyCharacterFields(doc.characters[idx], u)
            updated.push(u.characterId)
          }
          if (!updated.length) {
            throw new Error(
              `未找到任何人物：${missing.join(', ')}；现有：${doc.characters.map((c) => c.id).join(', ') || '无'}`
            )
          }
        })
        const missLine = missing.length ? `；未找到 ${missing.join(', ')}` : ''
        return finishWrite(`已批量更新 ${updated.length} 个人物：${updated.join(', ')}${missLine}`)
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
    {
      name: 'update_characters',
      description:
        '**批量**更新多个人物的外貌/特质等，一次确认、一次落盘（需用户确认）。补充多人设定时**必须优先**用此工具或 patch_knowledge。',
      schema: z.object({
        updates: z.array(characterUpdateFieldsSchema).min(1).max(50)
      })
    }
  )

  const readCharacterTool = tool(
    async ({ characterId }) => {
      assertProject()
      const knowledge = await readKnowledge()
      const ch = knowledge.characters.find((c) => c.id === characterId)
      if (!ch) return `未找到人物 ${characterId}`
      return JSON.stringify(ch, null, 2)
    },
    {
      name: 'read_character',
      description: '读取单个人物完整 JSON（只读）',
      schema: z.object({ characterId: z.string() })
    }
  )

  const characterPatchSchema = z.object({
    id: z.string().optional().describe('已有 id 则更新；省略则自动分配 char-NNN'),
    name: z.string().min(1),
    role: z.string().optional(),
    traits: z.array(z.string()).optional(),
    personality: z.string().optional(),
    appearance: z.string().optional(),
    notes: z.string().optional(),
    locationId: z.string().optional()
  })

  const factionPatchSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    goals: z.string().optional()
  })

  const itemPatchSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional()
  })

  const patchKnowledgeTool = tool(
    async ({ characters, factions, items, world, merge_mode }) => {
      assertProject()
      const hasWorld = world && Object.keys(world).length > 0
      if (!characters?.length && !factions?.length && !items?.length && !hasWorld) {
        return '未提供任何要写入的内容（characters / factions / items / world 至少一项）'
      }

      let parts = ''
      try {
        await mutateKnowledge((doc) => {
          const parsed = parseKnowledgeJson(
            JSON.stringify({
              knowledge: {
                world: world ?? {},
                characters: characters ?? [],
                factions: factions ?? [],
                items: items ?? []
              }
            })
          )
          if (!parsed) throw new Error('参数无法解析为有效设定结构')

          parsed.characters = ensurePatchEntityIds(
            parsed.characters,
            doc.characters ?? [],
            'char'
          )
          parsed.factions = ensurePatchEntityIds(parsed.factions, doc.factions ?? [], 'faction')
          parsed.items = ensurePatchEntityIds(parsed.items, doc.items ?? [], 'item')

          const mode = merge_mode ?? 'expand'
          const merged = mergeKnowledgeDocument(doc, parsed, mode)
          prepareKnowledgeForOutline(merged)
          refreshWorldSettingConstraints(merged.world, merged.map)

          const validation = validateMergedKnowledge(merged)
          if (!validation.ok) {
            throw new Error(`写入校验失败：${validation.errors.join('；')}`)
          }

          doc.world = merged.world
          doc.characters = merged.characters
          doc.factions = merged.factions
          doc.items = merged.items
          doc.map = merged.map
          doc.locations = merged.locations

          parts = [
            parsed.characters.length ? `${parsed.characters.length} 人物` : '',
            parsed.factions.length ? `${parsed.factions.length} 势力` : '',
            parsed.items.length ? `${parsed.items.length} 道具` : '',
            hasWorld ? 'world 字段' : ''
          ]
            .filter(Boolean)
            .join('、')
        })
        return finishWrite(`已直接写入 knowledge.json（${parts}）。`)
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
    {
      name: 'patch_knowledge',
      description:
        '将人物/势力/道具/world 字段直接合并写入 knowledge.json（需用户确认）。用户已给出结构化设定时优先用此工具；需 AI 扩写时用 generate_knowledge。',
      schema: z.object({
        characters: z.array(characterPatchSchema).optional(),
        factions: z.array(factionPatchSchema).optional(),
        items: z.array(itemPatchSchema).optional(),
        world: z
          .record(z.string())
          .optional()
          .describe('world 部分字段，如 rules、title、magicConstraint'),
        merge_mode: z
          .enum(['expand', 'bootstrap'])
          .optional()
          .describe('expand=按 id 合并/新增（默认）；bootstrap=同 id 覆盖')
      })
    }
  )

  const updatePlotMemoryTool = tool(
    async ({ globalSummary, chapterId, chapterSummary, chapterKeyEvents }) => {
      assertProject()
      const memory: PlotMemoryDocument = await readPlotMemory()
      if (globalSummary != null) memory.globalSummary = globalSummary

      if (chapterId && chapterSummary != null) {
        const idx = memory.chapterSummaries.findIndex((s) => s.chapterId === chapterId)
        const entry = idx >= 0 ? memory.chapterSummaries[idx] : {
          chapterId,
          title: chapterId,
          summary: '',
          keyEvents: [],
          characterStates: [],
          openThreads: []
        }
        entry.summary = chapterSummary
        if (chapterKeyEvents?.length) entry.keyEvents = chapterKeyEvents
        entry.updatedAt = new Date().toISOString()
        if (idx >= 0) memory.chapterSummaries[idx] = entry
        else memory.chapterSummaries.push(entry)
        memory.chapterSummaries.sort((a, b) => a.chapterId.localeCompare(b.chapterId))
      }

      await savePlotMemory(memory)
      return finishWrite('已更新剧情记忆。')
    },
    {
      name: 'update_plot_memory',
      description: '更新全局摘要或某章摘要（需用户确认；写后同步校验）',
      schema: z.object({
        globalSummary: z.string().optional(),
        chapterId: z.string().optional(),
        chapterSummary: z.string().optional(),
        chapterKeyEvents: z.array(z.string()).optional()
      })
    }
  )

  return [
    readChapterTextTool,
    readCharacterTool,
    writeChapterTextTool,
    patchOutlineChapterTool,
    patchKnowledgeTool,
    updateCharactersTool,
    updateCharacterTool,
    updatePlotMemoryTool
  ]
}
