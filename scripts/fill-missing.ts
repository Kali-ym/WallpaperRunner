/**
 * Fill missing files for partially downloaded galleries (skips existing images).
 * Usage:
 *   node --import tsx scripts/fill-missing.ts
 *   node --import tsx scripts/fill-missing.ts https://xchina.co/photo/id-xxx.html
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setHttpProxy, setPreferCurl } from '../src/main/http/client'
import { fetchHtml } from '../src/main/downloader/fetchHtml'
import { downloadGallery } from '../src/main/downloader/downloadGallery'
import { xchinaAdapter } from '../src/main/adapters/xchina/adapter'
import { registerAdapter, clearAdapters } from '../src/main/adapters/registry'
import { LibraryStore } from '../src/main/library/store'

const QUEUE_PATH = join(homedir(), 'AppData', 'Roaming', 'wallpaperrunner', 'queue.json')
const SETTINGS_PATH = join(homedir(), 'AppData', 'Roaming', 'wallpaperrunner', 'settings.json')

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadDownloadRoot(): Promise<string> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf8')
    const parsed = JSON.parse(raw) as { downloadRoot?: string }
    if (parsed.downloadRoot?.trim()) return parsed.downloadRoot.trim()
  } catch {
    /* default */
  }
  return join(homedir(), 'Pictures', 'gallery-library')
}

async function urlsFromQueue(): Promise<string[]> {
  try {
    const raw = await readFile(QUEUE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as {
      tasks?: Array<{ url?: string; error?: string }>
    }
    return (parsed.tasks ?? [])
      .filter((t) => t.url && t.error?.includes('部分下载失败'))
      .map((t) => t.url!)
      .filter((url, i, arr) => arr.indexOf(url) === i)
  } catch {
    return []
  }
}

async function fillOne(store: LibraryStore, url: string): Promise<'ok' | 'partial' | 'fail'> {
  let parsed
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      parsed = await xchinaAdapter.parseGallery(url, { fetchText: fetchHtml })
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt >= 3) {
        console.error('PARSE FAIL', url, msg)
        return 'fail'
      }
      console.warn(`parse retry ${attempt + 1}/3:`, msg)
      await sleep(2000 * (attempt + 1))
    }
  }
  if (!parsed) return 'fail'

  const before = await store.getGallery(parsed.source, parsed.galleryId)
  console.log('\n---')
  console.log('title:', parsed.title)
  console.log('url:', url)
  console.log('expected:', parsed.images.length, '| saved:', before?.images.length ?? 0)

  try {
    const meta = await downloadGallery(parsed, store, {
      concurrency: 2,
      fillMissing: true,
      onProgress: ({ done, total, failed }) => {
        if (failed && failed > 0 && done % 3 === 0) {
          console.log(`  progress ${done}/${total} failed=${failed}`)
        }
      },
    })
    console.log('OK', meta.images.length, '/', parsed.images.length)
    return 'ok'
  } catch (err) {
    const e = err as Error & { partialMeta?: { images: string[] } }
    const got = e.partialMeta?.images.length ?? before?.images.length ?? 0
    console.error('PARTIAL', got, '/', parsed.images.length, '-', e.message.split('\n')[0])
    return got >= parsed.images.length ? 'ok' : 'partial'
  }
}

async function main(): Promise<void> {
  const argUrls = process.argv.slice(2).filter((s) => /^https?:\/\//i.test(s))
  const urls = argUrls.length > 0 ? argUrls : await urlsFromQueue()
  if (urls.length === 0) {
    console.log('No partial galleries found.')
    return
  }

  setPreferCurl(true)
  setHttpProxy(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890')
  clearAdapters()
  registerAdapter(xchinaAdapter)

  const store = new LibraryStore(await loadDownloadRoot())
  await store.ensureRoot()

  console.log('fill-missing:', urls.length, 'galleries')
  let ok = 0
  let partial = 0
  let fail = 0
  for (let i = 0; i < urls.length; i++) {
    const result = await fillOne(store, urls[i]!)
    if (result === 'ok') ok += 1
    else if (result === 'partial') partial += 1
    else fail += 1
    if (i < urls.length - 1) await sleep(1500)
  }
  console.log(`\nDone. ok=${ok} partial=${partial} fail=${fail}`)
  if (partial > 0 || fail > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
