import { contextBridge, ipcRenderer } from 'electron'
import type { DownloadSource } from '../main/sources/types'
import type { AppSettings } from '../main/settings'
import type { GalleryMetadata, LibraryIndexEntry } from '../main/library/store'
import type { LibraryFilters, TagStat, AuthorStat } from '../main/library/filters'
import type { QueueTask } from '../main/queue/types'
import type { ResourceManifest } from '../main/resources/types'
import type { TelegramAuthStatus } from '../main/telegram/client'

type GalleryRef = { source: string; galleryId: string }
export type AuthorAvatarRecord = {
  author: string
  fileName: string
  relativePath: string
  source: string
  galleryId: string
  imagePath: string
  crop: { x: number; y: number; width: number; height: number }
  updatedAt: string
}
export type AuthorImageSource = {
  source: string
  galleryId: string
  dirName: string
  title: string
  cover: string | null
  images: string[]
}
export type { ResourceManifest, TelegramAuthStatus, DownloadSource, LibraryFilters, TagStat, AuthorStat }

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', partial),
  pickDownloadRoot: (): Promise<string | null> =>
    ipcRenderer.invoke('settings:pickDownloadRoot'),
  listLibrary: (
    query?: string,
    filters?: LibraryFilters,
  ): Promise<LibraryIndexEntry[]> => ipcRenderer.invoke('library:list', query, filters),
  authorStats: (): Promise<AuthorStat[]> => ipcRenderer.invoke('library:authorStats'),
  getAuthorAvatar: (author: string): Promise<AuthorAvatarRecord | null> =>
    ipcRenderer.invoke('library:getAuthorAvatar', author),
  listAuthorAvatars: (): Promise<AuthorAvatarRecord[]> =>
    ipcRenderer.invoke('library:listAuthorAvatars'),
  listAuthorImageSources: (author: string): Promise<AuthorImageSource[]> =>
    ipcRenderer.invoke('library:listAuthorImageSources', author),
  setAuthorAvatar: (
    author: string,
    payload: {
      source: string
      galleryId: string
      dirName: string
      imagePath: string
      crop: { x: number; y: number; width: number; height: number }
    },
  ): Promise<AuthorAvatarRecord> => ipcRenderer.invoke('library:setAuthorAvatar', author, payload),
  clearAuthorAvatar: (author: string): Promise<boolean> =>
    ipcRenderer.invoke('library:clearAuthorAvatar', author),
  renameAuthor: (from: string, to: string): Promise<number> =>
    ipcRenderer.invoke('library:renameAuthor', from, to),
  addTags: (refs: GalleryRef[], tags: string[]): Promise<number> =>
    ipcRenderer.invoke('library:addTags', refs, tags),
  listPlaylists: (): Promise<
    Array<{
      id: string
      name: string
      galleryRefs: Array<{ source: string; galleryId: string }>
      createdAt: string
      updatedAt: string
    }>
  > => ipcRenderer.invoke('playlists:list'),
  createPlaylist: (name: string) => ipcRenderer.invoke('playlists:create', name),
  renamePlaylist: (id: string, name: string) => ipcRenderer.invoke('playlists:rename', id, name),
  deletePlaylist: (id: string): Promise<void> => ipcRenderer.invoke('playlists:delete', id),
  setPlaylistMembers: (
    id: string,
    refs: Array<{ source: string; galleryId: string }>,
  ) => ipcRenderer.invoke('playlists:setMembers', id, refs),
  addGalleryToPlaylists: (
    playlistIds: string[],
    ref: { source: string; galleryId: string },
  ): Promise<number> => ipcRenderer.invoke('playlists:addToPlaylists', playlistIds, ref),
  getGallery: (source: string, id: string): Promise<GalleryMetadata | null> =>
    ipcRenderer.invoke('library:get', source, id),
  rebuildLibrary: (): Promise<LibraryIndexEntry[]> =>
    ipcRenderer.invoke('library:rebuild'),
  deleteGallery: (source: string, id: string): Promise<void> =>
    ipcRenderer.invoke('library:delete', source, id),
  deleteGalleries: (refs: GalleryRef[]): Promise<number> =>
    ipcRenderer.invoke('library:deleteMany', refs),
  renameGallery: (source: string, id: string, displayTitle: string): Promise<GalleryMetadata> =>
    ipcRenderer.invoke('library:rename', source, id, displayTitle),
  updateGalleryMeta: (
    source: string,
    id: string,
    partial: { displayTitle?: string; author?: string; tags?: string[] },
  ): Promise<GalleryMetadata> => ipcRenderer.invoke('library:updateMeta', source, id, partial),
  setFavorite: (source: string, id: string, favorite: boolean): Promise<GalleryMetadata> =>
    ipcRenderer.invoke('library:setFavorite', source, id, favorite),
  setFavorites: (refs: GalleryRef[], favorite: boolean): Promise<number> =>
    ipcRenderer.invoke('library:setFavorites', refs, favorite),
  openGalleryFolder: (source: string, id: string): Promise<string> =>
    ipcRenderer.invoke('library:openFolder', source, id),
  cleanupEmptyGalleries: (): Promise<number> =>
    ipcRenderer.invoke('library:cleanupEmpty'),
  deleteImages: (source: string, id: string, paths: string[]): Promise<GalleryMetadata> =>
    ipcRenderer.invoke('library:deleteImages', source, id, paths),
  setCover: (source: string, id: string, relativePath: string): Promise<GalleryMetadata> =>
    ipcRenderer.invoke('library:setCover', source, id, relativePath),
  recordBrowse: (ref: {
    source: string
    galleryId: string
    title?: string
    dirName?: string
    cover?: string | null
  }): Promise<unknown> => ipcRenderer.invoke('history:recordBrowse', ref),
  importLocalFolders: (
    paths: string[],
  ): Promise<{
    imported: number
    skipped: string[]
    galleries: Array<{ source: string; galleryId: string; title: string; imageCount: number }>
  }> => ipcRenderer.invoke('library:importLocalFolders', paths),
  extractZip: (payload: {
    zipPath: string
    deleteZip?: boolean
    password?: string
    intoExisting?: boolean
    source?: string
    galleryId?: string
    title?: string
    sourceUrl?: string
    author?: string
  }): Promise<GalleryMetadata> => ipcRenderer.invoke('library:extractZip', payload),
  listZipFiles: (source: string, id: string): Promise<string[]> =>
    ipcRenderer.invoke('library:listZipFiles', source, id),
  enqueueUrls: (
    source: DownloadSource,
    urls: string[],
    overwrite?: boolean,
  ): Promise<QueueTask[]> => ipcRenderer.invoke('queue:enqueue', source, urls, overwrite),
  enqueueSelected: (
    manifestId: string,
    selectedIds: string[],
    overwrite?: boolean,
  ): Promise<QueueTask[]> =>
    ipcRenderer.invoke('queue:enqueueSelected', manifestId, selectedIds, overwrite),
  cancelTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('queue:cancel', taskId),
  pauseTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('queue:pauseTask', taskId),
  resumeTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('queue:resumeTask', taskId),
  moveTask: (taskId: string, direction: 'up' | 'down'): Promise<void> =>
    ipcRenderer.invoke('queue:moveTask', taskId, direction),
  retryTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('queue:retryTask', taskId),
  retryAllFailed: (): Promise<number> => ipcRenderer.invoke('queue:retryAllFailed'),
  listTasks: (): Promise<QueueTask[]> => ipcRenderer.invoke('queue:list'),
  discoverResources: (source: DownloadSource, urls: string[]): Promise<ResourceManifest> =>
    ipcRenderer.invoke('resources:discover', source, urls),
  telegramStatus: (): Promise<TelegramAuthStatus> => ipcRenderer.invoke('telegram:status'),
  telegramConnect: (): Promise<TelegramAuthStatus> => ipcRenderer.invoke('telegram:connect'),
  telegramStartLogin: (phone: string): Promise<TelegramAuthStatus> =>
    ipcRenderer.invoke('telegram:startLogin', phone),
  telegramSubmitCode: (code: string): Promise<TelegramAuthStatus> =>
    ipcRenderer.invoke('telegram:submitCode', code),
  telegramSubmitPassword: (password: string): Promise<TelegramAuthStatus> =>
    ipcRenderer.invoke('telegram:submitPassword', password),
  telegramWaitLogin: (): Promise<TelegramAuthStatus> => ipcRenderer.invoke('telegram:waitLogin'),
  telegramLogout: (): Promise<TelegramAuthStatus> => ipcRenderer.invoke('telegram:logout'),
  pickWallpaperDir: (): Promise<string | null> =>
    ipcRenderer.invoke('settings:pickWallpaperDir'),
  syncWallpaper: (): Promise<{
    dir: string
    galleryCount: number
    imageCount: number
    mediaBase?: string
  }> => ipcRenderer.invoke('wallpaper:sync'),
  openWallpaperDir: (): Promise<string> => ipcRenderer.invoke('wallpaper:openDir'),
  installWallpaperStartup: (): Promise<{ path: string; installed: boolean }> =>
    ipcRenderer.invoke('wallpaper:installStartup'),
  uninstallWallpaperStartup: (): Promise<{ removed: boolean; installed: boolean }> =>
    ipcRenderer.invoke('wallpaper:uninstallStartup'),
  wallpaperStartupStatus: (): Promise<{ installed: boolean }> =>
    ipcRenderer.invoke('wallpaper:startupStatus'),
  onQueueUpdate: (cb: (tasks: QueueTask[]) => void): () => void => {
    const listener = (_event: Electron.IpcRendererEvent, tasks: QueueTask[]): void => {
      cb(tasks)
    }
    ipcRenderer.on('queue:update', listener)
    return () => ipcRenderer.removeListener('queue:update', listener)
  },
  onAskExtract: (
    cb: (payload: {
      taskId: string
      source: string
      galleryId: string
      title: string
      sourceUrl: string
      author?: string
      zipPaths: string[]
    }) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: {
        taskId: string
        source: string
        galleryId: string
        title: string
        sourceUrl: string
        author?: string
        zipPaths: string[]
      },
    ): void => {
      cb(payload)
    }
    ipcRenderer.on('queue:askExtract', listener)
    return () => ipcRenderer.removeListener('queue:askExtract', listener)
  },
  onLibraryChange: (cb: () => void): (() => void) => {
    const listener = (): void => {
      cb()
    }
    ipcRenderer.on('library:changed', listener)
    return () => ipcRenderer.removeListener('library:changed', listener)
  },
  getMediaUrl: (
    dirName: string,
    relativePath: string,
    opts?: { thumb?: boolean; bust?: string | number },
  ): string => {
    const relative = `${dirName}/${relativePath}`.replace(/\\/g, '/')
    const thumb = opts?.thumb ? '&thumb=1' : ''
    const bust = opts?.bust != null ? `&v=${encodeURIComponent(String(opts.bust))}` : ''
    return `gallery-media://local/?path=${encodeURIComponent(relative)}${thumb}${bust}`
  },
  getAuthorAvatarUrl: (relativePath: string, bust?: string | number): string => {
    const bustParam = bust != null ? `&v=${encodeURIComponent(String(bust))}` : ''
    return `gallery-media://local/?path=${encodeURIComponent(relativePath)}${bustParam}`
  },
  windowIsFrameless: (): boolean =>
    process.platform === 'win32' || process.platform === 'linux',
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggleMaximize'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximized: (cb: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
      cb(maximized)
    }
    ipcRenderer.on('window:maximized', listener)
    return () => ipcRenderer.removeListener('window:maximized', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type GalleryApi = typeof api
