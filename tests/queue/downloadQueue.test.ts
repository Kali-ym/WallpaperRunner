import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@main/http/client', () => ({
  httpFetch: vi.fn(),
  setHttpProxy: vi.fn(),
  getHttpProxy: vi.fn(() => null),
  getPreferCurl: vi.fn(() => false),
  curlDownloadToFile: vi.fn(),
}))

import { httpFetch } from '@main/http/client'
import { clearAdapters, registerAdapter } from '@main/adapters/registry'
import type { SourceAdapter } from '@main/adapters/types'
import { LibraryStore } from '@main/library/store'
import { DownloadQueue } from '@main/queue/downloadQueue'
import { normalizeTasksForRestore, trimTerminalTasks } from '@main/queue/persist'
import type { QueueTask } from '@main/queue/types'

describe('queue persist helpers', () => {
  it('normalizeTasksForRestore resets downloading, resolving and paused to queued', () => {
    const now = new Date().toISOString()
    const tasks: QueueTask[] = [
      {
        id: 'a',
        url: 'https://x',
        status: 'downloading',
        done: 1,
        total: 3,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'b',
        url: 'https://y',
        status: 'resolving',
        done: 0,
        total: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'c',
        url: 'https://z',
        status: 'queued',
        done: 0,
        total: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'd',
        url: 'https://p',
        status: 'paused',
        done: 0,
        total: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]
    const next = normalizeTasksForRestore(tasks)
    expect(next.map((t) => t.status)).toEqual(['queued', 'queued', 'queued', 'queued'])
  })

  it('trimTerminalTasks keeps last N terminal tasks', () => {
    const base = new Date('2026-01-01T00:00:00.000Z').getTime()
    const tasks: QueueTask[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      url: `https://x/${i}`,
      status: (i < 2 ? 'queued' : 'completed') as QueueTask['status'],
      done: 0,
      total: 0,
      createdAt: new Date(base + i).toISOString(),
      updatedAt: new Date(base + i).toISOString(),
    }))
    const trimmed = trimTerminalTasks(tasks, 2)
    expect(trimmed.filter((t) => t.status === 'queued')).toHaveLength(2)
    expect(trimmed.filter((t) => t.status === 'completed')).toHaveLength(2)
  })
})

describe('DownloadQueue', () => {
  const dirs: string[] = []

  beforeEach(() => {
    clearAdapters()
    const bytes = Buffer.alloc(2048, 2)
    vi.mocked(httpFetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => bytes,
      text: async () => '',
    } as unknown as Response)
  })

  afterEach(async () => {
    clearAdapters()
    vi.mocked(httpFetch).mockReset()
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('fails unsupported sources and completes fake adapter downloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'q-'))
    dirs.push(root)
    const store = new LibraryStore(root)

    const fake: SourceAdapter = {
      id: 'fake',
      name: 'Fake',
      match: (u) => u.includes('fake.test'),
      parseGallery: async (url) => ({
        source: 'fake',
        galleryId: 'g1',
        title: '假套图',
        sourceUrl: url,
        author: 'A',
        tags: ['t'],
        pageCount: 1,
        coverUrl: 'https://example.com/1.jpg',
        images: [
          { index: 1, url: 'https://example.com/1.jpg' },
          { index: 2, url: 'https://example.com/2.jpg' },
        ],
      }),
    }
    registerAdapter(fake)

    const queue = new DownloadQueue({ store, imageConcurrency: 2 })

    await new Promise<void>((resolve) => {
      queue.on('idle', () => resolve())
      queue.enqueue(['https://nope.example/x', 'https://fake.test/gallery'])
    })

    const tasks = queue.listTasks()
    expect(tasks[0].status).toBe('failed')
    expect(tasks[0].error).toBe('暂不支持该来源')
    expect(tasks[1].status).toBe('completed')
    expect(tasks[1].done).toBe(2)
    expect(await store.galleryExists('fake', 'g1')).toBe(true)
  })

  it('persists queue and restores downloading as queued', async () => {
    const root = await mkdtemp(join(tmpdir(), 'q-persist-'))
    dirs.push(root)
    const persistPath = join(root, 'queue.json')
    const now = new Date().toISOString()
    await writeFile(
      persistPath,
      JSON.stringify({
        updatedAt: now,
        tasks: [
          {
            id: 'task_1',
            url: 'https://fake.test/gallery',
            status: 'downloading',
            source: 'fake',
            done: 1,
            total: 2,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
      'utf8',
    )

    const store = new LibraryStore(root)
    const queue = new DownloadQueue({ store, imageConcurrency: 1, persistPath })
    await queue.restoreFromDisk({ autoStart: false })
    const tasks = queue.listTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.status).toBe('queued')
    expect(tasks[0]?.url).toBe('https://fake.test/gallery')
  })

  it('pause/resume queued tasks, move, and retry failed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'q-ctrl-'))
    dirs.push(root)
    const store = new LibraryStore(root)
    const queue = new DownloadQueue({ store, imageConcurrency: 1 })
    queue.pause()

    const [a, b] = queue.enqueue(['https://a.example/1', 'https://b.example/2'])
    expect(a?.status).toBe('queued')
    expect(b?.status).toBe('queued')

    queue.pauseTask(a!.id)
    expect(queue.listTasks().find((t) => t.id === a!.id)?.status).toBe('paused')

    queue.moveTask(b!.id, 'up')
    const ordered = queue.listTasks().map((t) => t.id)
    expect(ordered.indexOf(b!.id)).toBeLessThan(ordered.indexOf(a!.id))

    queue.resumeTask(a!.id)
    expect(queue.listTasks().find((t) => t.id === a!.id)?.status).toBe('queued')

    await new Promise<void>((resolve) => {
      queue.on('idle', () => resolve())
      queue.resume()
    })

    expect(queue.listTasks().every((t) => t.status === 'failed')).toBe(true)

    queue.pause()
    const n = queue.retryAllFailed()
    expect(n).toBe(2)
    expect(queue.listTasks().every((t) => t.status === 'queued')).toBe(true)

    queue.cancel(a!.id)
    expect(queue.listTasks().find((t) => t.id === a!.id)?.status).toBe('cancelled')
    queue.retryTask(a!.id)
    expect(queue.listTasks().find((t) => t.id === a!.id)?.status).toBe('queued')
  })

  it('moveTask skips downloading neighbors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'q-move-'))
    dirs.push(root)
    const store = new LibraryStore(root)
    const queue = new DownloadQueue({ store, imageConcurrency: 1 })
    queue.pause()

    const [a, b, c] = queue.enqueue([
      'https://a.example/1',
      'https://b.example/2',
      'https://c.example/3',
    ])
    const mid = (queue as unknown as { tasks: QueueTask[] }).tasks.find((t) => t.id === b!.id)
    if (mid) mid.status = 'downloading'

    queue.moveTask(c!.id, 'up')
    expect(queue.listTasks().map((t) => t.id)).toEqual([c!.id, b!.id, a!.id])
  })

  it('batch pause/resume, remove terminal tasks, and clear groups', async () => {
    const root = await mkdtemp(join(tmpdir(), 'q-batch-'))
    dirs.push(root)
    const store = new LibraryStore(root)
    const queue = new DownloadQueue({ store, imageConcurrency: 1 })
    queue.pause()

    const now = new Date().toISOString()
    queue.enqueue(['https://run.example/1', 'https://run.example/2'])
    const tasks = queue.listTasks()
    queue.pauseTask(tasks[0]!.id)

    expect(queue.pauseAllActive()).toBe(1)
    expect(queue.listTasks().every((t) => t.status === 'paused')).toBe(true)
    expect(queue.resumeAllPaused()).toBe(2)
    expect(queue.listTasks().every((t) => t.status === 'queued')).toBe(true)

    ;(queue as unknown as { tasks: QueueTask[] }).tasks.push({
      id: 'done_1',
      url: 'https://done.example/1',
      status: 'completed',
      done: 1,
      total: 1,
      createdAt: now,
      updatedAt: now,
    })
    ;(queue as unknown as { tasks: QueueTask[] }).tasks.push({
      id: 'fail_1',
      url: 'https://fail.example/1',
      status: 'failed',
      done: 0,
      total: 1,
      error: 'HTTP 403',
      createdAt: now,
      updatedAt: now,
    })

    expect(queue.removeTask('done_1')).toBe(true)
    expect(queue.removeTask('fail_1')).toBe(true)
    expect(queue.removeTask('missing')).toBe(false)
    expect(queue.removeTask(tasks[0]!.id)).toBe(false)

    ;(queue as unknown as { tasks: QueueTask[] }).tasks.push({
      id: 'done_2',
      url: 'https://done.example/2',
      status: 'completed',
      done: 2,
      total: 2,
      createdAt: now,
      updatedAt: now,
    })
    ;(queue as unknown as { tasks: QueueTask[] }).tasks.push({
      id: 'fail_2',
      url: 'https://fail.example/2',
      status: 'failed',
      done: 0,
      total: 1,
      createdAt: now,
      updatedAt: now,
    })

    expect(queue.clearCompleted()).toBe(1)
    expect(queue.clearFailed()).toBe(1)
    expect(queue.listTasks().every((t) => t.status === 'queued')).toBe(true)
  })
})
