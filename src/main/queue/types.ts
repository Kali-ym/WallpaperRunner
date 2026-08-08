export type QueueTaskStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'

export interface QueueTask {
  id: string
  url: string
  status: QueueTaskStatus
  source?: string
  galleryId?: string
  title?: string
  done: number
  total: number
  error?: string
  createdAt: string
  updatedAt: string
}

export interface QueueProgress {
  taskId: string
  status: QueueTaskStatus
  done: number
  total: number
  error?: string
  title?: string
}
