import { useMemo, useState, type JSX } from 'react'
import type { QueueTask } from '../lib/api'

const ACTIVE = new Set(['queued', 'resolving', 'downloading', 'paused'])

function isActive(t: QueueTask): boolean {
  return ACTIVE.has(t.status)
}

function labelOf(t: QueueTask): string {
  return t.title?.trim() || t.url
}

interface Props {
  tasks: QueueTask[]
  onOpenDownload: () => void
}

export default function DownloadDock({ tasks, onOpenDownload }: Props): JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const active = useMemo(() => tasks.filter(isActive), [tasks])

  if (active.length === 0) return null

  const doneSum = active.reduce((s, t) => s + (t.done || 0), 0)
  const totalSum = active.reduce((s, t) => s + (t.total || 0), 0)
  const pct =
    totalSum > 0
      ? Math.min(100, Math.round((doneSum / totalSum) * 100))
      : Math.round(
          active.reduce((s, t) => s + (t.percent ?? 0), 0) / Math.max(1, active.length),
        )
  const speed = active.find((t) => t.bytesPerSec && t.bytesPerSec > 0)?.bytesPerSec
  const eta = active.find((t) => t.etaSec != null)?.etaSec

  return (
    <aside
      className={`dock show${expanded ? ' expanded' : ''}`}
      id="dock"
      aria-live="polite"
    >
      <button
        type="button"
        className="dock-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span id="dock-summary">
          下载中 {active.length}
          {totalSum > 0 ? ` · ${pct}%` : ''}
          {speed ? ` · ${Math.round(speed / 1024)} KB/s` : ''}
          {eta != null && eta > 0 ? ` · ETA ${eta}s` : ''}
        </span>
        <span className="dock-chevron" aria-hidden="true">
          {expanded ? '▾' : '▴'}
        </span>
      </button>
      <div className="dock-bar" aria-hidden="true">
        <i id="dock-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="dock-body" id="dock-body">
        <ul className="dock-list" id="dock-list">
          {active.slice(0, 8).map((t) => (
            <li key={t.id} onClick={onOpenDownload}>
              <span className="dock-item-title" title={labelOf(t)}>
                {labelOf(t)}
              </span>
              <span className="dock-item-status">
                {t.status}
                {t.total > 0 ? ` ${t.done}/${t.total}` : ''}
                {t.percent != null ? ` ${Math.round(t.percent)}%` : ''}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn" onClick={onOpenDownload}>
          打开下载页
        </button>
      </div>
    </aside>
  )
}
