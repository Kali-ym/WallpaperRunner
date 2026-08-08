/**
 * Diagnose why a gallery is missing files vs metadata.
 */
import { setHttpProxy, setPreferCurl } from '../src/main/http/client'
import { fetchHtml } from '../src/main/downloader/fetchHtml'
import { xchinaAdapter } from '../src/main/adapters/xchina/adapter'
import { registerAdapter, clearAdapters } from '../src/main/adapters/registry'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

async function main(): Promise<void> {
  const id = process.argv[2] || '6506d058e0ad4'
  const root = join(homedir(), 'Pictures', 'gallery-library')
  const dirs = await readdir(root, { withFileTypes: true })
  const dir = dirs.find((d) => d.isDirectory() && d.name.includes(id))
  if (!dir) throw new Error('folder not found')
  const folder = join(root, dir.name)
  const meta = JSON.parse(await readFile(join(folder, 'metadata.json'), 'utf8')) as {
    images: string[]
    pageCount: number
    sourceUrl: string
  }
  const files = new Set(
    (await readdir(folder)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)),
  )
  const missing = meta.images.filter((n) => !files.has(n))
  const present = meta.images.filter((n) => files.has(n))
  console.log('folder', dir.name)
  console.log('metaCount', meta.images.length, 'pageCount', meta.pageCount)
  console.log('diskCount', files.size)
  console.log('missing', missing.length, missing.slice(0, 10), '...', missing.slice(-5))
  console.log('present', present.length, present[0], '...', present.at(-1))

  setPreferCurl(true)
  setHttpProxy(process.env.HTTPS_PROXY || 'http://127.0.0.1:7890')
  clearAdapters()
  registerAdapter(xchinaAdapter)
  const parsed = await xchinaAdapter.parseGallery(meta.sourceUrl, { fetchText: fetchHtml })
  console.log('liveParseCount', parsed.images.length, 'pages', parsed.pageCount)
  console.log('liveFirst', parsed.images[0]?.url)
  console.log('liveLast', parsed.images.at(-1)?.url)

  // probe a few missing originals
  const { downloadFile } = await import('../src/main/downloader/downloadFile')
  const probeIdx = [0, 1, 55, 56]
  for (const i of probeIdx) {
    const img = parsed.images[i]
    if (!img) continue
    const dest = join(folder, `_probe_${String(i + 1).padStart(3, '0')}.jpg`)
    try {
      const r = await downloadFile(img.url, dest, {
        referer: `https://xchina.co/photo/id-${id}/1.html`,
        retries: 2,
      })
      console.log('probe', i + 1, 'OK', r.bytes, img.url)
    } catch (e) {
      console.log('probe', i + 1, 'FAIL', (e as Error).message, img.url)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
