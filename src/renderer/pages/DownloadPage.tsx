import { useEffect, useState, type JSX } from 'react'
import ResourceDrawer, { listItems } from '../components/ResourceDrawer'
import QueueTaskRow from '../components/QueueTaskRow'
import { useToast } from '../lib/toast'
import { api, type DownloadSource, type QueueTask, type ResourceManifest } from '../lib/api'

const SOURCES: { id: DownloadSource; label: string }[] = [
  { id: 'xchina', label: 'xChina' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'telegraph', label: 'Telegraph' },
]

function defaultIds(manifest: ResourceManifest): string[] {
  if (manifest.source === 'telegraph') return listItems(manifest).map((i) => i.id)
  return manifest.groups.post.map((i) => i.id)
}

export default function DownloadPage(): JSX.Element {
  const toast = useToast()
  const [source, setSource] = useState<DownloadSource>('xchina')
  const [text, setText] = useState('')
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [manifest, setManifest] = useState<ResourceManifest | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    void api.listTasks().then(setTasks)
    return api.onQueueUpdate(setTasks)
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

  return (
    <section className="page download-page">
      <h2 className="page-title">下载</h2>
      <p className="muted field-hint">
        先选择来源，再粘贴对应链接。Telegram / Telegraph 解析后在右侧抽屉勾选资源。
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
        rows={5}
        placeholder={
          source === 'xchina'
            ? 'https://xchina.co/photo/id-xxxxxxxx.html'
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
      </div>
      {error ? <p className="error-text">{error}</p> : null}

      <h3 className="page-subtitle">队列</h3>
      <ul className="task-list">
        {tasks.map((t) => (
          <QueueTaskRow key={t.id} task={t} onCancel={(id) => void api.cancelTask(id)} />
        ))}
      </ul>
      {tasks.length === 0 ? (
        <p className="empty-hint">队列为空。选择来源并粘贴链接开始下载。</p>
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
    </section>
  )
}
