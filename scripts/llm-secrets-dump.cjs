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
    const buf = fs.readFileSync(path.join(userData, 'llm-secrets.bin'))
    const apiKey = decryptSecrets(buf).trim()
    const local = config.ai?.local ?? {}
    const assistant = config.ai?.assistant ?? {}
    process.stdout.write(
      JSON.stringify({
        baseUrl: (local.baseUrl ?? assistant.baseUrl ?? 'https://api.deepseek.com').replace(
          /\/$/,
          ''
        ),
        model: local.model ?? assistant.model ?? 'deepseek-chat',
        reasoningModel: local.reasoningModel ?? local.model ?? assistant.model ?? 'deepseek-chat',
        apiKey
      })
    )
  } catch (err) {
    process.stderr.write(String(err instanceof Error ? err.message : err))
    process.exitCode = 1
  } finally {
    app.quit()
  }
})
