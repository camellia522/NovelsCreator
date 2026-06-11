'use strict'

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const ELECTRON_BUILDER = path.join(ROOT, 'node_modules', 'electron-builder', 'cli.js')

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false'
    }
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run(process.execPath, [ELECTRON_BUILDER, '--win', '--dir'])
run(process.execPath, [path.join(__dirname, 'embed-win-icon.cjs')])
run(process.execPath, [
  ELECTRON_BUILDER,
  '--win',
  '--prepackaged',
  path.join('release', 'win-unpacked')
])
