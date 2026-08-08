/**
 * Force re-download one gallery with overwrite (fills missing files).
 * Usage: npx tsx scripts/redownload-one.ts https://xchina.co/photo/id-6506d058e0ad4.html
 */
import { join } from 'node:path'
import { homedir } from 'node:os'
import { setHttpProxy, setPreferCurl } from '../src/main/http/client'
import { fetchHtml } from '../src/main/downloader/fetchHtml'
import { downloadGallery } from '../src/main/downloader/downloadGallery'
import { xchinaAdapter } from '../src/main/adapters/xchina/adapter'
import { registerAdapter, clearAdapters } from '../src/main/adapters/registry'
import { LibraryStore } from '../src/main/library/store'

async function main(): Promise<void> {
  const url = process.argv[2]
  if (!url) throw new Error('need url')
  setPreferCurl(true)
  setHttpProxy(process.env.HTTPS_PROXY || 'http://127.0.0.1:7890')
  clearAdapters()
  registerAdapter(xchinaAdapter)

  const store = new LibraryStore(join(homedir(), 'Pictures', 'gallery-library'))
  await store.ensureRoot()
  const parsed = await xchinaAdapter.parseGallery(url, { fetchText: fetchHtml })
  console.log('parsed', parsed.images.length, parsed.title)

  try {
    const meta = await downloadGallery(parsed, store, {
      concurrency: 2,
      overwrite: true,
      onProgress: ({ done, total, failed }) => {
        if (done % 5 === 0 || done === total) {
          console.log(`progress ${done}/${total} failed=${failed ?? 0}`)
        }
      },
    })
    console.log('OK images', meta.images.length)
  } catch (e) {
    const err = e as Error & { partialMeta?: { images: string[] } }
    console.error('DONE WITH ERRORS', err.message)
    if (err.partialMeta) console.log('saved', err.partialMeta.images.length)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
