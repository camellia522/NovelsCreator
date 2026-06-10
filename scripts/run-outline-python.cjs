const { spawnSync } = require('node:child_process')
const path = require('node:path')

const py = path.join(
  __dirname,
  '.conda-env',
  process.platform === 'win32' ? 'python.exe' : 'bin/python'
)
const script = process.argv[2]
if (!script) {
  console.error('usage: node scripts/run-outline-python.cjs <script.py>')
  process.exit(1)
}
const result = spawnSync(py, [path.join(__dirname, '..', script)], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
})
process.exit(result.status ?? 1)
