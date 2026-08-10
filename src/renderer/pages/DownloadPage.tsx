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

export default function DownloadPage(): JSX.Element {
  const toast = useToast()
  const [segment, setSegment] = useState<'enqueue' | 'queue'>('enqueue')
  const [source, setSource] = useState<DownloadSource>('xchina')
  const [text, setText] = useState('')
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [manifest, setManifest] = useState<ResourceManifest | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [askExtract, setAskExtract] = useState<AskExtract | null>(null)
  const [extractBusy, setExtractBusy] = useState(false)
  const [extractError, setExtractError] = useState('')

  const failedCount = tasks.filter((t) => t.status === 'failed').length
  const activeCount = tasks.filter((t) =>
    ['queued', 'resolving', 'downloading', 'paused'].includes(t.status),
  ).length

  useEffect(() => {
    void api.listTasks().then(setTasks)
    const offQueue = api.onQueueUpdate(setTasks)
    const offExtract = api.onAskExtract((payload) => {
      setExtractError('')
      setAskExtract(payload)
    })
    return () => {
      offQueue()
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
          setError('xChina 不支持合并：将按多条分别入队')
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
              onClick={() => setSegment('queue')}
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
                      <span>⌘/Ctrl + V</span>
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
                      onClick={() => setSegment('queue')}
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
                <div className="queue-toolbar">
                  <p className="lead-sm">
                    {tasks.length === 0
                      ? '下载列表'
                      : `共 ${tasks.length} 项${activeCount > 0 ? ` · ${activeCount} 进行中` : ''}`}
                  </p>
                  <div className="row">
                    {failedCount > 0 ? (
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
                    ) : null}
                  </div>
                </div>
                {tasks.length === 0 ? (
                  <p className="empty-hint">队列为空</p>
                ) : (
                  <ul className="task-list" aria-live="polite" aria-label="下载列表">
                    {tasks.map((t) => (
                      <QueueTaskRow
                        key={t.id}
                        task={t}
                        onCancel={(id) => void api.cancelTask(id)}
                        onPause={(id) => void api.pauseTask(id)}
                        onResume={(id) => void api.resumeTask(id)}
                        onMove={(id, dir) => void api.moveTask(id, dir)}
                        onRetry={(id) => void api.retryTask(id)}
                      />
                    ))}
                  </ul>
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
