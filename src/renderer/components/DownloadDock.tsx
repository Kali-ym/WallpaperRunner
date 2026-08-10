import { useMemo, useState, type JSX } from 'react'
import type { QueueTask } from '../lib/api'

const ACTIVE = new Set(['queued', 'resolving', 'downloading'])

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
    <aside className={`download-dock ${expanded ? 'expanded' : ''}`} aria-live="polite">
      <button
        type="button"
        className="download-dock-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        <span>
          下载中 {active.length}
          {totalSum > 0 ? ` · ${pct}%` : ''}
          {speed ? ` · ${Math.round(speed / 1024)} KB/s` : ''}
          {eta != null && eta > 0 ? ` · ETA ${eta}s` : ''}
        </span>
        <span className="download-dock-chevron" aria-hidden>
          {expanded ? '▾' : '▴'}
        </span>
      </button>
      <div className="download-dock-bar" aria-hidden>
        <div className="download-dock-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {expanded ? (
        <div className="download-dock-body">
          <ul className="download-dock-list">
            {active.slice(0, 8).map((t) => (
              <li key={t.id}>
                <span className="download-dock-title" title={labelOf(t)}>
                  {labelOf(t)}
                </span>
                <span className="muted">
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
      ) : null}
    </aside>
  )
}
