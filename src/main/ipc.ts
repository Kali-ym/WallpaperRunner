import { BrowserWindow, dialog, ipcMain, protocol, session, shell } from 'electron'
import { resolve, sep, extname } from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
import { getAdapterById, registerAdapter, resolveAdapter } from './adapters/registry'
import { isDownloadSource, type DownloadSource } from './sources/types'
import { assertUrlsForSource } from './sources/validate'
import { xchinaAdapter } from './adapters/xchina/adapter'
import { telegramAdapter, discoverTelegramUrlsWithClient } from './adapters/telegram/adapter'
import { telegraphAdapter, discoverTelegraph } from './adapters/telegraph/adapter'
import { putResourceManifest } from './resources/session'
import type { ResourceManifest } from './resources/types'
import { setHttpFetch, setHttpProxy, setPreferCurl } from './http/client'
import { LibraryStore } from './library/store'
import { DownloadQueue } from './queue/downloadQueue'
import { loadSettings, saveSettings, type AppSettings } from './settings'
import { telegramService } from './telegram/client'
import { fetchHtml } from './downloader/fetchHtml'
import {
  DEFAULT_MEDIA_PORT,
  syncWallpaperEngineProject,
  type SyncWallpaperResult,
} from './wallpaper/exportWallpaper'
import { startWallpaperMediaServer } from './wallpaper/mediaServer'
import {
  installWallpaperMediaStartup,
  isWallpaperMediaStartupInstalled,
  uninstallWallpaperMediaStartup,
} from './wallpaper/startup'

let store: LibraryStore
let queue: DownloadQueue
let settings: AppSettings
let wallpaperSyncTimer: ReturnType<typeof setTimeout> | null = null
let wallpaperSyncInFlight: Promise<SyncWallpaperResult | null> | null = null

function broadcastTasks(): void {
  const payload = queue.listTasks()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('queue:update', payload)
  }
}

async function ensureMediaServer(): Promise<void> {
  try {
    await startWallpaperMediaServer({
      port: settings.wallpaperMediaPort || DEFAULT_MEDIA_PORT,
      galleryRoot: settings.downloadRoot,
      wallpaperDir: settings.wallpaperEngineDir,
    })
  } catch (err) {
    console.error('[wallpaper] media server failed', err)
  }
}

async function runWallpaperSync(): Promise<SyncWallpaperResult | null> {
  if (wallpaperSyncInFlight) return wallpaperSyncInFlight
  wallpaperSyncInFlight = (async () => {
    try {
      const result = await syncWallpaperEngineProject(
        store,
        settings.wallpaperEngineDir,
        settings.wallpaperMediaPort || DEFAULT_MEDIA_PORT,
      )
      await ensureMediaServer()
      return result
    } catch (err) {
      console.error('[wallpaper] sync failed', err)
      return null
    } finally {
      wallpaperSyncInFlight = null
    }
  })()
  return wallpaperSyncInFlight
}

/** Debounced auto-sync after library mutations. */
function scheduleWallpaperSync(force = false): void {
  if (!force && !settings.wallpaperAutoSync) return
  if (wallpaperSyncTimer) clearTimeout(wallpaperSyncTimer)
  wallpaperSyncTimer = setTimeout(() => {
    wallpaperSyncTimer = null
    void runWallpaperSync()
  }, 1000)
}

async function applyNetwork(proxyUrl: string): Promise<void> {
  // Chromium net.fetch hits net::ERR_BLOCKED_BY_CLIENT on img CDN;
  // use curl (+ system proxy) which already works for this site.
  setHttpFetch(null)
  setPreferCurl(process.platform === 'win32')
  setHttpProxy(proxyUrl || null)
  if (proxyUrl) {
    await session.defaultSession.setProxy({
      proxyRules: proxyUrl,
      proxyBypassRules: '<local>',
    })
  } else {
    await session.defaultSession.setProxy({ mode: 'direct' })
  }
}

function telegramCredentials(): { apiId: number; apiHash: string } | null {
  const apiId = Number.parseInt(settings.telegramApiId, 10)
  const apiHash = settings.telegramApiHash.trim()
  if (!Number.isFinite(apiId) || apiId <= 0 || !apiHash) return null
  return { apiId, apiHash }
}

function rebuildQueue(): void {
  queue = new DownloadQueue({
    store,
    imageConcurrency: settings.imageConcurrency,
    getTelegramCredentials: telegramCredentials,
  })
  queue.on('task', () => broadcastTasks())
  queue.on('idle', () => scheduleWallpaperSync())
}

export async function initAppServices(): Promise<void> {
  registerAdapter(xchinaAdapter)
  registerAdapter(telegramAdapter)
  registerAdapter(telegraphAdapter)
  settings = await loadSettings()
  await applyNetwork(settings.proxyUrl)
  store = new LibraryStore(settings.downloadRoot)
  await store.ensureRoot()
  rebuildQueue()
  await ensureMediaServer()
  if (settings.wallpaperAutoSync) {
    void runWallpaperSync()
  }
  // Ensure client connected when credentials exist (session may already be authorized)
  const creds = telegramCredentials()
  if (creds) {
    void telegramService.connect(creds.apiId, creds.apiHash).catch(() => undefined)
  }
}

export function registerProtocols(): void {
  protocol.handle('gallery-media', async (request) => {
    try {
      const url = new URL(request.url)
      const relative = url.searchParams.get('path')
      if (!relative) return new Response('Bad Request', { status: 400 })

      const root = resolve(settings.downloadRoot)
      // relative may use "/" ; resolve handles it on Windows
      const abs = resolve(root, relative)
      const rootKey = root.toLowerCase()
      const absKey = abs.toLowerCase()
      if (absKey !== rootKey && !absKey.startsWith(rootKey + sep.toLowerCase())) {
        return new Response('Forbidden', { status: 403 })
      }

      const data = await readFile(abs)
      const ext = extname(abs).toLowerCase()
      const type =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : 'image/jpeg'
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(data.byteLength),
          'Cache-Control': 'public, max-age=3600',
        },
      })
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })
}

export function registerIpc(): void {
  ipcMain.handle('settings:get', async () => settings)

  ipcMain.handle('settings:set', async (_e, partial: Partial<AppSettings>) => {
    const prevDir = settings.wallpaperEngineDir
    settings = await saveSettings(partial)
    await applyNetwork(settings.proxyUrl)
    store = new LibraryStore(settings.downloadRoot)
    await store.ensureRoot()
    rebuildQueue()
    if (
      settings.wallpaperAutoSync &&
      (partial.wallpaperEngineDir !== undefined ||
        partial.downloadRoot !== undefined ||
        partial.wallpaperAutoSync !== undefined ||
        settings.wallpaperEngineDir !== prevDir)
    ) {
      scheduleWallpaperSync(true)
    }
    return settings
  })

  ipcMain.handle('settings:pickDownloadRoot', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    settings = await saveSettings({ downloadRoot: result.filePaths[0] })
    store = new LibraryStore(settings.downloadRoot)
    await store.ensureRoot()
    rebuildQueue()
    scheduleWallpaperSync()
    return settings.downloadRoot
  })

  ipcMain.handle('settings:pickWallpaperDir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    settings = await saveSettings({ wallpaperEngineDir: result.filePaths[0] })
    scheduleWallpaperSync(true)
    return settings.wallpaperEngineDir
  })

  ipcMain.handle('wallpaper:sync', async () => {
    const result = await runWallpaperSync()
    if (!result) throw new Error('Wallpaper Engine 同步失败')
    return result
  })

  ipcMain.handle('wallpaper:openDir', async () => {
    await mkdir(settings.wallpaperEngineDir, { recursive: true })
    await shell.openPath(settings.wallpaperEngineDir)
    return settings.wallpaperEngineDir
  })

  ipcMain.handle('wallpaper:installStartup', async () => {
    await syncWallpaperEngineProject(
      store,
      settings.wallpaperEngineDir,
      settings.wallpaperMediaPort || DEFAULT_MEDIA_PORT,
    )
    const path = await installWallpaperMediaStartup(settings.wallpaperEngineDir)
    await ensureMediaServer()
    return { path, installed: true }
  })

  ipcMain.handle('wallpaper:uninstallStartup', async () => {
    const removed = await uninstallWallpaperMediaStartup()
    return { removed, installed: isWallpaperMediaStartupInstalled() }
  })

  ipcMain.handle('wallpaper:startupStatus', async () => {
    return { installed: isWallpaperMediaStartupInstalled() }
  })

  ipcMain.handle('library:list', async (_e, query?: string, favoriteOnly?: boolean) => {
    return store.search(query ?? '', { favoriteOnly: Boolean(favoriteOnly) })
  })

  ipcMain.handle('library:get', async (_e, source: string, id: string) => {
    return store.getGallery(source, id)
  })

  ipcMain.handle('library:rebuild', async () => {
    const list = await store.rebuildIndex()
    scheduleWallpaperSync()
    return list
  })

  ipcMain.handle('library:delete', async (_e, source: string, id: string) => {
    await store.deleteGallery(source, id)
    scheduleWallpaperSync()
  })

  ipcMain.handle(
    'library:deleteMany',
    async (_e, refs: Array<{ source: string; galleryId: string }>) => {
      const n = await store.deleteGalleries(refs)
      scheduleWallpaperSync()
      return n
    },
  )

  ipcMain.handle(
    'library:rename',
    async (_e, source: string, id: string, displayTitle: string) => {
      const meta = await store.renameGallery(source, id, displayTitle)
      scheduleWallpaperSync()
      return meta
    },
  )

  ipcMain.handle(
    'library:setFavorite',
    async (_e, source: string, id: string, favorite: boolean) => {
      const meta = await store.setFavorite(source, id, favorite)
      scheduleWallpaperSync()
      return meta
    },
  )

  ipcMain.handle(
    'library:setFavorites',
    async (_e, refs: Array<{ source: string; galleryId: string }>, favorite: boolean) => {
      const n = await store.setFavorites(refs, favorite)
      scheduleWallpaperSync()
      return n
    },
  )

  ipcMain.handle('library:openFolder', async (_e, source: string, id: string) => {
    const path = await store.openGalleryPath(source, id)
    await shell.openPath(path)
    return path
  })

  ipcMain.handle('library:cleanupEmpty', async () => {
    const n = await store.cleanupEmptyGalleries()
    scheduleWallpaperSync()
    return n
  })

  ipcMain.handle(
    'library:deleteImages',
    async (_e, source: string, id: string, paths: string[]) => {
      const meta = await store.deleteImages(source, id, paths)
      scheduleWallpaperSync()
      return meta
    },
  )

  ipcMain.handle(
    'library:setCover',
    async (_e, source: string, id: string, relativePath: string) => {
      return store.setCover(source, id, relativePath)
    },
  )

  ipcMain.handle('library:redownload', async (_e, sourceUrl: string) => {
    const tasks = queue.enqueue([sourceUrl], { overwrite: true })
    broadcastTasks()
    return tasks
  })

  ipcMain.handle(
    'queue:enqueue',
    async (_e, source: DownloadSource, urls: string[], overwrite?: boolean) => {
      if (!isDownloadSource(source)) throw new Error('未知下载来源')
      const cleaned = assertUrlsForSource(source, urls)
      if (source === 'telegram' || source === 'telegraph') {
        throw new Error('该来源需要先「解析资源」并勾选后再下载')
      }
      const adapter = getAdapterById(source)
      if (!adapter) throw new Error('未知下载来源')
      const tasks = queue.enqueue(cleaned, { overwrite: Boolean(overwrite), source })
      broadcastTasks()
      return tasks
    },
  )

  ipcMain.handle('queue:cancel', async (_e, taskId: string) => {
    queue.cancel(taskId)
    broadcastTasks()
  })

  ipcMain.handle('queue:list', async () => queue.listTasks())

  ipcMain.handle('resources:classify', async (_e, urls: string[]) => {
    return urls.map((url) => {
      const adapter = resolveAdapter(url.trim())
      return {
        url: url.trim(),
        source: adapter?.id ?? null,
        needsSelection: Boolean(adapter?.needsSelection?.(url.trim())),
        supported: Boolean(adapter),
      }
    })
  })

  ipcMain.handle('resources:discover', async (_e, source: DownloadSource, urls: string[]) => {
    if (!isDownloadSource(source)) throw new Error('未知下载来源')
    const cleaned = assertUrlsForSource(source, urls)
    const adapter = getAdapterById(source)
    if (!adapter) throw new Error('暂不支持该来源')
    if (!adapter.discover) throw new Error('该来源不支持资源嗅探')

    const fetchText = fetchHtml
    let manifest: ResourceManifest
    let handles = new Map<string, import('./adapters/telegram/discover').MediaHandle>()

    if (source === 'telegram') {
      const creds = telegramCredentials()
      if (!creds) throw new Error('请先在设置中填写 api_id / api_hash')
      const result = await discoverTelegramUrlsWithClient(cleaned, creds.apiId, creds.apiHash, {
        fetchText,
      })
      manifest = result.manifest
      handles = result.handles
    } else if (source === 'telegraph') {
      if (cleaned.length !== 1) throw new Error('该来源每次请只解析一条链接')
      const trimmed = cleaned[0]
      const creds = telegramCredentials()
      if (!creds) {
        throw new Error(
          'Telegraph 外链图床常失效，请先在设置中登录 Telegram，以便从 Telegram 缓存拉取图片',
        )
      }
      await telegramService.connect(creds.apiId, creds.apiHash)
      if (telegramService.getStatus().state !== 'authorized') {
        throw new Error('请先在设置中登录 Telegram，再解析 Telegraph（走 Telegram 缓存下载）')
      }
      const client = await telegramService.getClient(creds.apiId, creds.apiHash)
      const { discoverTelegraphViaTelegram } = await import('./adapters/telegraph/telegramCache')
      const cached = await discoverTelegraphViaTelegram(client, trimmed)
      if (!cached || !cached.manifest.groups.telegraph[0]?.items.length) {
        console.warn('[telegraph] no telegram cache, falling back to HTTP scrape')
        manifest = await discoverTelegraph(trimmed, { fetchText })
        for (const g of manifest.groups.telegraph) {
          for (const item of g.items) {
            if (item.downloadUrl) {
              handles.set(item.id, { kind: 'http', url: item.downloadUrl })
            }
          }
        }
      } else {
        console.info(
          `[telegraph] using Telegram cache: ${cached.manifest.groups.telegraph[0].items.length} items`,
        )
        manifest = cached.manifest
        handles = cached.handles
      }
    } else {
      if (cleaned.length !== 1) throw new Error('该来源每次请只解析一条链接')
      manifest = await adapter.discover(cleaned[0], { fetchText })
    }

    putResourceManifest(manifest, handles)
    return manifest
  })

  ipcMain.handle(
    'queue:enqueueSelected',
    async (_e, manifestId: string, selectedIds: string[], overwrite?: boolean) => {
      const tasks = queue.enqueueSelected(manifestId, selectedIds, {
        overwrite: Boolean(overwrite),
      })
      broadcastTasks()
      return tasks
    },
  )

  ipcMain.handle('telegram:status', async () => telegramService.getStatus())

  ipcMain.handle('telegram:connect', async () => {
    const creds = telegramCredentials()
    if (!creds) throw new Error('请先填写 api_id / api_hash')
    return telegramService.connect(creds.apiId, creds.apiHash)
  })

  ipcMain.handle('telegram:startLogin', async (_e, phone: string) => {
    const creds = telegramCredentials()
    if (!creds) throw new Error('请先填写并保存 api_id / api_hash')
    return telegramService.startLogin(creds.apiId, creds.apiHash, phone)
  })

  ipcMain.handle('telegram:submitCode', async (_e, code: string) => {
    return telegramService.submitCode(code)
  })

  ipcMain.handle('telegram:submitPassword', async (_e, password: string) => {
    return telegramService.submitPassword(password)
  })

  ipcMain.handle('telegram:waitLogin', async () => telegramService.waitForLogin())

  ipcMain.handle('telegram:logout', async () => telegramService.logout())
}
