import { useEffect, useState, type DragEvent, type JSX } from 'react'
import ResourceDrawer, { listItems } from '../components/ResourceDrawer'
import QueueTaskRow from '../components/QueueTaskRow'
import ExtractZipModal from '../components/ExtractZipModal'
import { useToast } from '../lib/toast'
import { api, type DownloadSource, type QueueTask, type ResourceManifest } from '../lib/api'

const SOURCES: { id: DownloadSource; label: string }[] = [
  { id: 'xchina', label: 'xChina' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'telegraph', label: 'Telegraph' },
]

type AskExtract = {
  taskId: string
  source: string
  galleryId: string
  title: string
  sourceUrl: string
  author?: string
  zipPaths: string[]
}

function defaultIds(manifest: ResourceManifest): string[] {
  if (manifest.source === 'telegraph') return listItems(manifest).map((i) => i.id)
  return manifest.groups.post.map((i) => i.id)
}

function extractUrlsFromDrop(e: DragEvent): string[] {
  const uriList = e.dataTransfer.getData('text/uri-list')
  const plain = e.dataTransfer.getData('text/plain')
  const raw = [uriList, plain].filter(Boolean).join('\n')
  const found = raw
    .split(/[\r\n\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
  return [...new Set(found)]
}

const ACTIVE_QUEUE_STATUSES = new Set<QueueTask['status']>([
  'queued',
  'resolving',
  'downloading',
  'paused',
  'failed',
])
const DONE_QUEUE_STATUSES = new Set<QueueTask['status']>(['completed', 'skipped', 'cancelled'])

const ACTIVE_SORT: Partial<Record<QueueTask['status'], number>> = {
  downloading: 0,
  resolving: 1,
  queued: 2,
  paused: 3,
  failed: 4,
}

function sortActiveTasks(tasks: QueueTask[]): QueueTask[] {
  const index = new Map(tasks.map((t, i) => [t.id, i]))
  return [...tasks].sort((a, b) => {
    const rankA = ACTIVE_SORT[a.status] ?? 9
    const rankB = ACTIVE_SORT[b.status] ?? 9
    if (rankA !== rankB) return rankA - rankB
    return (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0)
  })
}

function sortCompletedTasks(tasks: QueueTask[]): QueueTask[] {
  return [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

type QueueTaskHandlers = {
  onCancel: (id: string) => void
  onPause: (id: string) => void
  onResume: (id: string) => void
  onMove: (id: string, direction: 'up' | 'down') => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
}

function renderTaskList(tasks: QueueTask[], handlers: QueueTaskHandlers): JSX.Element {
  return (
    <ul className="task-list" aria-live="polite">
      {tasks.map((t) => (
        <QueueTaskRow
          key={t.id}
          task={t}
          onCancel={handlers.onCancel}
          onPause={handlers.onPause}
          onResume={handlers.onResume}
          onMove={handlers.onMove}
          onRetry={handlers.onRetry}
          onRemove={handlers.onRemove}
        />
      ))}
    </ul>
  )
}

export default function DownloadPage({ tasks }: { tasks: QueueTask[] }): JSX.Element {
  const toast = useToast()
  const [segment, setSegment] = useState<'enqueue' | 'queue'>('enqueue')
  const [queueTab, setQueueTab] = useState<'active' | 'done'>('active')
  const [source, setSource] = useState<DownloadSource>('xchina')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [manifest, setManifest] = useState<ResourceManifest | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [askExtract, setAskExtract] = useState<AskExtract | null>(null)
  const [extractBusy, setExtractBusy] = useState(false)
  const [extractError, setExtractError] = useState('')

  const failedCount = tasks.filter((t) => t.status === 'failed').length
  const partialCount = tasks.filter(
    (t) => t.status === 'completed' && Boolean(t.error?.includes('部分下载失败')),
  ).length
  const activeCount = tasks.filter((t) =>
    ['queued', 'resolving', 'downloading', 'paused'].includes(t.status),
  ).length
  const pausedCount = tasks.filter((t) => t.status === 'paused').length
  const runningCount = tasks.filter((t) =>
    ['queued', 'resolving', 'downloading'].includes(t.status),
  ).length
  const activeTasks = sortActiveTasks(tasks.filter((t) => ACTIVE_QUEUE_STATUSES.has(t.status)))
  const completedTasks = sortCompletedTasks(tasks.filter((t) => DONE_QUEUE_STATUSES.has(t.status)))
  const taskHandlers: QueueTaskHandlers = {
    onCancel: (id) => void api.cancelTask(id),
    onPause: (id) => void api.pauseTask(id),
    onResume: (id) => void api.resumeTask(id),
    onMove: (id, dir) => void api.moveTask(id, dir),
    onRetry: (id) => void api.retryTask(id),
    onRemove: (id) => {
      void api.removeTask(id).then((ok) => {
        if (ok) toast.success('已移除任务')
      })
    },
  }

  useEffect(() => {
    const offExtract = api.onAskExtract((payload) => {
      setExtractError('')
      setAskExtract(payload)
    })
    return () => {
      offExtract()
    }
  }, [])

  async function parseUrls(): Promise<void> {
    const urls = text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (urls.length === 0) {
      setError('请粘贴链接')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (source === 'xchina') {
        if (urls.length > 1) {
          toast.info('xChina 不支持合并，已按多条分别入队')
        }
        await api.enqueueUrls(source, urls)
        setText('')
        toast.success(urls.length > 1 ? `已入队 ${urls.length} 条` : '已加入下载队列')
        return
      }
      if (source === 'telegraph' && urls.length !== 1) {
        setError('Telegraph 每次请只粘贴一条链接（多链接合并仅支持 Telegram）')
        return
      }
      const m = await api.discoverResources(source, urls)
      setManifest(m)
      setSelected(new Set(defaultIds(m)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleUrlDrop(e: DragEvent): Promise<void> {
    e.preventDefault()
    setDragOver(false)
    const urls = extractUrlsFromDrop(e)
    if (urls.length === 0) {
      toast.info('未识别到链接，请拖入 http(s) URL')
      return
    }
    if (source === 'telegram' || source === 'telegraph') {
      setText((prev) => (prev.trim() ? `${prev.trim()}\n${urls.join('\n')}` : urls.join('\n')))
      toast.info('已填入链接，请点击「解析资源」勾选后下载')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.enqueueUrls(source, urls)
      toast.success(urls.length > 1 ? `已入队 ${urls.length} 条` : '已加入下载队列')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectIds(ids: string[], mode: 'replace' | 'add' = 'replace'): void {
    setSelected((prev) => {
      if (mode === 'replace') return new Set(ids)
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
  }

  async function downloadSelected(): Promise<void> {
    if (!manifest) return
    setBusy(true)
    setError('')
    try {
      await api.enqueueSelected(manifest.id, Array.from(selected))
      setManifest(null)
      setSelected(new Set())
      setText('')
      toast.success('已加入下载队列')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function runExtract(opts: { password: string; deleteZip: boolean }): Promise<void> {
    if (!askExtract) return
    const payload = askExtract
    setExtractBusy(true)
    setExtractError('')
    try {
      for (const zipPath of payload.zipPaths) {
        await api.extractZip({
          zipPath,
          deleteZip: opts.deleteZip,
          password: opts.password || undefined,
          intoExisting: true,
          source: payload.source,
          galleryId: payload.galleryId,
          title: payload.title,
          sourceUrl: payload.sourceUrl,
          author: payload.author,
        })
      }
      setAskExtract(null)
      toast.success('已解压入库，可在浏览中查看')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setExtractError(msg)
      toast.error(msg)
    } finally {
      setExtractBusy(false)
    }
  }

  return (
    <section className="page download-page panel wide">
      <div className="work-shell">
        <div className="work-layout">
          <nav className="work-nav" aria-label="获取分段">
            <div className="work-nav-label">流程</div>
            <button
              type="button"
              className={segment === 'enqueue' ? 'work-nav-btn active' : 'work-nav-btn'}
              role="tab"
              aria-selected={segment === 'enqueue'}
              onClick={() => setSegment('enqueue')}
            >
              入队
            </button>
            <button
              type="button"
              className={segment === 'queue' ? 'work-nav-btn active' : 'work-nav-btn'}
              role="tab"
              aria-selected={segment === 'queue'}
              onClick={() => {
                setQueueTab('active')
                setSegment('queue')
              }}
            >
              <span>队列</span>
              {activeCount > 0 ? <span className="nav-count">{activeCount}</span> : null}
            </button>
          </nav>

          <div className="work-body">
            {segment === 'enqueue' ? (
              <div className="work-pane active">
                <h3 className="pane-title">粘贴链接开始下载</h3>
                <div className="composer">
                  <div className="source-cards" role="tablist" aria-label="下载来源">
                    {SOURCES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="tab"
                        aria-selected={source === s.id}
                        className={source === s.id ? 'source-card active' : 'source-card'}
                        onClick={() => {
                          setSource(s.id)
                          setError('')
                        }}
                      >
                        <span className="sc-name">{s.label}</span>
                      </button>
                    ))}
                  </div>

                  <div
                    className={`url-composer${dragOver ? ' over' : ''}`}
                    onDragEnter={(e) => {
                      e.preventDefault()
                      setDragOver(true)
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOver(true)
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget === e.target) setDragOver(false)
                    }}
                    onDrop={(e) => void handleUrlDrop(e)}
                  >
                    <textarea
                      data-focus="download-urls"
                      placeholder={
                        source === 'xchina'
                          ? 'https://xchina.co/photo/id-xxxxxxxx.html'
                          : source === 'telegram'
                            ? 'https://t.me/channel/123'
                            : 'https://telegra.ph/Article-01-01'
                      }
                      spellCheck={false}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <div className="url-composer-meta">
                      <span>Ctrl / ⌘ + V</span>
                    </div>
                  </div>

                  <div className="composer-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => void parseUrls()}
                    >
                      {source === 'xchina' ? '开始下载' : '解析资源'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={!text}
                      onClick={() => {
                        setText('')
                        setError('')
                      }}
                    >
                      清空
                    </button>
                    <span className="spacer" />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setQueueTab('active')
                        setSegment('queue')
                      }}
                    >
                      查看队列
                    </button>
                  </div>
                  {error ? <p className="error-text">{error}</p> : null}
                </div>
              </div>
            ) : null}

            {segment === 'queue' ? (
              <div className="work-pane active">
                <h3 className="pane-title">下载队列</h3>
                {tasks.length > 0 ? (
                  <div
                    className="queue-tabs"
                    role="tablist"
                    aria-label="队列分类"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={queueTab === 'active'}
                      className={queueTab === 'active' ? 'queue-tab active' : 'queue-tab'}
                      onClick={() => setQueueTab('active')}
                    >
                      <span>下载中</span>
                      {activeTasks.length > 0 ? (
                        <span className="nav-count">{activeTasks.length}</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={queueTab === 'done'}
                      className={queueTab === 'done' ? 'queue-tab active' : 'queue-tab'}
                      onClick={() => setQueueTab('done')}
                    >
                      <span>已完成</span>
                      {completedTasks.length > 0 ? (
                        <span className="nav-count">{completedTasks.length}</span>
                      ) : null}
                    </button>
                  </div>
                ) : null}
                <div className="queue-toolbar">
                  <p className="lead-sm">
                    {tasks.length === 0
                      ? '下载列表'
                      : queueTab === 'active'
                        ? runningCount > 0
                          ? `${runningCount} 个任务运行中${pausedCount > 0 ? ` · ${pausedCount} 已暂停` : ''}${failedCount > 0 ? ` · ${failedCount} 失败` : ''}`
                          : pausedCount > 0
                            ? `${pausedCount} 个任务已暂停${failedCount > 0 ? ` · ${failedCount} 失败` : ''}`
                            : failedCount > 0
                              ? `${failedCount} 个任务失败`
                              : '暂无进行中的任务'
                        : completedTasks.length > 0
                          ? `${completedTasks.length} 个任务已完成`
                          : '暂无已完成任务'}
                  </p>
                  <div className="row queue-toolbar-actions">
                    {queueTab === 'active' && runningCount > 0 ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => {
                          void api.pauseAllActive().then((n) => {
                            toast.success(n > 0 ? `已暂停 ${n} 个任务` : '没有可暂停的任务')
                          })
                        }}
                      >
                        全部暂停
                      </button>
                    ) : null}
                    {queueTab === 'active' && pausedCount > 0 ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => {
                          void api.resumeAllPaused().then((n) => {
                            toast.success(n > 0 ? `已继续 ${n} 个任务` : '没有已暂停的任务')
                          })
                        }}
                      >
                        全部继续
                      </button>
                    ) : null}
                    {queueTab === 'active' && failedCount > 0 ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => {
                            void api.retryAllFailed().then((n) => {
                              toast.success(n > 0 ? `已重试 ${n} 个失败任务` : '没有失败任务')
                            })
                          }}
                        >
                          重试全部失败
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => {
                            void api.clearFailed().then((n) => {
                              toast.success(n > 0 ? `已清除 ${n} 个失败任务` : '没有失败任务')
                            })
                          }}
                        >
                          清除失败
                        </button>
                      </>
                    ) : null}
                    {queueTab === 'done' && partialCount > 0 ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => {
                          void api.retryAllFailed().then((n) => {
                            toast.success(n > 0 ? `已补全 ${n} 个任务` : '没有需要补全的任务')
                            setQueueTab('active')
                          })
                        }}
                      >
                        补全全部失败
                      </button>
                    ) : null}
                    {queueTab === 'done' && completedTasks.length > 0 ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => {
                          void api.clearCompleted().then((n) => {
                            toast.success(n > 0 ? `已清空 ${n} 个已完成任务` : '没有已完成任务')
                          })
                        }}
                      >
                        清空已完成
                      </button>
                    ) : null}
                  </div>
                </div>
                {tasks.length === 0 ? (
                  <p className="empty-hint">队列为空</p>
                ) : queueTab === 'active' ? (
                  activeTasks.length > 0 ? (
                    renderTaskList(activeTasks, taskHandlers)
                  ) : (
                    <p className="empty-hint">暂无进行中的任务</p>
                  )
                ) : completedTasks.length > 0 ? (
                  renderTaskList(completedTasks, taskHandlers)
                ) : (
                  <p className="empty-hint">暂无已完成任务</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {manifest ? (
        <ResourceDrawer
          manifest={manifest}
          selected={selected}
          busy={busy}
          error={error}
          onToggle={toggle}
          onSelectIds={selectIds}
          onDownload={() => void downloadSelected()}
          onClose={() => {
            setManifest(null)
            setSelected(new Set())
            setError('')
          }}
        />
      ) : null}

      {askExtract ? (
        <ExtractZipModal
          title={askExtract.title}
          zipPaths={askExtract.zipPaths}
          busy={extractBusy}
          error={extractError}
          intoExisting
          onSkip={() => {
            setAskExtract(null)
            setExtractError('')
            toast.info('已保留压缩包，可稍后在图库右键解压')
          }}
          onConfirm={(opts) => void runExtract(opts)}
        />
      ) : null}
    </section>
  )
}
