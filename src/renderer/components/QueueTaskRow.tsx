import { useEffect, useState, type JSX } from 'react'
import type { QueueTask } from '../lib/api'

const statusLabel: Record<QueueTask['status'], string> = {
  queued: '等待',
  resolving: '解析中',
  downloading: '下载中',
  paused: '已暂停',
  completed: '完成',
  failed: '失败',
  skipped: '跳过',
  cancelled: '已取消',
}

const SOURCE_LABEL: Record<string, string> = {
  xchina: 'xChina',
  telegram: 'Telegram',
  telegraph: 'Telegraph',
}

function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return ''
  if (bps < 1024) return `${bps} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatBytes(n?: number): string {
  if (n == null || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
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

function statusBadgeClass(status: QueueTask['status']): string {
  if (status === 'completed' || status === 'skipped') return 'status-badge ok'
  if (status === 'failed' || status === 'cancelled') return 'status-badge bad'
  if (status === 'downloading' || status === 'resolving') return 'status-badge warn'
  return 'status-badge'
}

export type QueueTaskRowProps = {
  task: QueueTask
  onCancel: (id: string) => void
  onPause?: (id: string) => void
  onResume?: (id: string) => void
  onMove?: (id: string, direction: 'up' | 'down') => void
  onRetry?: (id: string) => void
  onRemove?: (id: string) => void
}

export default function QueueTaskRow({
  task,
  onCancel,
  onPause,
  onResume,
  onMove,
  onRetry,
  onRemove,
}: QueueTaskRowProps): JSX.Element {
  const [open, setOpen] = useState(task.status === 'failed')
  useEffect(() => {
    if (task.status === 'failed') setOpen(true)
  }, [task.status])

  const percent =
    task.percent ??
    (task.bytesTotal && task.bytesTotal > 0 && task.bytesReceived != null
      ? Math.round((task.bytesReceived / task.bytesTotal) * 100)
      : task.total > 0
        ? Math.round((task.done / task.total) * 100)
        : 0)
  const canCancel =
    task.status === 'queued' ||
    task.status === 'paused' ||
    task.status === 'resolving' ||
    task.status === 'downloading'
  const canPause =
    task.status === 'queued' || task.status === 'resolving' || task.status === 'downloading'
  const canResume = task.status === 'paused'
  const canMove = task.status === 'queued' || task.status === 'paused'
  const canRetry = task.status === 'failed' || task.status === 'cancelled'
  const canFillPartial =
    task.status === 'completed' && Boolean(task.error?.includes('部分下载失败'))
  const canRemove =
    task.status === 'completed' ||
    task.status === 'failed' ||
    task.status === 'cancelled' ||
    task.status === 'skipped'
  const speed = formatSpeed(task.bytesPerSec)
  const eta = formatEta(task.etaSec)
  const source = task.source ? SOURCE_LABEL[task.source] ?? task.source : ''
  const sizeLabel =
    task.bytesReceived != null &&
    (task.status === 'downloading' || task.status === 'completed' || task.status === 'paused')
      ? task.bytesTotal && task.bytesTotal > 0
        ? `${formatBytes(task.bytesReceived)}/${formatBytes(task.bytesTotal)}`
        : formatBytes(task.bytesReceived)
      : ''
  const showBar =
    (task.status === 'downloading' || task.status === 'resolving' || task.status === 'paused') &&
    (Boolean(task.bytesTotal && task.bytesTotal > 0) || task.total > 0)
  const failedFiles = task.files?.filter((f) => f.status === 'failed').length ?? 0

  return (
    <li className={`task-item status-${task.status}`}>
      <div className="task-main">
        <div className="task-title-row">
          <div className="task-title-block">
            {source ? <span className="task-source-chip">{source}</span> : null}
            <strong title={task.title || task.url}>{task.title || task.url}</strong>
          </div>
          <div className="task-title-tools">
            <span className={statusBadgeClass(task.status)}>{statusLabel[task.status]}</span>
            {task.files && task.files.length > 0 ? (
              <button type="button" className="btn tiny" onClick={() => setOpen((v) => !v)}>
                {open ? '收起' : '明细'}
              </button>
            ) : null}
          </div>
        </div>
        <div className="task-meta muted">
          {task.total > 0 ? (
            <span className="mono-num st is-run">
              {task.done}/{task.total} 文件
            </span>
          ) : null}
          {sizeLabel ? (
            <span className="mono-num">
              {task.total > 0 ? ' · ' : ''}
              {sizeLabel}
              {task.bytesTotal && task.bytesTotal > 0 ? ` · ${percent}%` : ''}
            </span>
          ) : null}
          {speed ? <span className="mono-num"> · {speed}</span> : null}
          {eta && task.status === 'downloading' ? <span className="mono-num"> · {eta}</span> : null}
          {failedFiles > 0 ? <span className="mono-num st is-fail"> · 失败 {failedFiles}</span> : null}
        </div>
        {showBar ? (
          <div className="progress-track" aria-hidden>
            <div className="progress-fill" style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
        ) : null}
        {task.error ? <p className="task-error">{task.error}</p> : null}
        {open && task.files ? (
          <ul className="task-files">
            {task.files.map((f) => (
              <li key={f.id} className={`task-file status-${f.status}`}>
                <span>{f.name}</span>
                <span className="muted">{fileStatusLabel[f.status] ?? f.status}</span>
                {f.bytesReceived != null || f.bytesTotal != null ? (
                  <span className="mono muted">
                    {f.bytesTotal && f.bytesTotal > 0
                      ? `${formatBytes(f.bytesReceived ?? 0)}/${formatBytes(f.bytesTotal)}`
                      : formatBytes(f.bytesReceived)}
                  </span>
                ) : null}
                {f.error ? <span className="task-error">{f.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="task-actions">
        {canMove && onMove ? (
          <div className="task-action-group">
            <button type="button" className="btn tiny" title="上移" onClick={() => onMove(task.id, 'up')}>
              ↑
            </button>
            <button type="button" className="btn tiny" title="下移" onClick={() => onMove(task.id, 'down')}>
              ↓
            </button>
          </div>
        ) : null}
        {canPause && onPause ? (
          <button type="button" className="btn tiny" onClick={() => onPause(task.id)}>
            暂停
          </button>
        ) : null}
        {canResume && onResume ? (
          <button type="button" className="btn tiny primary" onClick={() => onResume(task.id)}>
            继续
          </button>
        ) : null}
        {canRetry && onRetry ? (
          <button type="button" className="btn tiny primary" onClick={() => onRetry(task.id)}>
            重试
          </button>
        ) : null}
        {canFillPartial && onRetry ? (
          <button type="button" className="btn tiny primary" onClick={() => onRetry(task.id)}>
            补全
          </button>
        ) : null}
        {canCancel ? (
          <button type="button" className="btn tiny" onClick={() => onCancel(task.id)}>
            取消
          </button>
        ) : null}
        {canRemove && onRemove ? (
          <button type="button" className="btn tiny" onClick={() => onRemove(task.id)}>
            移除
          </button>
        ) : null}
      </div>
    </li>
  )
}
