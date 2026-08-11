import { useMemo, useState, type JSX } from 'react'
import { api, type QueueTask } from '../lib/api'

const ACTIVE = new Set(['queued', 'resolving', 'downloading', 'paused'])

const STATUS_LABEL: Record<QueueTask['status'], string> = {
  queued: '等待中',
  resolving: '解析中',
  downloading: '下载中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  skipped: '已跳过',
  cancelled: '已取消',
}

const SOURCE_LABEL: Record<string, string> = {
  xchina: 'xChina',
  telegram: 'Telegram',
  telegraph: 'Telegraph',
}

function isActive(t: QueueTask): boolean {
  return ACTIVE.has(t.status)
}

function labelOf(t: QueueTask): string {
  return t.title?.trim() || t.url
}

function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return ''
  if (bps < 1024) return `${bps} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}

function taskPercent(task: QueueTask): number {
  if (task.percent != null) return Math.min(100, Math.round(task.percent))
  if (task.bytesTotal && task.bytesTotal > 0 && task.bytesReceived != null) {
    return Math.min(100, Math.round((task.bytesReceived / task.bytesTotal) * 100))
  }
  if (task.total > 0) return Math.min(100, Math.round((task.done / task.total) * 100))
  return 0
}

function aggregatePercent(tasks: QueueTask[]): number {
  const doneSum = tasks.reduce((s, t) => s + (t.done || 0), 0)
  const totalSum = tasks.reduce((s, t) => s + (t.total || 0), 0)
  if (totalSum > 0) return Math.min(100, Math.round((doneSum / totalSum) * 100))
  if (tasks.length === 0) return 0
  return Math.round(tasks.reduce((s, t) => s + taskPercent(t), 0) / tasks.length)
}

interface DockItemProps {
  task: QueueTask
}

function DockItem({ task }: DockItemProps): JSX.Element {
  const percent = taskPercent(task)
  const speed = formatSpeed(task.bytesPerSec)
  const status = STATUS_LABEL[task.status] ?? task.status
  const source = task.source ? SOURCE_LABEL[task.source] ?? task.source : ''
  const countLabel = task.total > 0 ? `${task.done}/${task.total}` : ''
  const showBar =
    task.status === 'downloading' ||
    task.status === 'resolving' ||
    task.status === 'paused' ||
    (task.status === 'queued' && task.total > 0)

  const canPause =
    task.status === 'queued' || task.status === 'resolving' || task.status === 'downloading'
  const canResume = task.status === 'paused'
  const canCancel =
    task.status === 'queued' ||
    task.status === 'paused' ||
    task.status === 'resolving' ||
    task.status === 'downloading'

  return (
    <li className={`dock-item status-${task.status}`}>
      <div className="dock-item-head">
        <div className="dock-item-main">
          {source ? <span className="dock-item-source">{source}</span> : null}
          <span className="dock-item-title" title={labelOf(task)}>
            {labelOf(task)}
          </span>
        </div>
        <div className="dock-item-actions">
          {canResume ? (
            <button
              type="button"
              className="dock-icon-btn"
              aria-label="继续"
              onClick={() => void api.resumeTask(task.id)}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M9 7.5v9l8-4.5-8-4.5Z" fill="currentColor" />
              </svg>
            </button>
          ) : null}
          {canPause ? (
            <button
              type="button"
              className="dock-icon-btn"
              aria-label="暂停"
              onClick={() => void api.pauseTask(task.id)}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M8 7h3v10H8V7Zm5 0h3v10h-3V7Z" fill="currentColor" />
              </svg>
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              className="dock-icon-btn danger"
              aria-label="取消"
              onClick={() => void api.cancelTask(task.id)}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M7.5 7.5l9 9M16.5 7.5l-9 9"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
      {showBar ? (
        <div className="dock-item-bar" aria-hidden>
          <i style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <div className="dock-item-meta">
        <span>{speed || status}</span>
        <span>{countLabel || (showBar ? `${percent}%` : '')}</span>
      </div>
    </li>
  )
}

interface Props {
  tasks: QueueTask[]
}

export default function DownloadDock({ tasks }: Props): JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const active = useMemo(() => tasks.filter(isActive), [tasks])

  if (active.length === 0) return null

  const pct = aggregatePercent(active)
  const speed = active.find((t) => t.bytesPerSec && t.bytesPerSec > 0)?.bytesPerSec

  return (
    <aside className={`dock show${expanded ? ' expanded' : ''}`} id="dock" aria-live="polite">
      <button
        type="button"
        className="dock-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="dock-toggle-label" id="dock-summary">
          {expanded ? `传输列表 (${active.length})` : `传输中 · ${active.length} 项 · ${pct}%`}
          {!expanded && speed ? ` · ${formatSpeed(speed)}` : ''}
        </span>
        <span className="dock-chevron" aria-hidden="true">
          {expanded ? '▾' : '▴'}
        </span>
      </button>
      {!expanded ? (
        <div className="dock-bar" aria-hidden="true">
          <i id="dock-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <div className="dock-body" id="dock-body">
        <ul className="dock-list" id="dock-list">
          {active.slice(0, 6).map((t) => (
            <DockItem key={t.id} task={t} />
          ))}
        </ul>
      </div>
    </aside>
  )
}
