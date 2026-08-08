import { useEffect, useState, type JSX } from 'react'
import { api, type QueueTask } from '../lib/api'

const statusLabel: Record<QueueTask['status'], string> = {
  queued: '等待',
  resolving: '解析中',
  downloading: '下载中',
  completed: '完成',
  failed: '失败',
  skipped: '跳过',
  cancelled: '已取消',
}

export default function DownloadPage(): JSX.Element {
  const [text, setText] = useState('')
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.listTasks().then(setTasks)
    return api.onQueueUpdate(setTasks)
  }, [])

  async function start(): Promise<void> {
    const urls = text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (urls.length === 0) return
    setBusy(true)
    try {
      await api.enqueueUrls(urls)
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page">
      <h2 className="page-title">下载队列</h2>
      <p className="muted">支持一次粘贴多个 URL（换行或逗号分隔）。首版来源：xChina。</p>
      <textarea
        className="url-box"
        rows={6}
        placeholder="https://xchina.co/photo/id-xxxxxxxx.html"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="page-toolbar">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void start()}>
          开始下载
        </button>
      </div>

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
