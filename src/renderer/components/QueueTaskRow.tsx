import { useState, type JSX } from 'react'
import type { QueueTask } from '../lib/api'

const statusLabel: Record<QueueTask['status'], string> = {
  queued: '等待',
  resolving: '解析中',
  downloading: '下载中',
  completed: '完成',
  failed: '失败',
  skipped: '跳过',
  cancelled: '已取消',
}

function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return ''
  if (bps < 1024) return `${bps} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatEta(sec?: number | null): string {
  if (sec == null || sec < 0) return ''
  if (sec < 60) return `约 ${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `约 ${m}m ${s}s`
}

const fileStatusLabel: Record<string, string> = {
  pending: '等待',
  downloading: '下载中',
  done: '完成',
  failed: '失败',
}

export type QueueTaskRowProps = {
  task: QueueTask
  onCancel: (id: string) => void
}

export default function QueueTaskRow({ task, onCancel }: QueueTaskRowProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const percent = task.percent ?? (task.total > 0 ? Math.round((task.done / task.total) * 100) : 0)
  const canCancel =
    task.status === 'queued' || task.status === 'resolving' || task.status === 'downloading'
  const speed = formatSpeed(task.bytesPerSec)
  const eta = formatEta(task.etaSec)

  return (
    <li className={`task-item status-${task.status}`}>
      <div className="task-main">
        <div className="task-title-row">
          <strong>{task.title || task.url}</strong>
          {task.files && task.files.length > 0 ? (
            <button type="button" className="btn tiny" onClick={() => setOpen((v) => !v)}>
              {open ? '收起' : '明细'}
            </button>
          ) : null}
        </div>
        <div className="task-meta muted">
          <span>{statusLabel[task.status]}</span>
          {task.total > 0 ? (
            <span className="mono-num">
              · {task.done}/{task.total} · {percent}%
            </span>
          ) : null}
          {speed ? <span className="mono-num"> · {speed}</span> : null}
          {eta && task.status === 'downloading' ? <span className="mono-num"> · {eta}</span> : null}
        </div>
        {(task.status === 'downloading' || task.status === 'resolving') && task.total > 0 ? (
          <div className="progress-track" aria-hidden>
            <div className="progress-fill" style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
        ) : null}
        {task.error ? <span className="error-text">{task.error}</span> : null}
        {open && task.files ? (
          <ul className="task-files">
            {task.files.map((f) => (
              <li key={f.id} className={`task-file status-${f.status}`}>
                <span>{f.name}</span>
                <span className="muted">{fileStatusLabel[f.status] ?? f.status}</span>
                {f.error ? <span className="error-text">{f.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {canCancel ? (
        <button type="button" className="btn" onClick={() => onCancel(task.id)}>
          取消
        </button>
      ) : null}
    </li>
  )
}
