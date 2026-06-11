/** 小说助手 Tool 的人类可读标签（主进程与 UI 共用） */

/** 确认框 / 活动详情预览最大字符数 */
export const ASSISTANT_PREVIEW_MAX_CHARS = 100

export function truncateAssistantPreview(text: string, max = ASSISTANT_PREVIEW_MAX_CHARS): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

export const ASSISTANT_TOOL_LABELS: Record<string, string> = {
  load_project_context: '加载项目完整上下文',
  get_worldview: '读取完整世界观',
  get_full_knowledge: '读取完整设定库',
  get_full_outline: '读取完整大纲',
  get_full_plot_memory: '读取完整剧情记忆',
  list_locations: '列出地点',
  list_characters: '列出人物',
  get_project_summary: '读取项目信息',
  get_knowledge_snapshot: '读取设定库摘要',
  get_outline_excerpt: '读取大纲',
  get_plot_memory: '读取剧情记忆',
  get_chapter_preview: '预览章节',
  read_chapter_text: '读取章节正文',
  read_character: '读取人物设定',
  list_open_foreshadowing: '检索未回收伏笔',
  write_chapter_text: '写入章节正文/视频稿',
  patch_outline_chapter: '修改大纲节拍',
  update_character: '更新人物设定',
  update_characters: '批量更新人物',
  patch_knowledge: '写入 knowledge.json',
  batch: '批量写入操作',
  update_plot_memory: '更新剧情记忆',
  generate_chapter: 'AI 生成章节',
  generate_outline: 'AI 生成大纲',
  generate_knowledge: 'AI 扩展知识库',
  generate_society: '生成社会层',
  write_todos: '更新任务计划',
  task: '委派子任务',
  ls: '列出虚拟文件',
  glob: '搜索虚拟文件',
  read_file: '读取虚拟文件',
  write_file: '写入虚拟文件',
  edit_file: '编辑虚拟文件',
  grep: '搜索虚拟文件内容'
}

export const ASSISTANT_TOOL_FILES: Record<string, string> = {
  load_project_context: 'knowledge.json + outline.json + plot-memory.json',
  get_worldview: 'knowledge.json',
  get_full_knowledge: 'knowledge.json',
  get_full_outline: 'outline.json',
  get_full_plot_memory: 'plot-memory.json',
  list_locations: 'knowledge.json',
  list_characters: 'knowledge.json',
  get_knowledge_snapshot: 'knowledge.json',
  get_outline_excerpt: 'outline.json',
  get_plot_memory: 'plot-memory.json',
  read_chapter_text: 'chapters/{id}/novel.txt',
  read_character: 'knowledge.json',
  write_chapter_text: 'chapters/{id}/novel.txt',
  patch_outline_chapter: 'outline.json',
  patch_knowledge: 'knowledge.json',
  update_character: 'knowledge.json',
  update_characters: 'knowledge.json',
  update_plot_memory: 'plot-memory.json'
}

function asRecord(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object') return undefined
  return input as Record<string, unknown>
}

function resolveFileHint(toolName: string, input: unknown): string | undefined {
  const pattern = ASSISTANT_TOOL_FILES[toolName]
  if (!pattern) return undefined
  const args = asRecord(input)
  const chapterId = args?.chapterId ?? args?.chapter_id
  if (chapterId && pattern.includes('{id}')) {
    return pattern.replace('{id}', String(chapterId))
  }
  return pattern
}

function formatInputDetail(toolName: string, input: unknown): string {
  const args = asRecord(input)
  if (!args) return ''

  switch (toolName) {
    case 'get_outline_excerpt':
    case 'patch_outline_chapter': {
      const vol = args.volumeId ?? args.volume_id ?? 'vol-01'
      const ch = args.chapterId ?? args.chapter_id
      const beats = args.beats
      const beatCount = Array.isArray(beats) ? beats.length : undefined
      const parts = [vol, ch].filter(Boolean).join(' / ')
      return beatCount !== undefined ? `${parts} · ${beatCount} 节拍` : parts
    }
    case 'read_chapter_text':
    case 'write_chapter_text':
    case 'generate_chapter':
      return String(args.chapterId ?? args.chapter_id ?? '')
    case 'read_character':
    case 'update_character':
      return String(args.characterId ?? args.character_id ?? args.name ?? '')
    case 'update_characters': {
      const updates = args.updates
      if (Array.isArray(updates) && updates.length) {
        const ids = updates
          .map((u) => {
            const row = u as Record<string, unknown>
            return String(row.characterId ?? row.character_id ?? '')
          })
          .filter(Boolean)
        const head = ids.slice(0, 4).join(', ')
        return `${updates.length} 人${head ? `：${head}` : ''}${ids.length > 4 ? '…' : ''}`
      }
      return '批量人物'
    }
    case 'generate_outline':
      return String(args.volumeId ?? args.volume_id ?? 'vol-01')
    case 'generate_knowledge': {
      const brief = args.knowledge_brief ?? args.knowledgeBrief
      const mode = args.generation_mode ?? args.generationMode ?? 'expand'
      if (typeof brief === 'string' && brief.trim()) {
        const excerpt = brief.trim().slice(0, 120)
        return `${mode} · ${excerpt}${brief.length > 120 ? '…' : ''}`
      }
      return String(mode)
    }
    case 'patch_knowledge': {
      const parts: string[] = []
      if (Array.isArray(args.characters) && args.characters.length) {
        parts.push(`${args.characters.length} 人物`)
      }
      if (Array.isArray(args.factions) && args.factions.length) {
        parts.push(`${args.factions.length} 势力`)
      }
      if (Array.isArray(args.items) && args.items.length) {
        parts.push(`${args.items.length} 道具`)
      }
      if (args.world && typeof args.world === 'object') parts.push('world')
      return parts.join('、') || 'knowledge.json'
    }
    default:
      break
  }

  const file = resolveFileHint(toolName, input)
  return file ?? ''
}

export function formatAssistantToolActivity(
  toolName: string,
  input: unknown,
  phase: 'start' | 'end' | 'error' | 'waiting'
): { label: string; detail: string; fileHint?: string } {
  const base = ASSISTANT_TOOL_LABELS[toolName] ?? toolName
  const detailRaw = formatInputDetail(toolName, input)
  const detail = detailRaw ? truncateAssistantPreview(detailRaw) : ''
  const fileHint = resolveFileHint(toolName, input)

  if (phase === 'waiting') {
    return {
      label: `等待确认 · ${base}`,
      detail: detail || fileHint || '',
      fileHint
    }
  }
  if (phase === 'end') {
    return {
      label: `已完成 · ${base}`,
      detail: detail || fileHint || '',
      fileHint
    }
  }
  if (phase === 'error') {
    return {
      label: `失败 · ${base}`,
      detail: detail || fileHint || '',
      fileHint
    }
  }

  const verb = fileHint?.includes('chapters/') ? '读取' : fileHint ? '读取' : '调用'
  const writeTools = new Set([
    'write_chapter_text',
    'patch_outline_chapter',
    'patch_knowledge',
    'update_character',
    'update_characters',
    'update_plot_memory',
    'generate_chapter',
    'generate_outline',
    'generate_knowledge',
    'generate_society'
  ])
  const action = writeTools.has(toolName) ? '写入' : verb

  return {
    label: fileHint ? `${action} ${fileHint}` : base,
    detail,
    fileHint
  }
}
