import { EventEmitter } from 'node:events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getAdapterById, resolveAdapter } from '../adapters/registry'
import { downloadSelectedResources } from '../adapters/telegram/download'
import { downloadGallery, GalleryExistsError } from '../downloader/downloadGallery'
import { fetchHtml } from '../downloader/fetchHtml'
import { findZipArtifacts, resolveZipArtifacts } from '../library/extractZipGallery'
import type { LibraryStore } from '../library/store'
import { getResourceManifest, deleteResourceManifest } from '../resources/session'
import { listManifestItems } from '../resources/types'
import { telegramService } from '../telegram/client'
import {
  aggregateByteProgress,
  computeByteEtaSec,
  computePercent,
  RateTracker,
  type QueueFileProgress,
} from './progress'
import {
  normalizeTasksForRestore,
  serializeQueueTasks,
  type PersistedQueue,
} from './persist'
import type { QueueProgress, QueueTask, QueueTaskStatus } from './types'

export interface DownloadQueueOptions {
  store: LibraryStore
  imageConcurrency: number
  /** Max gallery tasks running at once (each still uses imageConcurrency internally). */
  taskConcurrency?: number
  /** When set, debounce-write queue state here and restore on `restoreFromDisk`. */
  persistPath?: string
  fetchText?: (url: string) => Promise<string>
  getTelegramCredentials?: () => { apiId: number; apiHash: string } | null
}

let seq = 0

interface InternalTask extends QueueTask {
  overwrite?: boolean
  fillMissing?: boolean
}

export class DownloadQueue extends EventEmitter {
  private tasks: InternalTask[] = []
  private activeTasks = 0
  private paused = false
  private abortControllers = new Map<string, AbortController>()
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private pauseIntent = new Set<string>()

  constructor(private readonly opts: DownloadQueueOptions) {
    super()
  }

  listTasks(): QueueTask[] {
    return this.tasks.map(({ overwrite: _o, ...t }) => ({ ...t }))
  }

  async restoreFromDisk(opts?: { autoStart?: boolean }): Promise<void> {
    const path = this.opts.persistPath
    if (!path) return
    try {
      const raw = await readFile(path, 'utf8')
      const parsed = JSON.parse(raw) as PersistedQueue
      if (!Array.isArray(parsed.tasks)) return
      const restored = normalizeTasksForRestore(parsed.tasks)
      this.tasks = restored.map((t) => ({ ...t }))
      this.emitUpdate()
      if (
        opts?.autoStart !== false &&
        this.tasks.some((t) => t.status === 'queued' || t.status === 'skipped')
      ) {
        void this.pump()
      }
    } catch {
      /* missing or corrupt — start empty */
    }
  }

  private schedulePersist(): void {
    if (!this.opts.persistPath) return
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      void this.persistNow()
    }, 200)
  }

  private async persistNow(): Promise<void> {
    const path = this.opts.persistPath
    if (!path) return
    try {
      const payload = serializeQueueTasks(this.listTasks())
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify(payload, null, 2), 'utf8')
    } catch (err) {
      console.error('queue persist failed', err)
    }
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
    this.pauseIntent.delete(taskId)
    if (task.status === 'queued' || task.status === 'paused') {
      this.patch(taskId, { status: 'cancelled' })
    } else if (task.status === 'resolving' || task.status === 'downloading') {
      this.abortControllers.get(taskId)?.abort()
      this.patch(taskId, { status: 'cancelled', error: '已取消' })
    }
    this.emitUpdate()
  }

  pauseTask(taskId: string): void {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return
    if (task.status === 'queued') {
      this.patch(taskId, { status: 'paused' })
      this.emitUpdate()
      return
    }
    if (task.status === 'resolving' || task.status === 'downloading') {
      this.pauseIntent.add(taskId)
      this.abortControllers.get(taskId)?.abort()
      this.patch(taskId, { status: 'paused', error: undefined })
      this.emitUpdate()
    }
  }

  resumeTask(taskId: string): void {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task || task.status !== 'paused') return
    this.pauseIntent.delete(taskId)
    this.patch(taskId, { status: 'queued', error: undefined })
    this.emitUpdate()
    void this.pump()
  }

  moveTask(taskId: string, direction: 'up' | 'down'): void {
    const idx = this.tasks.findIndex((t) => t.id === taskId)
    if (idx < 0) return
    const task = this.tasks[idx]
    if (!task || (task.status !== 'queued' && task.status !== 'paused')) return
    const step = direction === 'up' ? -1 : 1
    let swapWith = -1
    for (let i = idx + step; i >= 0 && i < this.tasks.length; i += step) {
      const other = this.tasks[i]
      if (other && (other.status === 'queued' || other.status === 'paused')) {
        swapWith = i
        break
      }
    }
    if (swapWith < 0) return
    const other = this.tasks[swapWith]
    if (!other) return
    this.tasks[idx] = other
    this.tasks[swapWith] = task
    this.emitUpdate()
  }

  retryTask(taskId: string): void {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return
    if (task.status !== 'failed' && task.status !== 'cancelled' && task.status !== 'completed') return
    const partial = Boolean(task.error?.includes('部分下载失败'))
    this.patch(taskId, {
      status: 'queued',
      error: undefined,
      done: partial ? task.done : 0,
      percent: partial ? task.percent : 0,
      bytesReceived: partial ? task.bytesReceived : undefined,
      bytesTotal: partial ? task.bytesTotal : undefined,
      bytesPerSec: undefined,
      etaSec: undefined,
      files: partial ? task.files : undefined,
    })
    task.fillMissing = partial
    if (!partial) task.overwrite = undefined
    this.emitUpdate()
    void this.pump()
  }

  retryAllFailed(): number {
    let n = 0
    for (const t of this.tasks) {
      if (t.status !== 'failed' && !(t.status === 'completed' && t.error?.includes('部分下载失败'))) {
        continue
      }
      const partial = Boolean(t.error?.includes('部分下载失败'))
      this.patch(t.id, {
        status: 'queued',
        error: undefined,
        done: partial ? t.done : 0,
        percent: partial ? t.percent : 0,
        bytesReceived: partial ? t.bytesReceived : undefined,
        bytesTotal: partial ? t.bytesTotal : undefined,
        bytesPerSec: undefined,
        etaSec: undefined,
        files: partial ? t.files : undefined,
      })
      t.fillMissing = partial
      if (!partial) t.overwrite = undefined
      n += 1
    }
    if (n > 0) {
      this.emitUpdate()
      void this.pump()
    }
    return n
  }

  pauseAllActive(): number {
    let n = 0
    for (const t of this.tasks) {
      if (
        t.status !== 'queued' &&
        t.status !== 'resolving' &&
        t.status !== 'downloading'
      ) {
        continue
      }
      this.pauseTask(t.id)
      n += 1
    }
    return n
  }

  resumeAllPaused(): number {
    let n = 0
    for (const t of this.tasks) {
      if (t.status !== 'paused') continue
      this.resumeTask(t.id)
      n += 1
    }
    return n
  }

  removeTask(taskId: string): boolean {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return false
    if (
      task.status !== 'completed' &&
      task.status !== 'failed' &&
      task.status !== 'cancelled' &&
      task.status !== 'skipped'
    ) {
      return false
    }
    this.tasks = this.tasks.filter((t) => t.id !== taskId)
    this.emitUpdate()
    return true
  }

  clearCompleted(): number {
    const before = this.tasks.length
    this.tasks = this.tasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'skipped' && t.status !== 'cancelled',
    )
    const n = before - this.tasks.length
    if (n > 0) this.emitUpdate()
    return n
  }

  clearFailed(): number {
    const before = this.tasks.length
    this.tasks = this.tasks.filter((t) => t.status !== 'failed')
    const n = before - this.tasks.length
    if (n > 0) this.emitUpdate()
    return n
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
    this.schedulePersist()
  }

  private patch(taskId: string, partial: Partial<QueueTask>): void {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return
    Object.assign(task, partial, { updatedAt: new Date().toISOString() })
    if (
      partial.percent === undefined &&
      (partial.done !== undefined || partial.total !== undefined)
    ) {
      task.percent = computePercent(task.done, task.total)
    }
    const progress: QueueProgress = {
      taskId,
      status: task.status,
      done: task.done,
      total: task.total,
      percent: task.percent,
      bytesPerSec: task.bytesPerSec,
      bytesReceived: task.bytesReceived,
      bytesTotal: task.bytesTotal,
      etaSec: task.etaSec,
      files: task.files,
      error: task.error,
      title: task.title,
    }
    this.emit('progress', progress)
  }

  private mergeFileProgress(
    taskId: string,
    file: QueueFileProgress,
    rates: { byteRate: RateTracker; bytesDownloaded: { n: number } },
    done: number,
    total: number,
    failed?: number,
    bytesDelta?: number,
  ): void {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return
    const files = [...(task.files ?? [])]
    const idx = files.findIndex((f) => f.id === file.id)
    if (idx >= 0) {
      const prev = files[idx]
      const merged: QueueFileProgress = {
        ...prev,
        ...file,
        bytesReceived: file.bytesReceived ?? prev.bytesReceived,
        bytesTotal: file.bytesTotal ?? prev.bytesTotal,
      }
      if (merged.status === 'done') {
        const size = merged.bytesTotal ?? merged.bytesReceived
        if (size != null && size > 0) {
          merged.bytesReceived = size
          merged.bytesTotal = size
        }
      }
      files[idx] = merged
    } else {
      files.push(file)
    }

    if (bytesDelta && bytesDelta > 0) {
      rates.bytesDownloaded.n += bytesDelta
    }

    const agg = aggregateByteProgress(files)
    const received = Math.max(agg.received, rates.bytesDownloaded.n)
    const byteTotal = agg.total > 0 ? Math.max(agg.total, received) : 0
    const filePercent = computePercent(done, total)
    const bytePercent =
      byteTotal > 0 ? Math.min(100, Math.round((received / byteTotal) * 100)) : 0
    const percent = byteTotal > 0 ? bytePercent : filePercent
    const bytesPerSec = rates.byteRate.sample(received)
    const etaSec =
      byteTotal > 0 ? computeByteEtaSec(received, byteTotal, bytesPerSec) : null

    this.patch(taskId, {
      done,
      total,
      status: 'downloading',
      files,
      bytesPerSec: bytesPerSec > 0 ? Math.round(bytesPerSec) : undefined,
      bytesReceived: received,
      bytesTotal: byteTotal > 0 ? byteTotal : undefined,
      etaSec,
      percent,
      error: failed ? `失败 ${failed}` : undefined,
    })
    this.emitUpdate()
  }

  private async pump(): Promise<void> {
    if (this.paused) return
    const limit = Math.min(Math.max(1, this.opts.taskConcurrency ?? 2), 4)
    while (this.activeTasks < limit) {
      const next = this.tasks.find((t) => t.status === 'queued')
      if (!next) break
      this.activeTasks += 1
      void this.runTask(next).finally(() => {
        this.activeTasks -= 1
        if (!this.paused && this.tasks.some((t) => t.status === 'queued')) {
          void this.pump()
        } else if (this.activeTasks === 0) {
          this.emit('idle')
        }
      })
    }
    if (this.activeTasks === 0 && !this.tasks.some((t) => t.status === 'queued')) {
      this.emit('idle')
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
        if (this.pauseIntent.has(task.id) || this.tasks.find((t) => t.id === task.id)?.status === 'paused') {
          this.pauseIntent.delete(task.id)
          this.patch(task.id, { status: 'paused', error: undefined })
        } else {
          this.patch(task.id, { status: 'cancelled', error: '已取消' })
        }
        this.emitUpdate()
        return
      }

      this.patch(task.id, {
        status: 'downloading',
        galleryId: parsed.galleryId,
        title: parsed.title,
        total: parsed.images.length,
        done: task.fillMissing ? task.done : 0,
        percent: task.fillMissing ? task.percent : 0,
        files: parsed.images.map((img, i) => ({
          id: `img_${i}`,
          name: String(i + 1).padStart(3, '0'),
          status: 'pending' as const,
        })),
      })
      this.emitUpdate()

      const existing = await this.opts.store.getGallery(parsed.source, parsed.galleryId)
      const overwrite = Boolean(task.overwrite || (existing && existing.images.length === 0))
      const fillMissing = Boolean(task.fillMissing)
      const rates = {
        byteRate: new RateTracker(),
        bytesDownloaded: { n: 0 },
      }

      const downloadOpts = {
        concurrency: fillMissing ? Math.min(2, this.opts.imageConcurrency) : this.opts.imageConcurrency,
        signal: ac.signal,
        overwrite,
        fillMissing,
        failedRetries: 3,
        onProgress: ({ done, total, failed, file, bytesDelta }) => {
          if (file) {
            this.mergeFileProgress(task.id, file, rates, done, total, failed, bytesDelta)
          } else {
            this.patch(task.id, {
              done,
              total,
              status: 'downloading',
              percent: computePercent(done, total),
              error: failed ? `失败 ${failed}` : undefined,
            })
            this.emitUpdate()
          }
        },
      }

      let meta
      try {
        meta = await downloadGallery(parsed, this.opts.store, downloadOpts)
      } catch (err) {
        if (
          !ac.signal.aborted &&
          !fillMissing &&
          err instanceof Error &&
          (err as Error & { partialMeta?: unknown }).partialMeta
        ) {
          meta = await downloadGallery(parsed, this.opts.store, {
            ...downloadOpts,
            fillMissing: true,
            concurrency: Math.min(2, this.opts.imageConcurrency),
            failedRetries: 2,
          })
        } else {
          throw err
        }
      } finally {
        task.fillMissing = undefined
      }

      this.patch(task.id, {
        status: 'completed',
        done: parsed.images.length,
        total: parsed.images.length,
        percent: 100,
        etaSec: 0,
        error: undefined,
      })
      this.emitUpdate()
      void this.emitAskExtract(task.id, meta)
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
      percent: 0,
      files: task.selectedIds!.map((id) => {
        const item = listManifestItems(stored.manifest).find((i) => i.id === id)
        return {
          id,
          name: item?.fileName || item?.label || id,
          status: 'pending' as const,
          bytesTotal: item?.size && item.size > 0 ? item.size : undefined,
        }
      }),
    })
    this.emitUpdate()

    // Seed expected byte total from known sizes
    {
      const files = this.tasks.find((t) => t.id === task.id)?.files ?? []
      const agg = aggregateByteProgress(files)
      if (agg.total > 0) {
        this.patch(task.id, {
          bytesReceived: 0,
          bytesTotal: agg.total,
          percent: 0,
        })
        this.emitUpdate()
      }
    }

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

    const rates = {
      byteRate: new RateTracker(),
      bytesDownloaded: { n: 0 },
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
        onProgress: ({ done, total, failed, lastError, file, bytesDelta }) => {
          if (file) {
            this.mergeFileProgress(task.id, file, rates, done, total, failed, bytesDelta)
            if (lastError && failed) {
              this.patch(task.id, {
                error: `失败 ${failed} · ${lastError}`,
              })
            }
          } else {
            this.patch(task.id, {
              done,
              total,
              status: 'downloading',
              percent: computePercent(done, total),
              error: failed
                ? `失败 ${failed}${lastError ? ` · ${lastError}` : ''}`
                : undefined,
            })
            this.emitUpdate()
          }
        },
      },
    )

    deleteResourceManifest(task.manifestId!)
    this.patch(task.id, {
      status: 'completed',
      done: meta.images.length,
      total: meta.images.length,
      percent: 100,
      etaSec: 0,
    })
    this.emitUpdate()
    void this.emitAskExtract(task.id, meta)
  }

  private async emitAskExtract(
    taskId: string,
    meta: {
      source: string
      galleryId: string
      title: string
      sourceUrl: string
      images: string[]
      author?: string
    },
  ): Promise<void> {
    const dir = this.opts.store.resolveGalleryDir(meta.source, meta.galleryId, meta.title)
    const { zipNames, renamedMeta } = await resolveZipArtifacts(dir, meta.images)
    if (renamedMeta) {
      const current = await this.opts.store.getGallery(meta.source, meta.galleryId)
      if (current) {
        await this.opts.store.upsertGallery({ ...current, images: renamedMeta })
        meta = { ...meta, images: renamedMeta }
      }
    }
    const zips = zipNames.length > 0 ? zipNames : findZipArtifacts(meta.images)
    if (zips.length === 0) return
    this.emit('askExtract', {
      taskId,
      source: meta.source,
      galleryId: meta.galleryId,
      title: meta.title,
      sourceUrl: meta.sourceUrl,
      author: meta.author,
      zipPaths: zips.map((name) => join(dir, name)),
    })
  }

  private handleTaskError(taskId: string, ac: AbortController, err: unknown): void {
    if (this.pauseIntent.has(taskId)) {
      this.pauseIntent.delete(taskId)
      this.patch(taskId, { status: 'paused', error: undefined })
      this.emitUpdate()
      return
    }
    const current = this.tasks.find((t) => t.id === taskId)
    if (current?.status === 'paused') {
      this.emitUpdate()
      return
    }
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
