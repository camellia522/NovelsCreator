/**
 * Build portable Python env for electron-builder (resources/python).
 * Prefers conda-forge on Windows (prebuilt noise); falls back to venv + pip on Unix.
 *
 * Usage: node scripts/build-python-bundle.cjs [--force]
 * Env:   NC_USE_CONDA=1  force conda path
 *        NC_SKIP_IF_READY=1  skip when bundle already validates
 */
'use strict'

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const PYTHON_DIR = path.join(ROOT, 'resources', 'python')
const SCRIPTS_OUT = path.join(ROOT, 'resources', 'scripts')
const GEN_SCRIPT_SRC = path.join(__dirname, 'worldengine_generate.py')
const REQ_FILE = path.join(__dirname, 'requirements-worldengine.txt')
const FORCE = process.argv.includes('--force')
const SKIP_IF_READY = process.env.NC_SKIP_IF_READY === '1' || process.env.NC_SKIP_IF_READY === 'true'

function log(msg) {
  console.log(`[build-python-bundle] ${msg}`)
}

function fail(msg) {
  console.error(`[build-python-bundle] ERROR: ${msg}`)
  process.exit(1)
}

function run(exe, args, opts = {}) {
  log(`${exe} ${args.join(' ')}`)
  const r = spawnSync(exe, args, {
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    ...opts
  })
  if (r.error) fail(r.error.message)
  if (r.status !== 0) fail(`${exe} exited with ${r.status}`)
}

function runShell(command) {
  log(command)
  const r = spawnSync(command, {
    stdio: 'inherit',
    shell: true,
    windowsHide: true
  })
  if (r.error) fail(r.error.message)
  if (r.status !== 0) fail(`shell command exited with ${r.status}`)
}

function condaAvailable() {
  const r = spawnSync('conda', ['--version'], { shell: true, encoding: 'utf8' })
  return r.status === 0
}

function pythonExeInBundle() {
  if (process.platform === 'win32') {
    const root = path.join(PYTHON_DIR, 'python.exe')
    const scripts = path.join(PYTHON_DIR, 'Scripts', 'python.exe')
    if (fs.existsSync(root)) return root
    if (fs.existsSync(scripts)) return scripts
    return null
  }
  const unix = path.join(PYTHON_DIR, 'bin', 'python')
  if (fs.existsSync(unix)) return unix
  return null
}

function copyGenScript() {
  fs.mkdirSync(SCRIPTS_OUT, { recursive: true })
  fs.copyFileSync(GEN_SCRIPT_SRC, path.join(SCRIPTS_OUT, 'worldengine_generate.py'))
  log(`Copied worldengine_generate.py → ${SCRIPTS_OUT}`)
}

function verifyBundle(py) {
  const outDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'nc-we-verify-'))
  try {
    run(py, [
      path.join(SCRIPTS_OUT, 'worldengine_generate.py'),
      '--check',
      '--seed',
      '1',
      '--name',
      'bundle-check',
      '--width',
      '512',
      '--height',
      '256',
      '--output-dir',
      outDir
    ])
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDirSync(from, to)
    else fs.copyFileSync(from, to)
  }
}

function tryCopyDevCondaEnv() {
  const src = path.join(__dirname, '.conda-env')
  const srcPy = path.join(src, 'python.exe')
  if (!fs.existsSync(srcPy)) return false
  log('Copying scripts/.conda-env → resources/python (local dev fallback)')
  rmDir(PYTHON_DIR)
  copyDirSync(src, PYTHON_DIR)
  return true
}

function rmDir(dir) {
  if (fs.existsSync(dir)) {
    log(`Removing ${dir}`)
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function buildWithConda() {
  rmDir(PYTHON_DIR)
  fs.mkdirSync(path.dirname(PYTHON_DIR), { recursive: true })

  run('conda', [
    'create',
    '-y',
    '-p',
    PYTHON_DIR,
    '-c',
    'conda-forge',
    '--override-channels',
    'python=3.11',
    'pip',
    'setuptools',
    'wheel',
    'noise',
    'pillow'
  ])

  run('conda', ['run', '-p', PYTHON_DIR, 'python', '-m', 'pip', 'install', '-r', REQ_FILE])

  const py = pythonExeInBundle()
  if (!py) fail(`conda env created but python not found under ${PYTHON_DIR}`)
  return py
}

function resolveBasePython() {
  const candidates = []
  if (process.env.PYTHON) candidates.push(process.env.PYTHON)
  if (process.platform === 'win32') {
    for (const flag of ['-3.11', '-3.12', '-3.10', '-3']) {
      const r = spawnSync('py', [flag, '-c', 'import sys; print(sys.executable)'], {
        shell: true,
        encoding: 'utf8'
      })
      if (r.status === 0) {
        const line = r.stdout.trim().split(/\r?\n/).pop()?.trim()
        if (line) candidates.push(line)
      }
    }
  }
  for (const cmd of ['python3.11', 'python3', 'python']) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      shell: true,
      encoding: 'utf8'
    })
    if (r.status === 0) {
      const first = r.stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean)
      if (first) candidates.push(first)
    }
  }

  for (const exe of candidates) {
    if (!exe || exe.includes('WindowsApps')) continue
    const r = spawnSync(exe, ['--version'], { encoding: 'utf8' })
    if (r.status === 0 || /Python 3\.\d+/i.test(r.stdout + r.stderr)) return exe
  }
  return null
}

function buildWithVenv() {
  const base = resolveBasePython()
  if (!base) {
    fail(
      'Python 3.10+ not found. Install Python or Miniconda, or set NC_USE_CONDA=1 with conda in PATH.'
    )
  }

  rmDir(PYTHON_DIR)
  fs.mkdirSync(path.dirname(PYTHON_DIR), { recursive: true })

  const venvArgs = ['-m', 'venv']
  if (process.platform !== 'win32') venvArgs.push('--copies')
  venvArgs.push(PYTHON_DIR)
  run(base, venvArgs)

  const py = pythonExeInBundle()
  if (!py) fail(`venv created but python not found under ${PYTHON_DIR}`)

  run(py, ['-m', 'pip', 'install', '--upgrade', 'pip'])
  run(py, ['-m', 'pip', 'install', '-r', REQ_FILE])
  return py
}

function bundleReady() {
  copyGenScript()
  const py = pythonExeInBundle()
  if (!py) return false
  try {
    verifyBundle(py)
    return true
  } catch {
    return false
  }
}

function main() {
  copyGenScript()

  if (!FORCE && SKIP_IF_READY && bundleReady()) {
    log('Existing bundle OK (NC_SKIP_IF_READY); skipping rebuild.')
    return
  }

  if (!FORCE && !SKIP_IF_READY) {
    const py = pythonExeInBundle()
    if (py) {
      try {
        verifyBundle(py)
        log('Existing bundle validates; reuse (pass --force to rebuild).')
        return
      } catch {
        log('Existing bundle invalid; rebuilding.')
      }
    }
  } else if (FORCE) {
    rmDir(PYTHON_DIR)
  }

  const useConda =
    process.env.NC_USE_CONDA === '1' ||
    process.env.NC_USE_CONDA === 'true' ||
    (process.platform === 'win32' && condaAvailable())

  let py
  if (useConda) {
    log('Building with conda-forge (recommended on Windows).')
    py = buildWithConda()
  } else if (process.platform === 'win32') {
    if (tryCopyDevCondaEnv()) {
      py = pythonExeInBundle()
      if (!py) fail('Copied .conda-env but python.exe not found')
    } else {
      fail(
        'Windows requires conda for prebuilt noise/worldengine deps. Install Miniconda/Miniforge ' +
          '(NC_USE_CONDA=1), or run scripts/setup-worldengine.ps1 first to create scripts/.conda-env.'
      )
    }
  } else {
    log('Building with venv + pip.')
    py = buildWithVenv()
  }

  verifyBundle(py)
  log(`Done. Bundled Python: ${py}`)
}

main()
