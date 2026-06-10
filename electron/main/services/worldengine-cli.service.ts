import { app } from 'electron'
import { spawn } from 'node:child_process'
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import type { WorldGenConfig } from '../../src/types/world-gen'
import { clampWorldPlates, numPlatesForScale, normalizeWorldSeed, resolveProjectRoot, worldEngineDimensions } from '../utils/world-engine-params'

export interface WorldEngineNativePayload {
  ok: boolean
  error?: string
  worldengineVersion?: string
  worldName?: string
  seed?: number
  width?: number
  height?: number
  numPlates?: number
  seaLevel?: number
  files?: {
    world?: string
    map?: string
    biome?: string
    satellite?: string | null
    elevation?: string | null
  }
  terrainCells?: Array<{ x: number; y: number; terrain: string; climate?: string }>
}

export interface WorldEngineCheckResult {
  ok: boolean
  installed: boolean
  pythonPath?: string
  worldengineVersion?: string
  error?: string
}

function bundledPythonCandidates(): string[] {
  if (!app.isPackaged) return []
  const root = path.join(process.resourcesPath, 'python')
  if (process.platform === 'win32') {
    return [path.join(root, 'python.exe'), path.join(root, 'Scripts', 'python.exe')]
  }
  return [path.join(root, 'bin', 'python'), path.join(root, 'python.exe')]
}

function bundledPythonRoot(pythonExe: string): string | null {
  if (!app.isPackaged) return null
  const bundledRoot = path.join(process.resourcesPath, 'python')
  const normExe = path.normalize(pythonExe)
  const normRoot = path.normalize(bundledRoot)
  if (normExe.startsWith(normRoot)) return normRoot
  return null
}

function scriptsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts')
  }
  const root = resolveProjectRoot(app.getAppPath())
  return path.join(root, 'scripts')
}

function scriptPath(): string {
  return path.join(scriptsDir(), 'worldengine_generate.py')
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function isWindowsAppsStub(p: string): boolean {
  return /\\WindowsApps\\/i.test(p.replace(/\//g, '\\'))
}

async function testPythonExe(exe: string): Promise<boolean> {
  if (!(await pathExists(exe))) return false
  return new Promise((resolve) => {
    const proc = spawn(exe, ['--version'], { shell: false })
    let out = ''
    proc.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.stderr.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.on('error', () => resolve(false))
    proc.on('close', (code) => resolve(code === 0 || /Python 3\.\d+/i.test(out)))
  })
}

async function resolveViaPyLauncher(): Promise<string | null> {
  for (const flag of ['-3.12', '-3.11', '-3.10', '-3.9', '-3']) {
    const exe = await new Promise<string | null>((resolve) => {
      const proc = spawn('py', [flag, '-c', 'import sys; print(sys.executable)'], {
        shell: process.platform === 'win32'
      })
      let out = ''
      proc.stdout.on('data', (d: Buffer) => {
        out += d.toString()
      })
      proc.on('error', () => resolve(null))
      proc.on('close', (code) => {
        const line = out.trim().split(/\r?\n/).pop()?.trim()
        resolve(code === 0 && line ? line : null)
      })
    })
    if (exe && !isWindowsAppsStub(exe) && (await testPythonExe(exe))) return exe
  }
  return null
}

async function scanWindowsPythonPaths(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  const { readdir } = await import('node:fs/promises')
  const bases = [
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python'),
    path.join(process.env.ProgramFiles ?? '', 'Python'),
    path.join(process.env['ProgramFiles(x86)'] ?? '', 'Python')
  ]
  for (const base of bases) {
    if (!(await pathExists(base))) continue
    try {
      const versions = await readdir(base)
      const sorted = versions.sort().reverse()
      for (const ver of sorted) {
        const exe = path.join(base, ver, 'python.exe')
        if (await testPythonExe(exe)) return exe
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

async function resolveViaCondaInfoBase(): Promise<string | null> {
  const exe = await new Promise<string | null>((resolve) => {
    const proc = spawn('conda', ['info', '--base'], { shell: process.platform === 'win32' })
    let out = ''
    proc.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.on('error', () => resolve(null))
    proc.on('close', (code) => {
      const base = out.trim().split(/\r?\n/).pop()?.trim()
      resolve(code === 0 && base ? path.join(base, 'python.exe') : null)
    })
  })
  if (exe && (await testPythonExe(exe))) return exe
  return null
}

async function scanAnacondaPaths(): Promise<string | null> {
  if (process.env.CONDA_PREFIX) {
    const exe = path.join(process.env.CONDA_PREFIX, 'python.exe')
    if (await testPythonExe(exe)) return exe
  }

  const fromConda = await resolveViaCondaInfoBase()
  if (fromConda) return fromConda

  const roots = [
    process.env.USERPROFILE,
    process.env.LOCALAPPDATA,
    process.env.ProgramData
  ].filter(Boolean) as string[]

  const names = [
    'anaconda3',
    'Anaconda3',
    'miniconda3',
    'Miniconda3',
    'miniforge3',
    'Miniforge3',
    'mambaforge',
    'Mambaforge'
  ]

  for (const root of roots) {
    for (const name of names) {
      const exe = path.join(root, name, 'python.exe')
      if (await testPythonExe(exe)) return exe
    }
  }

  return null
}

const PYTHON_HELP_DEV =
  '未找到已安装 WorldEngine 的 Python。在 Anaconda Prompt 中运行 scripts/setup-worldengine.ps1 ' +
  '（会自动用 conda-forge 安装 noise）。Python 路径通常为 scripts\\.conda-env\\python.exe 或 ' +
  'scripts\\.venv\\Scripts\\python.exe'

const PYTHON_HELP_PACKAGED =
  '内置 WorldEngine 环境不可用。请重新安装 NovelsCreator，或联系发行方。' +
  '（开发模式可运行 npm run build:python 后重试打包）'

function pythonHelpMessage(): string {
  return app.isPackaged ? PYTHON_HELP_PACKAGED : PYTHON_HELP_DEV
}

async function resolvePython(): Promise<string | null> {
  const envPy = process.env.WORLDENGINE_PYTHON?.trim().replace(/^"|"$/g, '')
  if (envPy && !isWindowsAppsStub(envPy) && (await testPythonExe(envPy))) return envPy

  for (const bundled of bundledPythonCandidates()) {
    if (await testPythonExe(bundled)) return bundled
  }

  const devScripts = path.join(resolveProjectRoot(app.getAppPath()), 'scripts')
  const condaEnvPy = path.join(devScripts, '.conda-env', 'python.exe')
  if (await testPythonExe(condaEnvPy)) return condaEnvPy

  const condaEnvPyWin = path.join(devScripts, '.conda-env', 'Scripts', 'python.exe')
  if (await testPythonExe(condaEnvPyWin)) return condaEnvPyWin

  const condaEnvPyUnix = path.join(devScripts, '.conda-env', 'bin', 'python')
  if (await testPythonExe(condaEnvPyUnix)) return condaEnvPyUnix

  const venvPy = path.join(devScripts, '.venv', 'Scripts', 'python.exe')
  if (await testPythonExe(venvPy)) return venvPy

  const venvPyUnix = path.join(devScripts, '.venv', 'bin', 'python')
  if (await testPythonExe(venvPyUnix)) return venvPyUnix

  const anaconda = await scanAnacondaPaths()
  if (anaconda) return anaconda

  const fromPy = await resolveViaPyLauncher()
  if (fromPy) return fromPy

  const scanned = await scanWindowsPythonPaths()
  if (scanned) return scanned

  for (const cmd of ['python3', 'python']) {
    const found = await new Promise<string | null>((resolve) => {
      const proc = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd], {
        shell: true
      })
      let out = ''
      proc.stdout.on('data', (d: Buffer) => {
        out += d.toString()
      })
      proc.on('error', () => resolve(null))
      proc.on('close', () => {
        const first = out
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find(Boolean)
        resolve(first ?? null)
      })
    })
    if (found && !isWindowsAppsStub(found) && (await testPythonExe(found))) return found
  }
  return null
}

function pythonSpawnEnv(python: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8'
  }
  const root = bundledPythonRoot(python)
  if (root) {
    env.CONDA_PREFIX = root
    const binDir =
      process.platform === 'win32' ? path.join(root, 'Scripts') : path.join(root, 'bin')
    env.PATH = `${binDir}${path.delimiter}${env.PATH ?? ''}`
  }
  return env
}

function runPython(
  python: string,
  args: string[],
  timeoutMs = 600_000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(python, args, {
      shell: false,
      windowsHide: true,
      env: pythonSpawnEnv(python)
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`WorldEngine 超时（>${timeoutMs / 1000}s）`))
    }, timeoutMs)

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

function parseJsonLine(stdout: string): WorldEngineNativePayload {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]) as WorldEngineNativePayload
    } catch {
      /* try previous line */
    }
  }
  throw new Error(`WorldEngine 无 JSON 输出: ${stdout.slice(0, 400)}`)
}

export async function checkWorldEngineInstall(): Promise<WorldEngineCheckResult> {
  const py = await resolvePython()
  if (!py) {
    return {
      ok: false,
      installed: false,
      error: pythonHelpMessage()
    }
  }
  if (!(await pathExists(scriptPath()))) {
    return { ok: false, installed: false, pythonPath: py, error: `缺少脚本 ${scriptPath()}` }
  }

  try {
    const { code, stdout, stderr } = await runPython(
      py,
      [
        scriptPath(),
        '--check',
        '--seed',
        '1',
        '--name',
        'check',
        '--width',
        '512',
        '--height',
        '256',
        '--output-dir',
        app.getPath('temp')
      ],
      120_000
    )
    if (code !== 0) {
      let errMsg = stderr || `退出码 ${code}`
      try {
        const payload = parseJsonLine(stdout)
        if (payload.error) errMsg = payload.error
      } catch {
        /* ignore */
      }
      return { ok: false, installed: false, pythonPath: py, error: errMsg }
    }
    const payload = parseJsonLine(stdout)
    return {
      ok: true,
      installed: true,
      pythonPath: py,
      worldengineVersion: payload.worldengineVersion
    }
  } catch (err) {
    return {
      ok: false,
      installed: false,
      pythonPath: py,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

function slimNativePayload(payload: WorldEngineNativePayload): WorldEngineNativePayload {
  return {
    ok: payload.ok,
    worldengineVersion: payload.worldengineVersion,
    worldName: payload.worldName,
    seed: payload.seed,
    width: payload.width,
    height: payload.height,
    numPlates: payload.numPlates,
    seaLevel: payload.seaLevel,
    terrainCells: payload.terrainCells
  }
}

function cachedMapPath(): string {
  return path.join(app.getPath('temp'), 'novels-creator', 'last-world-map.png')
}

export async function readCachedMapAsBytes(filePath: string): Promise<Uint8Array> {
  const png = await readFile(filePath)
  return new Uint8Array(png)
}

export async function readCachedMapAsDataUrl(filePath: string): Promise<string> {
  const png = await readFile(filePath)
  return `data:image/png;base64,${png.toString('base64')}`
}

export async function runNativeWorldEngine(
  config: WorldGenConfig
): Promise<
  | { ok: true; payload: WorldEngineNativePayload; mapFilePath: string }
  | { ok: false; error: string }
> {
  const py = await resolvePython()
  if (!py) {
    return {
      ok: false,
      error: pythonHelpMessage()
    }
  }
  if (!(await pathExists(scriptPath()))) {
    return { ok: false, error: `缺少 ${scriptPath()}` }
  }

  const seed = normalizeWorldSeed(config.seed)
  const { width, height } = worldEngineDimensions(config.scale)
  const plates = clampWorldPlates(config.numPlates ?? numPlatesForScale(config.scale))
  const safeName = config.worldName.replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 48) || 'world'

  const tmpDir = await mkdtemp(path.join(app.getPath('temp'), 'nc-we-'))

  try {
    const args = [
      scriptPath(),
      '--seed',
      String(seed),
      '--name',
      safeName,
      '--width',
      String(width),
      '--height',
      String(height),
      '--plates',
      String(plates),
      '--output-dir',
      tmpDir,
      '--satellite'
    ]

    const { code, stdout, stderr } = await runPython(py, args)
    const payload = parseJsonLine(stdout)
    if (code !== 0 || !payload.ok) {
      return { ok: false, error: payload.error ?? (stderr || `WorldEngine 失败 (${code})`) }
    }

    const mapFile = payload.files?.map
    if (!mapFile) return { ok: false, error: 'WorldEngine 未返回地图文件' }

    const cachePath = cachedMapPath()
    await mkdir(path.dirname(cachePath), { recursive: true })
    await copyFile(mapFile, cachePath)

    return { ok: true, payload: slimNativePayload(payload), mapFilePath: cachePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
