import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell } from 'electron'
import { resolve, sep, extname, join } from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
import { getAdapterById, registerAdapter } from './adapters/registry'
import { isDownloadSource, type DownloadSource } from './sources/types'
import { assertUrlsForSource } from './sources/validate'
import { xchinaAdapter } from './adapters/xchina/adapter'
import { telegramAdapter, discoverTelegramUrlsWithClient } from './adapters/telegram/adapter'
import { telegraphAdapter } from './adapters/telegraph/adapter'
import { discoverTelegraphBestEffort } from './adapters/telegraph/discover'
import {
  extractZipToGallery,
  zipGalleryIdFromPath,
  ZipPasswordRequiredError,
  type ExtractZipOptions,
} from './library/extractZipGallery'
import { putResourceManifest } from './resources/session'
import type { ResourceManifest } from './resources/types'
import { resolveThumb } from './library/thumbnails'

type AskExtractPayload = {
  taskId: string
  source: string
  galleryId: string
  title: string
  sourceUrl: string
  author?: string
  zipPaths: string[]
}
import { setHttpFetch, setHttpProxy, setPreferCurl } from './http/client'
import { LibraryStore } from './library/store'
import { PlaylistStore } from './library/playlists'
import { AuthorAvatarStore } from './library/authorAvatars'
import { HistoryStore } from './library/history'
import { importLocalFolders } from './library/importLocalFolders'
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
let playlistStore: PlaylistStore
let authorAvatarStore: AuthorAvatarStore
let historyStore: HistoryStore
let queue: DownloadQueue
let settings: AppSettings
let wallpaperSyncTimer: ReturnType<typeof setTimeout> | null = null
let wallpaperSyncInFlight: Promise<SyncWallpaperResult | null> | null = null
let libraryChangeTimer: ReturnType<typeof setTimeout> | null = null

function broadcastTasks(): void {
  const payload = queue.listTasks()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('queue:update', payload)
  }
}

function broadcastLibraryChanged(): void {
  if (libraryChangeTimer) clearTimeout(libraryChangeTimer)
  libraryChangeTimer = setTimeout(() => {
    libraryChangeTimer = null
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('library:changed')
    }
  }, 80)
}

function bindLibraryStore(next: LibraryStore): void {
  store = next
  playlistStore = new PlaylistStore(next.root)
  authorAvatarStore = new AuthorAvatarStore(next.root)
  store.on('change', () => broadcastLibraryChanged())
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
        playlistStore,
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
    persistPath: join(app.getPath('userData'), 'queue.json'),
    getTelegramCredentials: telegramCredentials,
  })
  queue.on('task', () => broadcastTasks())
  queue.on('idle', () => scheduleWallpaperSync())
  queue.on('askExtract', (payload: AskExtractPayload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('queue:askExtract', payload)
    }
  })
}

export async function initAppServices(): Promise<void> {
  registerAdapter(xchinaAdapter)
  registerAdapter(telegramAdapter)
  registerAdapter(telegraphAdapter)
  settings = await loadSettings()
  await applyNetwork(settings.proxyUrl)
  historyStore = new HistoryStore(join(app.getPath('userData'), 'history.json'))
  bindLibraryStore(new LibraryStore(settings.downloadRoot))
  await store.ensureRoot()
  rebuildQueue()
  await queue.restoreFromDisk()
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

      const wantThumb = url.searchParams.get('thumb') === '1'
      let filePath = abs
      let type =
        extname(abs).toLowerCase() === '.png'
          ? 'image/png'
          : extname(abs).toLowerCase() === '.webp'
            ? 'image/webp'
            : extname(abs).toLowerCase() === '.gif'
              ? 'image/gif'
              : 'image/jpeg'

      if (wantThumb) {
        try {
          const thumb = await resolveThumb(root, abs)
          filePath = thumb.absPath
          type = thumb.mime
        } catch {
          /* fall back to original */
        }
      }

      const data = await readFile(filePath)
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(data.byteLength),
          // Thumbs are content-addressed by mtime/size — cache aggressively.
          'Cache-Control': wantThumb
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600',
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
    const prevPort = settings.wallpaperMediaPort
    settings = await saveSettings(partial)
    await applyNetwork(settings.proxyUrl)
    bindLibraryStore(new LibraryStore(settings.downloadRoot))
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
    if (partial.wallpaperMediaPort !== undefined && settings.wallpaperMediaPort !== prevPort) {
      await ensureMediaServer()
    }
    return settings
  })

  ipcMain.handle('settings:pickDownloadRoot', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    settings = await saveSettings({ downloadRoot: result.filePaths[0] })
    bindLibraryStore(new LibraryStore(settings.downloadRoot))
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
      playlistStore,
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

  ipcMain.handle(
    'library:list',
    async (_e, query?: string, filters?: import('./library/filters').LibraryFilters) => {
      return store.search(query ?? '', filters ?? {})
    },
  )

  ipcMain.handle('library:authorStats', async () => store.listAuthorStats())

  ipcMain.handle('library:getAuthorAvatar', async (_e, author: string) => {
    return authorAvatarStore.get(author)
  })

  ipcMain.handle('library:listAuthorAvatars', async () => authorAvatarStore.list())

  ipcMain.handle('library:listAuthorImageSources', async (_e, author: string) => {
    return authorAvatarStore.listImageSources(store, author)
  })

  ipcMain.handle(
    'library:setAuthorAvatar',
    async (
      _e,
      author: string,
      payload: {
        source: string
        galleryId: string
        dirName: string
        imagePath: string
        crop: { x: number; y: number; width: number; height: number }
      },
    ) => {
      const record = await authorAvatarStore.set(author, payload)
      broadcastLibraryChanged()
      return record
    },
  )

  ipcMain.handle('library:clearAuthorAvatar', async (_e, author: string) => {
    const cleared = await authorAvatarStore.clear(author)
    if (cleared) broadcastLibraryChanged()
    return cleared
  })

  ipcMain.handle('library:renameAuthor', async (_e, from: string, to: string) => {
    const count = await store.renameAuthor(from, to)
    if (count === 0) throw new Error('没有找到该作者的套图')
    await authorAvatarStore.renameAuthor(from, to)
    return count
  })

  ipcMain.handle(
    'library:addTags',
    async (_e, refs: Array<{ source: string; galleryId: string }>, tags: string[]) => {
      const n = await store.addTags(refs, tags)
      if (n > 0) broadcastLibraryChanged()
      return n
    },
  )

  ipcMain.handle('playlists:list', async () => playlistStore.list())

  ipcMain.handle('playlists:create', async (_e, name: string) => {
    const pl = await playlistStore.create(name)
    scheduleWallpaperSync()
    return pl
  })

  ipcMain.handle('playlists:rename', async (_e, id: string, name: string) => {
    const pl = await playlistStore.rename(id, name)
    scheduleWallpaperSync()
    return pl
  })

  ipcMain.handle('playlists:delete', async (_e, id: string) => {
    await playlistStore.delete(id)
    scheduleWallpaperSync()
  })

  ipcMain.handle(
    'playlists:setMembers',
    async (_e, id: string, refs: Array<{ source: string; galleryId: string }>) => {
      const pl = await playlistStore.setMembers(id, refs)
      scheduleWallpaperSync()
      return pl
    },
  )

  ipcMain.handle(
    'playlists:addToPlaylists',
    async (
      _e,
      playlistIds: string[],
      ref: { source: string; galleryId: string },
    ) => {
      const n = await playlistStore.addToPlaylists(playlistIds, ref)
      if (n > 0) scheduleWallpaperSync()
      return n
    },
  )

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
    await playlistStore.pruneMissing(await store.loadIndex())
    scheduleWallpaperSync()
  })

  ipcMain.handle(
    'library:deleteMany',
    async (_e, refs: Array<{ source: string; galleryId: string }>) => {
      const n = await store.deleteGalleries(refs)
      await playlistStore.pruneMissing(await store.loadIndex())
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
    'library:updateMeta',
    async (
      _e,
      source: string,
      id: string,
      partial: { displayTitle?: string; author?: string; tags?: string[] },
    ) => {
      const meta = await store.updateGalleryMeta(source, id, partial)
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

  ipcMain.handle(
    'history:recordBrowse',
    async (
      _e,
      ref: {
        source: string
        galleryId: string
        title?: string
        dirName?: string
        cover?: string | null
      },
    ) => historyStore.recordBrowse(ref),
  )

  ipcMain.handle('library:importLocalFolders', async (_e, paths: string[]) => {
    if (!Array.isArray(paths) || paths.length === 0) {
      return { imported: [], skipped: [] }
    }
    const cleaned = paths.map((p) => String(p || '').trim()).filter(Boolean)
    const result = await importLocalFolders(store, cleaned)
    if (result.imported.length > 0) scheduleWallpaperSync()
    return {
      imported: result.imported.length,
      skipped: result.skipped,
      galleries: result.imported.map((g) => ({
        source: g.source,
        galleryId: g.galleryId,
        title: g.title,
        imageCount: g.images.length,
      })),
    }
  })

  ipcMain.handle(
    'library:extractZip',
    async (
      _e,
      payload: {
        zipPath: string
        deleteZip?: boolean
        password?: string
        intoExisting?: boolean
        source?: string
        galleryId?: string
        title?: string
        sourceUrl?: string
        author?: string
      },
    ) => {
      const opts: ExtractZipOptions = {
        source: payload.source ?? 'zip',
        galleryId: payload.galleryId ?? zipGalleryIdFromPath(payload.zipPath),
        title: payload.title ?? '压缩包图集',
        sourceUrl: payload.sourceUrl ?? payload.zipPath,
        author: payload.author,
        deleteZip: payload.deleteZip,
        password: payload.password,
        intoExisting: payload.intoExisting,
      }
      try {
        const meta = await extractZipToGallery(payload.zipPath, store, opts)
        scheduleWallpaperSync()
        return meta
      } catch (err) {
        if (err instanceof ZipPasswordRequiredError) {
          throw new Error(err.message)
        }
        throw err
      }
    },
  )

  ipcMain.handle('library:listZipFiles', async (_e, source: string, id: string) => {
    const meta = await store.getGallery(source, id)
    if (!meta) return [] as string[]
    const dir = store.resolveGalleryDir(meta.source, meta.galleryId, meta.title)
    const { resolveZipArtifacts } = await import('./library/extractZipGallery')
    const { zipNames, renamedMeta } = await resolveZipArtifacts(dir, meta.images)
    if (renamedMeta) {
      await store.upsertGallery({ ...meta, images: renamedMeta })
    }
    return zipNames.map((name) => join(dir, name))
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

  ipcMain.handle('queue:pauseTask', async (_e, taskId: string) => {
    queue.pauseTask(taskId)
    broadcastTasks()
  })

  ipcMain.handle('queue:resumeTask', async (_e, taskId: string) => {
    queue.resumeTask(taskId)
    broadcastTasks()
  })

  ipcMain.handle('queue:moveTask', async (_e, taskId: string, direction: 'up' | 'down') => {
    queue.moveTask(taskId, direction)
    broadcastTasks()
  })

  ipcMain.handle('queue:retryTask', async (_e, taskId: string) => {
    queue.retryTask(taskId)
    broadcastTasks()
  })

  ipcMain.handle('queue:retryAllFailed', async () => {
    const n = queue.retryAllFailed()
    broadcastTasks()
    return n
  })

  ipcMain.handle('queue:list', async () => queue.listTasks())

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
      let client: Awaited<ReturnType<typeof telegramService.getClient>> | null = null
      const creds = telegramCredentials()
      if (creds) {
        try {
          await telegramService.connect(creds.apiId, creds.apiHash)
          if (telegramService.getStatus().state === 'authorized') {
            client = await telegramService.getClient(creds.apiId, creds.apiHash)
          }
        } catch {
          /* fall back to HTTP scrape */
        }
      }
      const result = await discoverTelegraphBestEffort(trimmed, { fetchText }, client)
      manifest = result.manifest
      handles = result.handles
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

  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle('window:toggleMaximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle('window:isMaximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })
}
