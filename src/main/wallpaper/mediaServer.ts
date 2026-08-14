import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { applySeenPatch, parseSeenPatch, readSeenFile, writeSeenFile } from './exhaustion'

export interface MediaServerOptions {
  port: number
  galleryRoot: string
  wallpaperDir: string
}

let server: http.Server | null = null
let current: MediaServerOptions | null = null

function contentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.html') return 'text/html; charset=utf-8'
  return 'image/jpeg'
}

function underRoot(root: string, candidate: string): boolean {
  const rootKey = resolve(root).toLowerCase()
  const absKey = resolve(candidate).toLowerCase()
  return absKey === rootKey || absKey.startsWith(rootKey + sep.toLowerCase())
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const

function send(
  res: http.ServerResponse,
  code: number,
  body: string | Buffer,
  type: string,
  cache: 'public' | 'none' = 'public',
): void {
  res.writeHead(code, {
    'Content-Type': type,
    ...CORS,
    'Cache-Control': code === 200 && cache === 'public' ? 'public, max-age=120' : 'no-store',
  })
  res.end(body)
}

function readBody(req: http.IncomingMessage, maxBytes = 1_000_000): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export async function stopWallpaperMediaServer(): Promise<void> {
  const s = server
  server = null
  current = null
  if (!s) return
  if (typeof s.closeAllConnections === 'function') s.closeAllConnections()
  await new Promise<void>((resolvePromise) => {
    s.close(() => resolvePromise())
  })
}

export async function startWallpaperMediaServer(opts: MediaServerOptions): Promise<number> {
  const port = opts.port
  const galleryRoot = resolve(opts.galleryRoot)
  const wallpaperDir = resolve(opts.wallpaperDir)

  if (server && current) {
    const same =
      current.port === port &&
      resolve(current.galleryRoot) === galleryRoot &&
      resolve(current.wallpaperDir) === wallpaperDir
    if (same) return port
    await stopWallpaperMediaServer()
  }

  server = http.createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
        const pathname = decodeURIComponent(url.pathname)
        const method = (req.method || 'GET').toUpperCase()

        if (method === 'OPTIONS') {
          res.writeHead(204, { ...CORS, 'Cache-Control': 'no-store' })
          res.end()
          return
        }

        if (pathname === '/health') {
          send(res, 200, JSON.stringify({ ok: true, galleryRoot, wallpaperDir }), 'application/json')
          return
        }

        if (pathname === '/playlist.json') {
          const data = await readFile(join(wallpaperDir, 'playlist.json'))
          send(res, 200, data, contentType('playlist.json'))
          return
        }

        if (pathname === '/seen.json') {
          if (method === 'GET') {
            const map = await readSeenFile(wallpaperDir)
            send(res, 200, JSON.stringify(map), 'application/json; charset=utf-8', 'none')
            return
          }
          if (method === 'PUT') {
            let parsed: unknown
            try {
              parsed = JSON.parse(await readBody(req)) as unknown
            } catch {
              send(res, 400, 'Invalid JSON', 'text/plain', 'none')
              return
            }
            const patch = parseSeenPatch(parsed)
            if (!patch) {
              send(res, 400, 'Expected { pool, ids, reset? }', 'text/plain', 'none')
              return
            }
            const map = applySeenPatch(await readSeenFile(wallpaperDir), patch.pool, patch.ids, patch.reset)
            await writeSeenFile(wallpaperDir, map)
            res.writeHead(204, { ...CORS, 'Cache-Control': 'no-store' })
            res.end()
            return
          }
          send(res, 405, 'Method not allowed', 'text/plain', 'none')
          return
        }

        if (pathname.startsWith('/media/')) {
          const rel = pathname.slice('/media/'.length).replace(/\//g, sep)
          if (!rel || rel.includes('..')) {
            send(res, 400, 'Bad path', 'text/plain')
            return
          }
          const abs = resolve(galleryRoot, rel)
          if (!underRoot(galleryRoot, abs)) {
            send(res, 403, 'Forbidden', 'text/plain')
            return
          }
          const st = await stat(abs)
          if (!st.isFile()) {
            send(res, 404, 'Not found', 'text/plain')
            return
          }
          const data = await readFile(abs)
          send(res, 200, data, contentType(abs))
          return
        }

        send(res, 404, 'Not found', 'text/plain')
      } catch {
        send(res, 500, 'Error', 'text/plain')
      }
    })()
  })

  await new Promise<void>((resolvePromise, reject) => {
    server!.once('error', reject)
    server!.listen(port, '127.0.0.1', () => resolvePromise())
  })

  current = { port, galleryRoot, wallpaperDir }
  return port
}
