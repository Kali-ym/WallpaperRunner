import { EventEmitter } from 'node:events'
import { resolveAdapter } from '../adapters/registry'
import { downloadGallery, GalleryExistsError } from '../downloader/downloadGallery'
import { fetchHtml } from '../downloader/fetchHtml'
import type { LibraryStore } from '../library/store'
import type { QueueProgress, QueueTask, QueueTaskStatus } from './types'

export interface DownloadQueueOptions {
  store: LibraryStore
  imageConcurrency: number
  fetchText?: (url: string) => Promise<string>
}

let seq = 0

interface InternalTask extends QueueTask {
  overwrite?: boolean
}

export class DownloadQueue extends EventEmitter {
  private tasks: InternalTask[] = []
  private running = false
  private paused = false
  private abortControllers = new Map<string, AbortController>()

  constructor(private readonly opts: DownloadQueueOptions) {
    super()
  }

  listTasks(): QueueTask[] {
    return this.tasks.map(({ overwrite: _o, ...t }) => ({ ...t }))
  }

  enqueue(urls: string[], opts?: { overwrite?: boolean }): QueueTask[] {
    const created: QueueTask[] = []
    for (const raw of urls) {
      const url = raw.trim()
      if (!url) continue
      const now = new Date().toISOString()
      const task: InternalTask = {
        id: `task_${Date.now()}_${seq++}`,
        url,
        status: 'queued',
        done: 0,
        total: 0,
        createdAt: now,
        updatedAt: now,
        overwrite: opts?.overwrite,
      }
      this.tasks.push(task)
      const { overwrite: _o, ...publicTask } = task
      created.push({ ...publicTask })
    }
    this.emitUpdate()
    void this.pump()
    return created
  }

  cancel(taskId: string): void {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return
    if (task.status === 'queued') {
      this.patch(taskId, { status: 'cancelled' })
    } else if (task.status === 'resolving' || task.status === 'downloading') {
      this.abortControllers.get(taskId)?.abort()
      this.patch(taskId, { status: 'cancelled', error: '已取消' })
    }
    this.emitUpdate()
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    void this.pump()
  }

  private emitUpdate(): void {
    this.emit('task', this.listTasks())
  }

  private patch(taskId: string, partial: Partial<QueueTask>): void {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return
    Object.assign(task, partial, { updatedAt: new Date().toISOString() })
    const progress: QueueProgress = {
      taskId,
      status: task.status,
      done: task.done,
      total: task.total,
      error: task.error,
      title: task.title,
    }
    this.emit('progress', progress)
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (true) {
        if (this.paused) break
        const next = this.tasks.find((t) => t.status === 'queued')
        if (!next) break
        await this.runTask(next)
      }
    } finally {
      this.running = false
      if (!this.paused && this.tasks.some((t) => t.status === 'queued')) {
        void this.pump()
      } else {
        this.emit('idle')
      }
    }
  }

  private async runTask(task: InternalTask): Promise<void> {
    const ac = new AbortController()
    this.abortControllers.set(task.id, ac)

    try {
      const adapter = resolveAdapter(task.url)
      if (!adapter) {
        this.patch(task.id, { status: 'failed', error: '暂不支持该来源' })
        this.emitUpdate()
        return
      }

      this.patch(task.id, { status: 'resolving', source: adapter.id })
      this.emitUpdate()

      const fetchText = this.opts.fetchText ?? fetchHtml
      const parsed = await adapter.parseGallery(task.url, {
        fetchText,
        signal: ac.signal,
      })

      if (ac.signal.aborted) {
        this.patch(task.id, { status: 'cancelled', error: '已取消' })
        this.emitUpdate()
        return
      }

      this.patch(task.id, {
        status: 'downloading',
        galleryId: parsed.galleryId,
        title: parsed.title,
        total: parsed.images.length,
        done: 0,
      })
      this.emitUpdate()

      const existing = await this.opts.store.getGallery(parsed.source, parsed.galleryId)
      const overwrite = Boolean(task.overwrite || (existing && existing.images.length === 0))

      await downloadGallery(parsed, this.opts.store, {
        concurrency: this.opts.imageConcurrency,
        signal: ac.signal,
        overwrite,
        onProgress: ({ done, total }) => {
          this.patch(task.id, { done, total, status: 'downloading' })
          this.emitUpdate()
        },
      })

      this.patch(task.id, {
        status: 'completed',
        done: parsed.images.length,
        total: parsed.images.length,
      })
      this.emitUpdate()
    } catch (err) {
      if (ac.signal.aborted || (err instanceof Error && err.message === '已取消')) {
        this.patch(task.id, { status: 'cancelled', error: '已取消' })
      } else if (err instanceof GalleryExistsError) {
        this.patch(task.id, { status: 'skipped', error: err.message })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        this.patch(task.id, { status: 'failed', error: message })
      }
      this.emitUpdate()
    } finally {
      this.abortControllers.delete(task.id)
    }
  }
}

export type { QueueTaskStatus }
