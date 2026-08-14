import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startWallpaperMediaServer, stopWallpaperMediaServer } from '@main/wallpaper/mediaServer'
import { readSeenFile } from '@main/wallpaper/exhaustion'

async function freePort(): Promise<number> {
  const probe = createServer()
  const port = await new Promise<number>((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address()
      if (!addr || typeof addr === 'string') reject(new Error('no port'))
      else resolve(addr.port)
    })
  })
  await new Promise<void>((resolve, reject) => probe.close((err) => (err ? reject(err) : resolve())))
  return port
}

describe('media server seen.json', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await stopWallpaperMediaServer()
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('GET empty then PUT and persist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wp-seen-'))
    dirs.push(dir)
    const gallery = await mkdtemp(join(tmpdir(), 'wp-gal-'))
    dirs.push(gallery)
    const port = await freePort()
    await startWallpaperMediaServer({ port, galleryRoot: gallery, wallpaperDir: dir })

    const base = `http://127.0.0.1:${port}`
    const empty = await fetch(`${base}/seen.json`)
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual({})

    const put = await fetch(`${base}/seen.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pool: 'all', ids: ['xchina/one', 'xchina/two'] }),
    })
    expect(put.status).toBe(204)

    const got = await fetch(`${base}/seen.json`)
    expect(await got.json()).toEqual({ all: ['xchina/one', 'xchina/two'] })
    await expect(readSeenFile(dir)).resolves.toEqual({ all: ['xchina/one', 'xchina/two'] })

    const extra = await fetch(`${base}/seen.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pool: 'favorites', ids: ['xchina/fav'] }),
    })
    expect(extra.status).toBe(204)
    expect(await (await fetch(`${base}/seen.json`)).json()).toEqual({
      all: ['xchina/one', 'xchina/two'],
      favorites: ['xchina/fav'],
    })

    const reset = await fetch(`${base}/seen.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pool: 'all', ids: [], reset: true }),
    })
    expect(reset.status).toBe(204)
    expect(await (await fetch(`${base}/seen.json`)).json()).toEqual({
      favorites: ['xchina/fav'],
    })
  })
})

