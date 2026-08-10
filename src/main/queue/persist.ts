import type { QueueTask } from './types'

export type PersistedQueue = {
  updatedAt: string
  tasks: QueueTask[]
}

const ACTIVE: ReadonlySet<QueueTask['status']> = new Set([
  'queued',
  'resolving',
  'downloading',
  'skipped',
])

const TERMINAL: ReadonlySet<QueueTask['status']> = new Set([
  'completed',
  'failed',
  'cancelled',
])

/** Reset in-flight statuses so restart can resume via .part files. */
export function normalizeTasksForRestore(tasks: QueueTask[]): QueueTask[] {
  const now = new Date().toISOString()
  return tasks.map((t) => {
    if (t.status === 'downloading' || t.status === 'resolving') {
      return { ...t, status: 'queued', updatedAt: now }
    }
    return { ...t }
  })
}

export function trimTerminalTasks(tasks: QueueTask[], keep = 50): QueueTask[] {
  const active = tasks.filter((t) => ACTIVE.has(t.status))
  const terminal = tasks
    .filter((t) => TERMINAL.has(t.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, keep)
  return [...active, ...terminal]
}

export function serializeQueueTasks(tasks: QueueTask[]): PersistedQueue {
  const trimmed = trimTerminalTasks(tasks)
  return {
    updatedAt: new Date().toISOString(),
    tasks: trimmed.map((t) => ({
      id: t.id,
      url: t.url,
      status: t.status,
      source: t.source,
      galleryId: t.galleryId,
      title: t.title,
      done: t.done,
      total: t.total,
      error: t.error,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      manifestId: t.manifestId,
      selectedIds: t.selectedIds,
    })),
  }
}
