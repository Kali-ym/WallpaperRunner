import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings } from '../main/settings'
import type { GalleryMetadata, LibraryIndexEntry } from '../main/library/store'
import type { QueueTask } from '../main/queue/types'

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', partial),
  pickDownloadRoot: (): Promise<string | null> =>
    ipcRenderer.invoke('settings:pickDownloadRoot'),
  listLibrary: (query?: string): Promise<LibraryIndexEntry[]> =>
    ipcRenderer.invoke('library:list', query),
  getGallery: (source: string, id: string): Promise<GalleryMetadata | null> =>
    ipcRenderer.invoke('library:get', source, id),
  rebuildLibrary: (): Promise<LibraryIndexEntry[]> =>
    ipcRenderer.invoke('library:rebuild'),
  enqueueUrls: (urls: string[]): Promise<QueueTask[]> =>
    ipcRenderer.invoke('queue:enqueue', urls),
  cancelTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('queue:cancel', taskId),
  listTasks: (): Promise<QueueTask[]> => ipcRenderer.invoke('queue:list'),
  onQueueUpdate: (cb: (tasks: QueueTask[]) => void): (() => void) => {
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
