import { useEffect, useMemo, useState, type JSX } from 'react'
import { api, type DownloadSource, type QueueTask, type ResourceManifest } from '../lib/api'

const statusLabel: Record<QueueTask['status'], string> = {
  queued: '等待',
  resolving: '解析中',
  downloading: '下载中',
  completed: '完成',
  failed: '失败',
  skipped: '跳过',
  cancelled: '已取消',
}

const SOURCES: { id: DownloadSource; label: string }[] = [
  { id: 'xchina', label: 'xChina' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'telegraph', label: 'Telegraph' },
]

type PickerItem = ResourceManifest['groups']['post'][number]

function listItems(manifest: ResourceManifest): PickerItem[] {
  return [
    ...manifest.groups.post,
    ...manifest.groups.comments.flatMap((c) => c.items),
    ...manifest.groups.telegraph.flatMap((t) => t.items),
  ]
}

function defaultIds(manifest: ResourceManifest): string[] {
  if (manifest.source === 'telegraph') return listItems(manifest).map((i) => i.id)
  return manifest.groups.post.map((i) => i.id)
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    photo: '图片',
    video: '视频',
    animation: '动图',
    document: '文件',
    telegraph_image: 'Telegraph 图',
    telegraph_file: 'Telegraph 文件',
  }
  return map[kind] ?? kind
}

export default function DownloadPage(): JSX.Element {
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

  const allItems = useMemo(() => (manifest ? listItems(manifest) : []), [manifest])

  async function startDirect(): Promise<void> {
    const urls = text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (urls.length === 0) return
    setBusy(true)
    setError('')
    try {
      if (source === 'telegram' || source === 'telegraph') {
        const m = await api.discoverResources(source, urls)
        setManifest(m)
        setSelected(new Set(defaultIds(m)))
        setText('')
      } else {
        await api.enqueueUrls(source, urls)
        setText('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function discover(): Promise<void> {
    const urls = text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (urls.length === 0) {
      setError('请粘贴链接')
      return
    }
    if (source === 'xchina') {
      setError('xChina 无需解析，直接点开始下载')
      return
    }
    if (source !== 'telegram' && urls.length !== 1) {
      setError('该来源每次请只粘贴一条链接')
      return
    }
    setBusy(true)
    setError('')
    try {
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

  function selectByKinds(kinds: string[], only = false): void {
    const ids = allItems.filter((i) => kinds.includes(i.kind)).map((i) => i.id)
    setSelected((prev) => {
      if (only) return new Set(ids)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page">
      <h2 className="page-title">下载队列</h2>
      <p className="muted">先选择来源，再粘贴对应链接。Telegram / Telegraph 会打开资源选择后再下载。</p>
      <div className="source-seg" role="tablist" aria-label="下载来源">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={source === s.id}
            className={source === s.id ? 'source-seg-btn active' : 'source-seg-btn'}
            onClick={() => setSource(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        className="url-box"
        rows={6}
        placeholder={
          source === 'xchina'
            ? 'https://xchina.co/photo/id-xxxxxxxx.html'
            : source === 'telegram'
              ? 'https://t.me/channel/123'
              : 'https://telegra.ph/Article-01-01'
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="page-toolbar">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void startDirect()}>
          {source === 'xchina' ? '开始下载' : '解析并选择'}
        </button>
        {source !== 'xchina' ? (
          <button type="button" className="btn" disabled={busy} onClick={() => void discover()}>
            仅解析资源
          </button>
        ) : null}
      </div>
      {error ? <p className="error-text">{error}</p> : null}

      {manifest ? (
        <div className="resource-picker">
          <div className="resource-picker-head">
            <strong>{manifest.title}</strong>
            <span className="muted">
              {manifest.source} · {manifest.sourceUrl}
            </span>
          </div>
          <div className="page-toolbar wrap">
            <button type="button" className="btn" onClick={() => setSelected(new Set(manifest.groups.post.map((i) => i.id)))}>
              仅主帖
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                setSelected(
                  new Set([
                    ...manifest.groups.post.map((i) => i.id),
                    ...manifest.groups.comments.flatMap((c) => c.items.map((i) => i.id)),
                  ]),
                )
              }
            >
              主帖+评论
            </button>
            <button type="button" className="btn" onClick={() => selectByKinds(['photo', 'telegraph_image'])}>
              选图片
            </button>
            <button type="button" className="btn" onClick={() => selectByKinds(['video', 'animation'])}>
              选视频
            </button>
            <button type="button" className="btn" onClick={() => selectByKinds(['document', 'telegraph_file'])}>
              选文件
            </button>
            <button type="button" className="btn" onClick={() => setSelected(new Set(allItems.map((i) => i.id)))}>
              全选
            </button>
            <button type="button" className="btn" onClick={() => setSelected(new Set())}>
              清空
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy || selected.size === 0}
              onClick={() => void downloadSelected()}
            >
              下载所选（{selected.size}）
            </button>
          </div>

          {manifest.groups.post.length > 0 ? (
            <div className="resource-group">
              <h3>主帖</h3>
              <ul className="resource-list">
                {manifest.groups.post.map((item) => (
                  <li key={item.id}>
                    <label className="resource-item">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                      <span>
                        {item.label}
                        <span className="muted"> · {kindLabel(item.kind)}</span>
                        {item.fileName ? <span className="muted"> · {item.fileName}</span> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {manifest.groups.comments.map((c) => (
            <div className="resource-group" key={c.commentId}>
              <h3>
                评论 #{c.index}
                {c.textPreview ? <span className="muted"> — {c.textPreview}</span> : null}
              </h3>
              {c.items.length === 0 ? (
                <p className="muted">无媒体（可能仅含 Telegraph 链接，见下方）</p>
              ) : (
                <ul className="resource-list">
                  {c.items.map((item) => (
                    <li key={item.id}>
                      <label className="resource-item">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                        />
                        <span>
                          {item.label}
                          <span className="muted"> · {kindLabel(item.kind)}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {manifest.groups.telegraph.map((g) => (
            <div className="resource-group" key={g.url}>
              <h3>
                Telegraph：{g.title || g.url}
                {g.fromOrigin === 'comment' ? (
                  <span className="muted">（来自评论）</span>
                ) : g.fromOrigin === 'post' ? (
                  <span className="muted">（来自主帖）</span>
                ) : null}
              </h3>
              <ul className="resource-list">
                {g.items.map((item) => (
                  <li key={item.id}>
                    <label className="resource-item">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                      <span>
                        {item.label}
                        <span className="muted"> · {kindLabel(item.kind)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <ul className="task-list">
        {tasks.map((t) => (
          <li key={t.id} className={`task-item status-${t.status}`}>
            <div className="task-main">
              <strong>{t.title || t.url}</strong>
              <span className="muted">
                {statusLabel[t.status]}
                {t.total > 0 ? ` · ${t.done}/${t.total}` : ''}
              </span>
              {t.error ? <span className="error-text">{t.error}</span> : null}
            </div>
            {(t.status === 'queued' || t.status === 'resolving' || t.status === 'downloading') && (
              <button type="button" className="btn" onClick={() => void api.cancelTask(t.id)}>
                取消
              </button>
            )}
          </li>
        ))}
      </ul>
      {tasks.length === 0 ? <p className="empty-hint">队列为空</p> : null}
    </section>
  )
}
