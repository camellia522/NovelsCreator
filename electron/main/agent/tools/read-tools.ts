import { tool } from 'langchain'
import { z } from 'zod'
import {
  buildChapterKnowledgeSnapshot,
  serializeChapterKnowledgeSnapshot
} from '../../utils/chapter-knowledge-snapshot'
import { buildKnowledgeAnchorBrief } from '../../utils/outline-plot-memory'
import { prepareKnowledgeForOutline } from '../../../../src/utils/outline-preflight'
import { readKnowledge, readOutline, readPlotMemory } from '../../services/project-files.service'
import { createProjectAssert, type NovelAssistantToolDeps } from './deps'
import type { KnowledgeDocument } from '../../../../src/types/project'

const MAX_JSON_CHARS = 48_000
const LOCATION_SAMPLE = 40

function sampleWorldviewFromKnowledge(knowledge: KnowledgeDocument) {
  const snapshot = buildChapterKnowledgeSnapshot(knowledge)
  const total = snapshot.locations.length
  if (total <= LOCATION_SAMPLE) return snapshot
  return {
    ...snapshot,
    locations: snapshot.locations.slice(0, LOCATION_SAMPLE),
    locationSampleNote: `仅展示前 ${LOCATION_SAMPLE} 个地点（共 ${total} 个）；完整列表请调用 list_locations`
  }
}

async function readPreparedKnowledge() {
  const knowledge = await readKnowledge()
  prepareKnowledgeForOutline(knowledge)
  return knowledge
}

function truncateJson(text: string, label: string): string {
  if (text.length <= MAX_JSON_CHARS) return text
  return `${text.slice(0, MAX_JSON_CHARS)}\n\n…（${label} 已截断，共 ${text.length} 字符；可用分节工具读取）`
}

export function buildReadTools(deps: NovelAssistantToolDeps) {
  const assertProject = createProjectAssert(deps.projectId)

  const loadProjectContext = tool(
    async ({ includeOutline, includePlotMemory }) => {
      const project = assertProject()
      const knowledge = await readPreparedKnowledge()
      const worldview = {
        settingAnchorBrief: buildKnowledgeAnchorBrief(knowledge),
        ...sampleWorldviewFromKnowledge(knowledge)
      }

      const payload: Record<string, unknown> = {
        project: {
          id: project.id,
          name: project.name,
          videoPlatformTemplate: project.settings.videoPlatformTemplate ?? 'generic-v1'
        },
        worldview,
        stats: {
          nationCount: knowledge.map?.nations?.length ?? 0,
          locationCount: knowledge.locations?.length ?? 0,
          regionCount: knowledge.map?.regions?.length ?? 0,
          characterCount: knowledge.characters?.length ?? 0,
          factionCount: knowledge.factions?.length ?? 0,
          itemCount: knowledge.items?.length ?? 0
        }
      }

      if (includeOutline !== false) {
        payload.outline = await readOutline()
      }
      if (includePlotMemory !== false) {
        payload.plotMemory = await readPlotMemory()
      }

      return truncateJson(JSON.stringify(payload, null, 2), '项目上下文')
    },
    {
      name: 'load_project_context',
      description:
        '一次性加载项目全部创作上下文：项目信息、完整世界观（world/国家/区域/地点/人物/势力/道具/设定锚点）、大纲、剧情记忆。分析设定或规划创作时**应优先调用**。',
      schema: z.object({
        includeOutline: z.boolean().optional().describe('是否包含完整大纲，默认 true'),
        includePlotMemory: z.boolean().optional().describe('是否包含完整剧情记忆，默认 true')
      })
    }
  )

  const getWorldview = tool(
    async () => {
      assertProject()
      const knowledge = await readPreparedKnowledge()
      const payload = {
        settingAnchorBrief: buildKnowledgeAnchorBrief(knowledge),
        ...sampleWorldviewFromKnowledge(knowledge)
      }
      return truncateJson(JSON.stringify(payload, null, 2), '世界观')
    },
    {
      name: 'get_worldview',
      description:
        '读取完整世界观与设定库：world 全部字段、设定锚点/硬性约束、国家、区域、全部地点、人物、势力、道具、地图元信息。涉及世界规则/地图/社会结构时**必须调用**。',
      schema: z.object({})
    }
  )

  const getFullKnowledge = tool(
    async () => {
      assertProject()
      const knowledge = await readPreparedKnowledge()
      return truncateJson(serializeChapterKnowledgeSnapshot(knowledge), '设定库')
    },
    {
      name: 'get_full_knowledge',
      description: '读取与工作流一致的完整 knowledge 快照（JSON，剔除 hexGrid 等巨型字段）',
      schema: z.object({})
    }
  )

  const getFullOutline = tool(
    async () => {
      assertProject()
      const outline = await readOutline()
      return truncateJson(JSON.stringify(outline, null, 2), '大纲')
    },
    {
      name: 'get_full_outline',
      description: '读取完整 outline.json（所有卷与章节节拍）',
      schema: z.object({})
    }
  )

  const getFullPlotMemory = tool(
    async () => {
      assertProject()
      const memory = await readPlotMemory()
      return truncateJson(JSON.stringify(memory, null, 2), '剧情记忆')
    },
    {
      name: 'get_full_plot_memory',
      description: '读取完整 plot-memory.json（全局摘要、全部章摘要、伏笔、出场人物）',
      schema: z.object({})
    }
  )

  const listLocations = tool(
    async ({ nationId, limit }) => {
      assertProject()
      const knowledge = await readPreparedKnowledge()
      let locations = knowledge.locations ?? []
      if (nationId) {
        locations = locations.filter((l) => l.nationId === nationId)
      }
      const max = limit ?? locations.length
      const slice = locations.slice(0, max)
      return JSON.stringify(
        {
          total: locations.length,
          returned: slice.length,
          locations: slice
        },
        null,
        2
      )
    },
    {
      name: 'list_locations',
      description: '列出地点详情（可按国家过滤）；默认返回全部',
      schema: z.object({
        nationId: z.string().optional().describe('过滤国家 id'),
        limit: z.number().int().min(1).max(500).optional()
      })
    }
  )

  const listCharacters = tool(
    async () => {
      assertProject()
      const knowledge = await readPreparedKnowledge()
      return JSON.stringify(knowledge.characters ?? [], null, 2)
    },
    {
      name: 'list_characters',
      description: '列出全部人物设定（完整 JSON 数组）',
      schema: z.object({})
    }
  )

  return [
    loadProjectContext,
    getWorldview,
    getFullKnowledge,
    getFullOutline,
    getFullPlotMemory,
    listLocations,
    listCharacters
  ]
}
