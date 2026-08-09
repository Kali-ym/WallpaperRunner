/**
 * Standalone media server for Wallpaper Engine.
 * Place next to server-config.json (written by sync). Does not need the Electron app.
 *
 *   node media-server.mjs
 */
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const weDir = process.env.WE_WALLPAPER_DIR || here
const configPath = join(weDir, 'server-config.json')
const cfg = JSON.parse(readFileSync(configPath, 'utf8'))
const port = Number(cfg.port) || 17989
const galleryRoot = resolve(cfg.galleryRoot)
const wallpaperDir = resolve(cfg.wallpaperDir || weDir)

function contentType(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.json') return 'application/json; charset=utf-8'
  return 'image/jpeg'
}

function underRoot(root, candidate) {
  const rootKey = resolve(root).toLowerCase()
  const absKey = resolve(candidate).toLowerCase()
  return absKey === rootKey || absKey.startsWith(rootKey + sep.toLowerCase())
}

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': code === 200 ? 'public, max-age=120' : 'no-store',
  })
  res.end(body)
}

const server = http.createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
      const pathname = decodeURIComponent(url.pathname)
      if (pathname === '/health') {
        send(res, 200, JSON.stringify({ ok: true }), 'application/json')
        return
      }
      if (pathname === '/playlist.json') {
        send(res, 200, await readFile(join(wallpaperDir, 'playlist.json')), contentType('x.json'))
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
          send(res, 404, 'Not a file', 'text/plain')
          return
        }
        send(res, 200, await readFile(abs), contentType(abs))
        return
      }
      send(res, 404, 'Not found', 'text/plain')
    } catch (e) {
      send(res, 500, String(e && e.message ? e.message : e), 'text/plain')
    }
  })()
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[gallery-we] media server http://127.0.0.1:${port}`)
  console.log(`[gallery-we] galleryRoot=${galleryRoot}`)
})
