import { dialog } from 'electron'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getCurrentProject } from './project.service'
import { readChapterText, readOutline } from './project-files.service'

async function chapterTextFileExists(
  rootPath: string,
  volumeId: string,
  chapterId: string,
  kind: 'novel' | 'video'
): Promise<string | null> {
  const file = kind === 'novel' ? 'novel.txt' : 'video-script.txt'
  const primary = join(rootPath, 'chapters', volumeId, chapterId, file)
  try {
    await access(primary)
    return primary
  } catch {
    /* try other vol dirs */
  }
  const chaptersRoot = join(rootPath, 'chapters')
  try {
    const vols = await readdir(chaptersRoot, { withFileTypes: true })
    for (const ent of vols) {
      if (!ent.isDirectory()) continue
      const path = join(chaptersRoot, ent.name, chapterId, file)
      try {
        await access(path)
        return path
      } catch {
        /* continue */
      }
    }
  } catch {
    /* chapters root missing */
  }
  return null
}

export async function exportChapter(
  chapterId: string,
  exportType: 'novel' | 'video' | 'both',
  format: 'txt' | 'md'
): Promise<{ ok: boolean; message: string; path?: string }> {
  const project = getCurrentProject()
  if (!project) {
    return { ok: false, message: '未打开项目' }
  }

  const ext = format === 'md' ? '.md' : '.txt'
  const defaultName =
    exportType === 'novel'
      ? `${chapterId}-novel${ext}`
      : exportType === 'video'
        ? `${chapterId}-video${ext}`
        : `${chapterId}-export${ext}`

  const save = await dialog.showSaveDialog({
    title: '导出章节',
    defaultPath: join(project.rootPath, 'exports', defaultName),
    filters: [{ name: '文本', extensions: [format === 'md' ? 'md' : 'txt'] }]
  })

  if (save.canceled || !save.filePath) {
    return { ok: false, message: '已取消' }
  }

  let content = ''
  if (exportType === 'novel' || exportType === 'both') {
    const novel = await readChapterText(chapterId, 'novel')
    content += `# ${chapterId} 正文\n\n${novel}\n`
  }
  if (exportType === 'video' || exportType === 'both') {
    const video = await readChapterText(chapterId, 'video')
    if (content) content += '\n---\n\n'
    content += `# ${chapterId} 视频脚本\n\n${video}\n`
  }

  if (!content.trim()) {
    return { ok: false, message: '章节内容为空，请先生成或编辑' }
  }

  await writeFile(save.filePath, content, 'utf-8')
  return { ok: true, message: `已导出至 ${save.filePath}`, path: save.filePath }
}

export async function exportChapterToProjectExports(
  chapterId: string
): Promise<{ ok: boolean; message: string }> {
  const project = getCurrentProject()
  if (!project) return { ok: false, message: '未打开项目' }

  const destDir = join(project.rootPath, 'exports', chapterId)
  await mkdir(destDir, { recursive: true })

  try {
    const novel = await readChapterText(chapterId, 'novel')
    if (!novel.trim()) {
      return { ok: false, message: '正文为空，请先生成' }
    }
    await writeFile(join(destDir, 'novel.txt'), novel, 'utf-8')
    try {
      const video = await readChapterText(chapterId, 'video')
      if (video.trim()) {
        await writeFile(join(destDir, 'video-script.txt'), video, 'utf-8')
      }
    } catch {
      /* video optional */
    }
    return { ok: true, message: `已复制到 exports/${chapterId}/` }
  } catch {
    return { ok: false, message: '读取章节失败' }
  }
}

export async function exportFullBook(
  exportType: 'novel' | 'video',
  format: 'txt' | 'md'
): Promise<{
  ok: boolean
  message: string
  path?: string
  chapterCount?: number
  skipped?: string[]
}> {
  const project = getCurrentProject()
  if (!project) {
    return { ok: false, message: '未打开项目' }
  }

  const ext = format === 'md' ? '.md' : '.txt'
  const label = exportType === 'novel' ? '正文' : '视频脚本'
  const defaultName = `${project.name}-${label}-全本${ext}`

  const save = await dialog.showSaveDialog({
    title: `导出全本${label}`,
    defaultPath: join(project.rootPath, 'exports', defaultName),
    filters: [{ name: '文本', extensions: [format === 'md' ? 'md' : 'txt'] }]
  })

  if (save.canceled || !save.filePath) {
    return { ok: false, message: '已取消' }
  }

  const outline = await readOutline()
  const parts: string[] = []
  const skipped: string[] = []
  let chapterCount = 0
  const exportedAt = new Date().toISOString()
  const kind = exportType === 'novel' ? 'novel' : 'video'

  if (format === 'md') {
    parts.push(`---\nnovel: ${project.name}\ntype: ${exportType}\nexportedAt: ${exportedAt}\n---\n\n`)
  }

  for (const vol of outline.volumes ?? []) {
    const volTitle = vol.title?.trim() || vol.id
    parts.push(format === 'md' ? `\n# ${volTitle}\n\n` : `\n\n=== ${volTitle} ===\n\n`)

    for (const ch of vol.chapters ?? []) {
      const filePath = await chapterTextFileExists(project.rootPath, vol.id, ch.id, kind)
      if (!filePath) {
        skipped.push(ch.id)
        continue
      }
      const body = (await readFile(filePath, 'utf-8')).trim()
      if (!body) {
        skipped.push(ch.id)
        continue
      }
      const chTitle = ch.title?.trim() || ch.id
      parts.push(format === 'md' ? `\n## ${chTitle}\n\n${body}\n` : `\n\n## ${chTitle}\n\n${body}\n`)
      chapterCount += 1
    }
  }

  if (chapterCount === 0) {
    return {
      ok: false,
      message: skipped.length
        ? `无可用${label}：${skipped.join(', ')} 均缺失或为空`
        : `大纲中无章节，或尚无${label}文件`
    }
  }

  const content = parts.join('').trimStart() + '\n'
  await writeFile(save.filePath, content, 'utf-8')

  let message = `已导出 ${chapterCount} 章${label}至 ${save.filePath}`
  if (skipped.length) {
    message += `（跳过 ${skipped.length} 章：${skipped.join(', ')}）`
  }

  return {
    ok: true,
    message,
    path: save.filePath,
    chapterCount,
    skipped: skipped.length ? skipped : undefined
  }
}
