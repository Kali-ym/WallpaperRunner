import type { AppSettings } from '../../main/settings'
import type { GalleryMetadata, LibraryIndexEntry } from '../../main/library/store'
import type { LibraryFilters, TagStat } from '../../main/library/filters'
import type { QueueTask } from '../../main/queue/types'
import type { ResourceManifest } from '../../main/resources/types'
import type { DownloadSource } from '../../main/sources/types'

export type {
  AppSettings,
  GalleryMetadata,
  LibraryIndexEntry,
  LibraryFilters,
  TagStat,
  QueueTask,
  ResourceManifest,
  DownloadSource,
}

export type TelegramAuthStatus = {
  state:
    | 'disconnected'
    | 'connecting'
    | 'need_code'
    | 'need_password'
    | 'authorized'
    | 'error'
  phone?: string
  username?: string
  error?: string
}

export const api = window.api
