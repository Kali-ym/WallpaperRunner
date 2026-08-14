/**
 * Standalone media server for Wallpaper Engine.
 * Place next to server-config.json (written by sync). Does not need the Electron app.
 *
 *   node media-server.mjs
 */
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { readFile, writeFile, stat } from 'node:fs/promises'
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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function send(res, code, body, type, cache) {
  res.writeHead(code, {
    'Content-Type': type,
    ...CORS,
    'Cache-Control': code === 200 && cache !== 'none' ? 'public, max-age=120' : 'no-store',
  })
  res.end(body)
}

function parseSeenMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!key || !Array.isArray(value)) continue
    const ids = value.filter((x) => typeof x === 'string' && x.length > 0)
    if (ids.length) out[key] = ids
  }
  return out
}

function applySeenPatch(map, pool, ids, reset) {
  const key = String(pool || '').trim()
  if (!key) return map
  const next = { ...map }
  if (reset) {
    const cleaned = (ids || []).filter((id) => typeof id === 'string' && id.length > 0)
    if (cleaned.length) next[key] = cleaned
    else delete next[key]
    return next
  }
  const have = {}
  const merged = []
  const prev = next[key] || []
  for (const id of prev.concat(ids || [])) {
    if (typeof id !== 'string' || !id || have[id]) continue
    have[id] = true
    merged.push(id)
  }
  if (merged.length) next[key] = merged
  else delete next[key]
  return next
}

function parseSeenPatch(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (typeof raw.pool !== 'string' || !raw.pool.trim()) return null
  const ids = Array.isArray(raw.ids)
    ? raw.ids.filter((x) => typeof x === 'string' && x.length > 0)
    : []
  return { pool: raw.pool.trim(), ids, reset: Boolean(raw.reset) }
}

async function readSeen() {
  try {
    return parseSeenMap(JSON.parse(await readFile(join(wallpaperDir, 'seen.json'), 'utf8')))
  } catch {
    return {}
  }
}

function readBody(req, maxBytes = 1_000_000) {
  return new Promise((resolvePromise, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
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

const server = http.createServer((req, res) => {
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
          send(res, 200, JSON.stringify({ ok: true }), 'application/json')
          return
        }
        if (pathname === '/playlist.json') {
          send(res, 200, await readFile(join(wallpaperDir, 'playlist.json')), contentType('x.json'))
          return
        }
        if (pathname === '/seen.json') {
          if (method === 'GET') {
            send(res, 200, JSON.stringify(await readSeen()), 'application/json; charset=utf-8', 'none')
            return
          }
          if (method === 'PUT') {
            let parsed
            try {
              parsed = JSON.parse(await readBody(req))
            } catch {
              send(res, 400, 'Invalid JSON', 'text/plain', 'none')
              return
            }
            const patch = parseSeenPatch(parsed)
            if (!patch) {
              send(res, 400, 'Expected { pool, ids, reset? }', 'text/plain', 'none')
              return
            }
            const map = applySeenPatch(await readSeen(), patch.pool, patch.ids, patch.reset)
            await writeFile(join(wallpaperDir, 'seen.json'), JSON.stringify(map, null, 2), 'utf8')
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
