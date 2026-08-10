export type QueueTaskStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'

export type { QueueFileProgress, QueueFileStatus } from './progress'

import type { QueueFileProgress } from './progress'

export interface QueueTask {
  id: string
  url: string
  status: QueueTaskStatus
  source?: string
  galleryId?: string
  title?: string
  done: number
  total: number
  percent?: number
  bytesPerSec?: number
  /** Bytes received for the active file when known. */
  bytesReceived?: number
  /** Total bytes of the active file when known. */
  bytesTotal?: number
  etaSec?: number | null
  files?: QueueFileProgress[]
  error?: string
  createdAt: string
  updatedAt: string
  /** When set, task downloads from a ResourceManifest selection */
  manifestId?: string
  selectedIds?: string[]
}

export interface QueueProgress {
  taskId: string
  status: QueueTaskStatus
  done: number
  total: number
  percent?: number
  bytesPerSec?: number
  bytesReceived?: number
  bytesTotal?: number
  etaSec?: number | null
  files?: QueueFileProgress[]
  error?: string
  title?: string
}
