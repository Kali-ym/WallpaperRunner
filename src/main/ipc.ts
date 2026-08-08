import { BrowserWindow, dialog, ipcMain, protocol, session, shell } from 'electron'
import { join, resolve, sep, extname } from 'node:path'
import { readFile } from 'node:fs/promises'
import { registerAdapter } from './adapters/registry'
import { xchinaAdapter } from './adapters/xchina/adapter'
import { setHttpFetch, setHttpProxy, setPreferCurl } from './http/client'
import { LibraryStore } from './library/store'
import { DownloadQueue } from './queue/downloadQueue'
import { loadSettings, saveSettings, type AppSettings } from './settings'

let store: LibraryStore
let queue: DownloadQueue
let settings: AppSettings

function broadcastTasks(): void {
  const payload = queue.listTasks()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('queue:update', payload)
  }
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

function rebuildQueue(): void {
  queue = new DownloadQueue({
    store,
    imageConcurrency: settings.imageConcurrency,
  })
  queue.on('task', () => broadcastTasks())
}

export async function initAppServices(): Promise<void> {
  registerAdapter(xchinaAdapter)
  settings = await loadSettings()
  await applyNetwork(settings.proxyUrl)
  store = new LibraryStore(settings.downloadRoot)
  await store.ensureRoot()
  rebuildQueue()
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
    settings = await saveSettings(partial)
    await applyNetwork(settings.proxyUrl)
    store = new LibraryStore(settings.downloadRoot)
    await store.ensureRoot()
    rebuildQueue()
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
    return settings.downloadRoot
  })

  ipcMain.handle('library:list', async (_e, query?: string, favoriteOnly?: boolean) => {
    return store.search(query ?? '', { favoriteOnly: Boolean(favoriteOnly) })
  })

  ipcMain.handle('library:get', async (_e, source: string, id: string) => {
    return store.getGallery(source, id)
  })

  ipcMain.handle('library:rebuild', async () => {
    return store.rebuildIndex()
  })

  ipcMain.handle('library:delete', async (_e, source: string, id: string) => {
    await store.deleteGallery(source, id)
  })

  ipcMain.handle(
    'library:deleteMany',
    async (_e, refs: Array<{ source: string; galleryId: string }>) => {
      return store.deleteGalleries(refs)
    },
  )

  ipcMain.handle(
    'library:rename',
    async (_e, source: string, id: string, displayTitle: string) => {
      return store.renameGallery(source, id, displayTitle)
    },
  )

  ipcMain.handle(
    'library:setFavorite',
    async (_e, source: string, id: string, favorite: boolean) => {
      return store.setFavorite(source, id, favorite)
    },
  )

  ipcMain.handle(
    'library:setFavorites',
    async (_e, refs: Array<{ source: string; galleryId: string }>, favorite: boolean) => {
      return store.setFavorites(refs, favorite)
    },
  )

  ipcMain.handle('library:openFolder', async (_e, source: string, id: string) => {
    const path = await store.openGalleryPath(source, id)
    await shell.openPath(path)
    return path
  })

  ipcMain.handle('library:cleanupEmpty', async () => {
    return store.cleanupEmptyGalleries()
  })

  ipcMain.handle(
    'library:deleteImages',
    async (_e, source: string, id: string, paths: string[]) => {
      return store.deleteImages(source, id, paths)
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

  ipcMain.handle('queue:enqueue', async (_e, urls: string[], overwrite?: boolean) => {
    const tasks = queue.enqueue(urls, { overwrite: Boolean(overwrite) })
    broadcastTasks()
    return tasks
  })

  ipcMain.handle('queue:cancel', async (_e, taskId: string) => {
    queue.cancel(taskId)
    broadcastTasks()
  })

  ipcMain.handle('queue:list', async () => queue.listTasks())
}
