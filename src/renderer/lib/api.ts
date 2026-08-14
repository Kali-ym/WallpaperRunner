import type { AppSettings } from '../../main/settings'
import type { GalleryMetadata, LibraryIndexEntry } from '../../main/library/store'
import type { LibraryFilters, TagStat, AuthorStat, LibraryCounts } from '../../main/library/filters'
import type { QueueTask } from '../../main/queue/types'
import type { ResourceManifest } from '../../main/resources/types'
import type { DownloadSource } from '../../main/sources/types'
import type { TelegramAuthStatus } from '../../main/telegram/client'
import type { AuthorAvatarRecord, AuthorImageSource } from '../../preload'

export type {
  AppSettings,
  GalleryMetadata,
  LibraryIndexEntry,
  LibraryFilters,
  TagStat,
  AuthorStat,
  LibraryCounts,
  AuthorAvatarRecord,
  AuthorImageSource,
  QueueTask,
  ResourceManifest,
  DownloadSource,
  TelegramAuthStatus,
}

export const api = window.api
