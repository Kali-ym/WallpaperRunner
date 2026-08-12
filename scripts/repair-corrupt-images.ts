/**
 * Delete fake image files (HTML/Cloudflare pages) and re-download them.
 * Usage: node --import tsx scripts/repair-corrupt-images.ts
 */
import { readFile, readdir, unlink, readFile as rf } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setHttpProxy, setPreferCurl } from '../src/main/http/client'
import { fetchHtml } from '../src/main/downloader/fetchHtml'
import { downloadGallery } from '../src/main/downloader/downloadGallery'
import {
  extensionFromMagic,
  isHtmlOrBlockedPage,
} from '../src/main/downloader/downloadFile'
import { xchinaAdapter } from '../src/main/adapters/xchina/adapter'
import { registerAdapter, clearAdapters } from '../src/main/adapters/registry'
import { LibraryStore } from '../src/main/library/store'

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

async function findCorruptFiles(root: string): Promise<Array<{ dir: string; file: string }>> {
  const bad: Array<{ dir: string; file: string }> = []
  const dirs = await readdir(root)
  for (const dir of dirs) {
    const folder = join(root, dir)
    let files: string[]
    try {
      files = await readdir(folder)
    } catch {
      continue
    }
    for (const file of files) {
      if (!/\.(jpe?g|png|webp|gif)$/i.test(file)) continue
      const buf = await rf(join(folder, file))
      const magic = extensionFromMagic(buf.subarray(0, 16))
      if (!magic || isHtmlOrBlockedPage(buf)) {
        bad.push({ dir, file })
      }
    }
  }
  return bad
}

async function main(): Promise<void> {
  setPreferCurl(true)
  setHttpProxy(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890')
  clearAdapters()
  registerAdapter(xchinaAdapter)

  const root = await loadDownloadRoot()
  const store = new LibraryStore(root)
  await store.ensureRoot()

  const corrupt = await findCorruptFiles(root)
  if (corrupt.length === 0) {
    console.log('No corrupt image files found.')
    return
  }

  console.log(`Found ${corrupt.length} corrupt files. Deleting…`)
  for (const { dir, file } of corrupt) {
    await unlink(join(root, dir, file))
    console.log('  deleted', join(dir, file))
  }

  const urls = new Set<string>()
  for (const { dir } of corrupt) {
    const meta = await rf(join(root, dir, 'metadata.json'), 'utf8').catch(() => '')
    if (!meta) continue
    try {
      const parsed = JSON.parse(meta) as { sourceUrl?: string }
      if (parsed.sourceUrl) urls.add(parsed.sourceUrl)
    } catch {
      /* skip */
    }
  }

  console.log(`\nRe-downloading ${urls.size} galleries…`)
  let ok = 0
  let partial = 0
  for (const url of urls) {
    console.log('\n---', url)
    let parsed
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        parsed = await xchinaAdapter.parseGallery(url, { fetchText: fetchHtml })
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (attempt >= 3) {
          console.error('PARSE FAIL', msg)
          partial += 1
          parsed = null
          break
        }
        await sleep(2000 * (attempt + 1))
      }
    }
    if (!parsed) continue

    try {
      const meta = await downloadGallery(parsed, store, {
        concurrency: 1,
        fillMissing: true,
        failedRetries: 5,
      })
      console.log('OK', meta.images.length, '/', parsed.images.length)
      ok += 1
    } catch (err) {
      const e = err as Error & { partialMeta?: { images: string[] } }
      const got = e.partialMeta?.images.length ?? 0
      console.error('PARTIAL', got, '/', parsed.images.length, '-', e.message.split('\n')[0])
      partial += 1
    }
    await sleep(2000)
  }

  const remaining = await findCorruptFiles(root)
  console.log(`\nDone. galleries ok=${ok} partial=${partial} remaining corrupt=${remaining.length}`)
  if (remaining.length > 0) {
    remaining.slice(0, 10).forEach((r) => console.log('  still bad:', join(r.dir, r.file)))
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
