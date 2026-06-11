'use strict'

const path = require('node:path')
const fs = require('node:fs')

async function main() {
  const { rcedit } = await import('rcedit')
  const root = path.join(__dirname, '..')
  const exe = path.join(root, 'release', 'win-unpacked', 'NovelsCreator.exe')
  const icon = path.join(root, 'resources', 'icon.ico')

  if (!fs.existsSync(exe)) {
    console.error(`[embed-win-icon] missing exe: ${exe}`)
    process.exit(1)
  }
  if (!fs.existsSync(icon)) {
    console.error(`[embed-win-icon] missing icon: ${icon}`)
    process.exit(1)
  }

  await rcedit(exe, { icon })
  console.log(`[embed-win-icon] applied ${icon} → ${exe}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
