import { createWriteStream } from 'node:fs'
import { access, cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { dialog } from 'electron'
import { getCurrentProject } from './project.service'
import { getPublicConfig, saveConfig } from './config.service'

const require = createRequire(import.meta.url)
const archiver = require('archiver') as typeof import('archiver')
const extract = require('extract-zip') as typeof import('extract-zip').default

const BACKUP_KEEP = 7
const AUTO_GEN_THRESHOLD = 5
const AUTO_DAILY_MS = 24 * 60 * 60 * 1000

export interface BackupEntry {
  name: string
  path: string
  mtime: string
  size: number
}

export interface BackupRunResult {
  ok: boolean
  message: string
  path?: string
  auto?: boolean
}

function backupTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

async function zipProjectDirectory(sourceDir: string, outPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.glob('**/*', {
      cwd: sourceDir,
      ignore: ['backups/**'],
      dot: true
    })
    void archive.finalize()
  })
}

async function rotateBackups(backupsDir: string, keep: number): Promise<void> {
  let entries: BackupEntry[] = []
  try {
    entries = await listBackupsInDir(backupsDir)
  } catch {
    return
  }
  for (const old of entries.slice(keep)) {
    try {
      await rm(old.path, { force: true })
    } catch {
      /* skip */
    }
  }
}

async function listBackupsInDir(backupsDir: string): Promise<BackupEntry[]> {
  const names = await readdir(backupsDir)
  const entries: BackupEntry[] = []
  for (const name of names) {
    if (!name.endsWith('.zip')) continue
    const path = join(backupsDir, name)
    const st = await stat(path)
    if (!st.isFile()) continue
    entries.push({
      name,
      path,
      mtime: st.mtime.toISOString(),
      size: st.size
    })
  }
  return entries.sort((a, b) => b.mtime.localeCompare(a.mtime))
}

async function clearProjectExceptBackups(rootPath: string): Promise<void> {
  const entries = await readdir(rootPath, { withFileTypes: true })
  for (const ent of entries) {
    if (ent.name === 'backups') continue
    await rm(join(rootPath, ent.name), { recursive: true, force: true })
  }
}

async function assertValidBackupRoot(dir: string): Promise<void> {
  const projectJson = join(dir, 'project.json')
  try {
    await access(projectJson)
  } catch {
    throw new Error('备份无效：缺少 project.json')
  }
}

/** 手动或自动 ZIP 备份当前项目（排除 backups/ 目录） */
export async function runProjectBackup(options?: {
  auto?: boolean
}): Promise<BackupRunResult> {
  const project = getCurrentProject()
  if (!project) {
    return { ok: false, message: '未打开项目' }
  }

  const backupsDir = join(project.rootPath, 'backups')
  await mkdir(backupsDir, { recursive: true })

  const fileName = `${backupTimestamp()}.zip`
  const zipPath = join(backupsDir, fileName)

  try {
    await zipProjectDirectory(project.rootPath, zipPath)
    await rotateBackups(backupsDir, BACKUP_KEEP)

    const config = await getPublicConfig()
    const autoBackup = config.autoBackup ?? { lastAt: {}, genSinceBackup: {} }
    autoBackup.lastAt ??= {}
    autoBackup.genSinceBackup ??= {}
    autoBackup.lastAt[project.rootPath] = new Date().toISOString()
    autoBackup.genSinceBackup[project.rootPath] = 0
    config.autoBackup = autoBackup
    await saveConfig(config)

    const prefix = options?.auto ? '已自动备份' : '已备份'
    return {
      ok: true,
      auto: options?.auto,
      message: `${prefix}至 backups/${fileName}`,
      path: zipPath
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `备份失败：${msg}` }
  }
}

export async function listProjectBackups(): Promise<BackupEntry[]> {
  const project = getCurrentProject()
  if (!project) return []
  const backupsDir = join(project.rootPath, 'backups')
  try {
    await mkdir(backupsDir, { recursive: true })
    return listBackupsInDir(backupsDir)
  } catch {
    return []
  }
}

/** 从 ZIP 恢复至当前项目目录（保留现有 backups/） */
export async function restoreProjectFromZip(zipPath: string): Promise<BackupRunResult> {
  const project = getCurrentProject()
  if (!project) {
    return { ok: false, message: '未打开项目' }
  }

  const tmpDir = join(tmpdir(), `nc-restore-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })

  try {
    await extract(zipPath, { dir: tmpDir })
    await assertValidBackupRoot(tmpDir)

    await clearProjectExceptBackups(project.rootPath)
    const entries = await readdir(tmpDir, { withFileTypes: true })
    for (const ent of entries) {
      if (ent.name === 'backups') continue
      await cp(join(tmpDir, ent.name), join(project.rootPath, ent.name), {
        recursive: true,
        force: true
      })
    }

    return { ok: true, message: `已从 ${basename(zipPath)} 恢复项目，请重新加载数据` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg.startsWith('备份无效') ? msg : `恢复失败：${msg}` }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

export async function pickAndRestoreBackup(): Promise<BackupRunResult> {
  const project = getCurrentProject()
  if (!project) {
    return { ok: false, message: '未打开项目' }
  }

  const pick = await dialog.showOpenDialog({
    title: '选择备份 ZIP',
    defaultPath: join(project.rootPath, 'backups'),
    filters: [{ name: 'ZIP 备份', extensions: ['zip'] }],
    properties: ['openFile']
  })

  if (pick.canceled || !pick.filePaths[0]) {
    return { ok: false, message: '已取消' }
  }

  return restoreProjectFromZip(pick.filePaths[0])
}

/** 每日首次打开项目时自动备份 */
export async function maybeAutoBackupOnProjectOpen(rootPath: string): Promise<BackupRunResult | null> {
  const config = await getPublicConfig()
  const autoBackup = config.autoBackup ?? { lastAt: {}, genSinceBackup: {} }
  const lastAt = autoBackup.lastAt?.[rootPath]
  if (lastAt) {
    const elapsed = Date.now() - new Date(lastAt).getTime()
    if (elapsed < AUTO_DAILY_MS) return null
  }

  const project = getCurrentProject()
  if (!project || project.rootPath !== rootPath) return null
  const result = await runProjectBackup({ auto: true })
  return result.ok ? result : null
}

/** 章节生成成功后累计次数，达阈值自动备份 */
export async function maybeAutoBackupAfterGeneration(): Promise<BackupRunResult | null> {
  const project = getCurrentProject()
  if (!project) return null

  const config = await getPublicConfig()
  const autoBackup = config.autoBackup ?? { lastAt: {}, genSinceBackup: {} }
  autoBackup.genSinceBackup ??= {}
  const prev = autoBackup.genSinceBackup[project.rootPath] ?? 0
  const next = prev + 1
  autoBackup.genSinceBackup[project.rootPath] = next
  config.autoBackup = autoBackup
  await saveConfig(config)

  if (next < AUTO_GEN_THRESHOLD) return null
  const result = await runProjectBackup({ auto: true })
  return result.ok ? result : null
}
