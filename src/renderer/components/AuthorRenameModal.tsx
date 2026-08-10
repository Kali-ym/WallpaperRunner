import { useState, type JSX } from 'react'

type Props = {
  author: string
  galleryCount: number
  busy?: boolean
  onSave: (newName: string) => void
  onClose: () => void
}

export default function AuthorRenameModal({
  author,
  galleryCount,
  busy,
  onSave,
  onClose,
}: Props): JSX.Element {
  const [name, setName] = useState(author)

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-label="编辑作者名">
      <button type="button" className="drawer-backdrop" onClick={onClose} />
      <div className="modal-panel">
        <h3 className="drawer-title">编辑作者名</h3>
        <p className="author-rename-hint muted">
          将同步更新该作者全部 {galleryCount} 部套图的作者字段。
        </p>
        <label className="field">
          <span>作者名</span>
          <input
            className="text-input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onSave(name.trim())
            }}
          />
        </label>
        <div className="page-toolbar" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !name.trim() || name.trim() === author}
            onClick={() => onSave(name.trim())}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
