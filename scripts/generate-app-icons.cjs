/**
 * 从 resources/icon.svg 生成 PNG / ICO（打包前可手动运行：node scripts/generate-app-icons.cjs）
 */
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const sharp = require('sharp')
  const pngToIco = (await import('png-to-ico')).default

  const root = path.join(__dirname, '..')
  const svgPath = path.join(root, 'resources', 'icon.svg')
  const svg = fs.readFileSync(svgPath)

  const pngPath = path.join(root, 'resources', 'icon.png')
  await sharp(svg).resize(512, 512).png().toFile(pngPath)

  const icoSizes = [16, 32, 48, 256]
  const tmpPaths = []
  for (const size of icoSizes) {
    const tmp = path.join(root, 'resources', `.icon-${size}.png`)
    await sharp(svg).resize(size, size).png().toFile(tmp)
    tmpPaths.push(tmp)
  }
  const ico = await pngToIco(tmpPaths)
  fs.writeFileSync(path.join(root, 'resources', 'icon.ico'), ico)
  for (const tmp of tmpPaths) fs.rmSync(tmp, { force: true })

  const publicDir = path.join(root, 'public')
  fs.mkdirSync(publicDir, { recursive: true })
  fs.copyFileSync(pngPath, path.join(publicDir, 'icon.png'))

  console.log('Generated resources/icon.png, resources/icon.ico, public/icon.png')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
