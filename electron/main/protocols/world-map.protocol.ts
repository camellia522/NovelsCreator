import { protocol } from 'electron'
import path from 'node:path'

const SCHEME = 'nc-map'
const PREFIX = `${SCHEME}://`

export function registerWorldMapScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: true,
        corsEnabled: true
      }
    }
  ])
}

/** 整路径 encodeURIComponent，避免 Windows 盘符被当成 URL host（D:） */
export function worldMapFileUrl(filePath: string): string {
  return PREFIX + encodeURIComponent(path.normalize(filePath))
}

export function parseNcMapRequestUrl(requestUrl: string): string {
  if (!requestUrl.startsWith(PREFIX)) {
    throw new Error(`invalid ${SCHEME} url`)
  }
  const encoded = requestUrl.slice(PREFIX.length)
  return path.normalize(decodeURIComponent(encoded))
}

export function registerWorldMapProtocol(): void {
  protocol.registerFileProtocol(SCHEME, (request, callback) => {
    try {
      const filePath = parseNcMapRequestUrl(request.url)
      callback({ path: filePath })
    } catch {
      callback({ error: -2 })
    }
  })
}
