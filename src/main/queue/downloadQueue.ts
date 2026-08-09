import { EventEmitter } from 'node:events'
import { getAdapterById, resolveAdapter } from '../adapters/registry'
import { downloadSelectedResources } from '../adapters/telegram/download'
import { downloadGallery, GalleryExistsError } from '../downloader/downloadGallery'
import { fetchHtml } from '../downloader/fetchHtml'
import type { LibraryStore } from '../library/store'
import { getResourceManifest, deleteResourceManifest } from '../resources/session'
import { telegramService } from '../telegram/client'
import type { QueueProgress, QueueTask, QueueTaskStatus } from './types'

export interface DownloadQueueOptions {
  store: LibraryStore
  imageConcurrency: number
  fetchText?: (url: string) => Promise<string>
  getTelegramCredentials?: () => { apiId: number; apiHash: string } | null
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

  enqueue(
    urls: string[],
    opts?: { overwrite?: boolean; source?: string },
  ): QueueTask[] {
    const created: QueueTask[] = []
    for (const raw of urls) {
      const url = raw.trim()
      if (!url) continue
      const adapter = opts?.source
        ? getAdapterById(opts.source) ?? resolveAdapter(url)
        : resolveAdapter(url)
      if (adapter?.needsSelection?.(url)) {
        const now = new Date().toISOString()
        const task: InternalTask = {
          id: `task_${Date.now()}_${seq++}`,
          url,
          status: 'failed',
          done: 0,
          total: 0,
          error: '该来源需要先「解析资源」并勾选后再下载',
          createdAt: now,
          updatedAt: now,
        }
        this.tasks.push(task)
        created.push({ ...task })
        continue
      }
      const now = new Date().toISOString()
      const task: InternalTask = {
        id: `task_${Date.now()}_${seq++}`,
        url,
        status: 'queued',
        source: opts?.source ?? adapter?.id,
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

  enqueueSelected(
    manifestId: string,
    selectedIds: string[],
    opts?: { overwrite?: boolean },
  ): QueueTask[] {
    const stored = getResourceManifest(manifestId)
    if (!stored) {
      throw new Error('资源清单已过期，请重新解析')
    }
    if (selectedIds.length === 0) {
      throw new Error('请至少选择一项资源')
    }
    const now = new Date().toISOString()
    const task: InternalTask = {
      id: `task_${Date.now()}_${seq++}`,
      url: stored.manifest.sourceUrl,
      status: 'queued',
      source: stored.manifest.source,
      galleryId: stored.manifest.galleryId,
      title: stored.manifest.title,
      done: 0,
      total: selectedIds.length,
      createdAt: now,
      updatedAt: now,
      overwrite: opts?.overwrite,
      manifestId,
      selectedIds: [...selectedIds],
    }
    this.tasks.push(task)
    this.emitUpdate()
    void this.pump()
    const { overwrite: _o, ...publicTask } = task
    return [{ ...publicTask }]
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
      if (task.manifestId && task.selectedIds) {
        await this.runSelectedTask(task, ac)
        return
      }

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
        onProgress: ({ done, total, failed }) => {
          this.patch(task.id, {
            done,
            total,
            status: 'downloading',
            error: failed ? `失败 ${failed}` : undefined,
          })
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
      this.handleTaskError(task.id, ac, err)
    } finally {
      this.abortControllers.delete(task.id)
    }
  }

  private async runSelectedTask(task: InternalTask, ac: AbortController): Promise<void> {
    const stored = getResourceManifest(task.manifestId!)
    if (!stored) {
      this.patch(task.id, { status: 'failed', error: '资源清单已过期，请重新解析' })
      this.emitUpdate()
      return
    }

    this.patch(task.id, {
      status: 'downloading',
      source: stored.manifest.source,
      galleryId: stored.manifest.galleryId,
      title: stored.manifest.title,
      total: task.selectedIds!.length,
      done: 0,
    })
    this.emitUpdate()

    const existing = await this.opts.store.getGallery(
      stored.manifest.source,
      stored.manifest.galleryId,
    )
    const overwrite = Boolean(task.overwrite || (existing && existing.images.length === 0))

    let client = null
    const needsTg = Array.from(stored.handles.values()).some(
      (h) => h.kind === 'telegram' || h.kind === 'telegram_media',
    )
    if (needsTg) {
      const creds = this.opts.getTelegramCredentials?.()
      if (!creds) throw new Error('请先在设置中配置并登录 Telegram')
      client = await telegramService.getClient(creds.apiId, creds.apiHash)
      if (telegramService.getStatus().state !== 'authorized') {
        throw new Error('请先在设置中登录 Telegram')
      }
    }

    const meta = await downloadSelectedResources(
      client,
      stored.manifest,
      stored.handles,
      task.selectedIds!,
      this.opts.store,
      {
        concurrency: this.opts.imageConcurrency,
        signal: ac.signal,
        overwrite,
        onProgress: ({ done, total, failed, lastError }) => {
          this.patch(task.id, {
            done,
            total,
            status: 'downloading',
            error: failed
              ? `失败 ${failed}${lastError ? ` · ${lastError}` : ''}`
              : undefined,
          })
          this.emitUpdate()
        },
      },
    )

    deleteResourceManifest(task.manifestId!)
    this.patch(task.id, {
      status: 'completed',
      done: meta.images.length,
      total: meta.images.length,
    })
    this.emitUpdate()
  }

  private handleTaskError(taskId: string, ac: AbortController, err: unknown): void {
    if (ac.signal.aborted || (err instanceof Error && err.message === '已取消')) {
      this.patch(taskId, { status: 'cancelled', error: '已取消' })
    } else if (err instanceof GalleryExistsError) {
      this.patch(taskId, { status: 'skipped', error: err.message })
    } else if (err instanceof Error && (err as Error & { partialMeta?: unknown }).partialMeta) {
      const partial = (err as Error & { partialMeta: { images: string[] } }).partialMeta
      this.patch(taskId, {
        status: 'completed',
        done: partial.images.length,
        total: partial.images.length,
        error: err.message,
      })
    } else {
      const message = err instanceof Error ? err.message : String(err)
      this.patch(taskId, { status: 'failed', error: message })
    }
    this.emitUpdate()
  }
}

export type { QueueTaskStatus }
