/**
 * Live E2E via curl-backed http client + real xchina pages.
 * Usage: node --import tsx scripts/e2e-xchina-download.ts
 */
import { mkdir, writeFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { setHttpProxy, setPreferCurl } from '../src/main/http/client'
import { fetchHtml } from '../src/main/downloader/fetchHtml'
import { downloadFile } from '../src/main/downloader/downloadFile'
import { xchinaAdapter } from '../src/main/adapters/xchina/adapter'
import { registerAdapter, clearAdapters } from '../src/main/adapters/registry'

async function main(): Promise<void> {
  const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890'
  const URL = process.argv[2] || 'https://xchina.co/photo/id-63c799bf45baf.html'
  const OUT = join(process.cwd(), 'tmp-e2e-download')

  clearAdapters()
  registerAdapter(xchinaAdapter)
  setPreferCurl(true)
  setHttpProxy(PROXY)

  console.log('proxy=', PROXY)
  console.log('url=', URL)

  const parsed = await xchinaAdapter.parseGallery(URL, { fetchText: fetchHtml })
  console.log('title=', parsed.title)
  console.log('author=', parsed.author)
  console.log('tags=', parsed.tags.join(','))
  console.log('pages=', parsed.pageCount)
  console.log('images=', parsed.images.length)
  console.log('first=', parsed.images[0]?.url)
  console.log('last=', parsed.images.at(-1)?.url)

  if (parsed.images.length < 40) {
    throw new Error(`Expected ~59 images, got ${parsed.images.length}`)
  }

  await mkdir(OUT, { recursive: true })
  const sampleIdx = [0, 1, 2, parsed.images.length - 1]
  for (const i of [...new Set(sampleIdx)]) {
    const img = parsed.images[i]
    const dest = join(OUT, `${String(i + 1).padStart(3, '0')}.jpg`)
    const r = await downloadFile(img.url, dest, {
      referer: `https://xchina.co/photo/id-${parsed.galleryId}/1.html`,
      retries: 3,
    })
    console.log(`saved ${dest} bytes=${r.bytes} type=${r.contentType}`)
    if (r.bytes < 50_000) {
      throw new Error(`Looks like thumb/error: ${dest} (${r.bytes} bytes)`)
    }
  }

  await writeFile(
    join(OUT, 'meta.json'),
    JSON.stringify(
      {
        title: parsed.title,
        galleryId: parsed.galleryId,
        pageCount: parsed.pageCount,
        imageCount: parsed.images.length,
      },
      null,
      2,
    ),
  )

  for (const f of await readdir(OUT)) {
    console.log('out', f, (await stat(join(OUT, f))).size)
  }
  console.log('E2E OK')
}

main().catch((err) => {
  console.error('E2E FAIL', err)
  process.exit(1)
})
