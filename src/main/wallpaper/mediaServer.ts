import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'

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

function send(res: http.ServerResponse, code: number, body: string | Buffer, type: string): void {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': code === 200 ? 'public, max-age=120' : 'no-store',
  })
  res.end(body)
}

async function stopWallpaperMediaServer(): Promise<void> {
  const s = server
  server = null
  current = null
  if (!s) return
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

        if (pathname === '/health') {
          send(res, 200, JSON.stringify({ ok: true, galleryRoot, wallpaperDir }), 'application/json')
          return
        }

        if (pathname === '/playlist.json') {
          const data = await readFile(join(wallpaperDir, 'playlist.json'))
          send(res, 200, data, contentType('playlist.json'))
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
