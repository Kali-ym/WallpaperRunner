import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings } from '../main/settings'
import type { GalleryMetadata, LibraryIndexEntry } from '../main/library/store'
import type { QueueTask } from '../main/queue/types'

export type GalleryRef = { source: string; galleryId: string }

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', partial),
  pickDownloadRoot: (): Promise<string | null> =>
    ipcRenderer.invoke('settings:pickDownloadRoot'),
  listLibrary: (query?: string, favoriteOnly?: boolean): Promise<LibraryIndexEntry[]> =>
    ipcRenderer.invoke('library:list', query, favoriteOnly),
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
  redownloadGallery: (sourceUrl: string): Promise<QueueTask[]> =>
    ipcRenderer.invoke('library:redownload', sourceUrl),
  enqueueUrls: (urls: string[], overwrite?: boolean): Promise<QueueTask[]> =>
    ipcRenderer.invoke('queue:enqueue', urls, overwrite),
  cancelTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('queue:cancel', taskId),
  listTasks: (): Promise<QueueTask[]> => ipcRenderer.invoke('queue:list'),
  onQueueUpdate: (cb: (tasks: QueueTask[]) => void): () => void => {
    const listener = (_event: Electron.IpcRendererEvent, tasks: QueueTask[]): void => {
      cb(tasks)
    }
    ipcRenderer.on('queue:update', listener)
    return () => ipcRenderer.removeListener('queue:update', listener)
  },
  getMediaUrl: (dirName: string, relativePath: string): string => {
    const relative = `${dirName}/${relativePath}`.replace(/\\/g, '/')
    return `gallery-media://local/?path=${encodeURIComponent(relative)}`
  },
}

contextBridge.exposeInMainWorld('api', api)

export type GalleryApi = typeof api
