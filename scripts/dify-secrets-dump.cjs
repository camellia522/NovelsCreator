const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const userData =
  process.env.NOVELS_CREATOR_USER_DATA ??
  path.join(os.homedir(), 'AppData', 'Roaming', 'novels-creator')

app.setName('novels-creator')
app.setPath('userData', userData)

function decryptSecrets(buf) {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(buf)
    } catch {
      /* fall through */
    }
  }
  return buf.toString('utf-8')
}

app.whenReady().then(() => {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf-8'))
    const buf = fs.readFileSync(path.join(userData, 'dify-secrets.bin'))
    const keys = JSON.parse(decryptSecrets(buf))
    process.stdout.write(
      JSON.stringify({
        baseUrl: config.dify?.baseUrl ?? 'http://127.0.0.1/v1',
        outline: keys.outline ?? '',
        chapter: keys.chapter ?? '',
        knowledge: keys.knowledge ?? '',
        society: keys.society ?? ''
      })
    )
  } catch (err) {
    process.stderr.write(String(err instanceof Error ? err.message : err))
    process.exitCode = 1
  }
  app.exit(0)
})

app.on('window-all-closed', () => app.quit())
