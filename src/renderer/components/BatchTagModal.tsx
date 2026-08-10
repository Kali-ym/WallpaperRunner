import type { JSX } from 'react'

interface Props {
  open: boolean
  busy?: boolean
  onClose: () => void
  onSubmit: (tags: string[]) => void
}

export default function BatchTagModal({ open, busy, onClose, onSubmit }: Props): JSX.Element | null {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-labelledby="batch-tag-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="batch-tag-title">批量打标签</h2>
        <p className="muted">多个标签用逗号分隔；将追加到选中套图（去重）。</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const raw = String(fd.get('tags') ?? '')
            const tags = raw
              .split(/[,，]/)
              .map((t) => t.trim())
              .filter(Boolean)
            if (tags.length === 0) return
            onSubmit(tags)
          }}
        >
          <label className="field">
            <span>标签</span>
            <input className="text-input" name="tags" placeholder="jk, 国模" autoFocus disabled={busy} />
          </label>
          <div className="page-toolbar">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? '保存中…' : '追加标签'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
