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
      toast.success('已解压入库，可在「库」中查看')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setExtractError(msg)
      toast.error(msg)
    } finally {
      setExtractBusy(false)
    }
  }

  return (
    <section
      className={`page download-page${dragOver ? ' drop-active' : ''}`}
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
      <h2 className="page-title">下载</h2>
      <p className="muted field-hint">
        先选择来源，再粘贴或拖入对应链接。Telegram / Telegraph 解析后在右侧抽屉勾选资源。
      </p>

      <div className="source-seg" role="tablist" aria-label="下载来源">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={source === s.id}
            className={source === s.id ? 'source-seg-btn active' : 'source-seg-btn'}
            onClick={() => {
              setSource(s.id)
              setError('')
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <textarea
        className="url-box"
        data-focus="download-urls"
        rows={5}
        placeholder={
          source === 'xchina'
            ? 'https://xchina.co/photo/id-xxxxxxxx.html\n也可直接拖入链接'
            : source === 'telegram'
              ? 'https://t.me/channel/123\n可粘贴多条，合并为一套图'
              : 'https://telegra.ph/Article-01-01'
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="page-toolbar">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void parseUrls()}>
          {source === 'xchina' ? '开始下载' : '解析资源'}
        </button>
        {failedCount > 0 ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              void api.retryAllFailed().then((n) => {
                toast.success(n > 0 ? `已重试 ${n} 个失败任务` : '没有失败任务')
              })
            }}
          >
            重试全部失败（{failedCount}）
          </button>
        ) : null}
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {dragOver ? <p className="drop-hint">松开以加入下载</p> : null}

      <h3 className="page-subtitle">队列</h3>
      <ul className="task-list">
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
      {tasks.length === 0 ? (
        <p className="empty-hint">队列为空。选择来源并粘贴或拖入链接开始下载。</p>
      ) : null}

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
