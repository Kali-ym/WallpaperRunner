import { useState, type JSX } from 'react'
import type { GalleryMetadata, LibraryIndexEntry } from '../lib/api'

export type EditMetadataModalProps = {
  entry: LibraryIndexEntry
  detail?: GalleryMetadata | null
  busy?: boolean
  onSave: (partial: { displayTitle: string; author: string; tags: string[] }) => void
  onClose: () => void
}

export default function EditMetadataModal({
  entry,
  detail,
  busy,
  onSave,
  onClose,
}: EditMetadataModalProps): JSX.Element {
  const [displayTitle, setDisplayTitle] = useState(entry.displayTitle || entry.title)
  const [author, setAuthor] = useState(entry.author || '')
  const [tags, setTags] = useState((entry.tags || []).join(', '))

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-label="编辑信息">
      <button type="button" className="drawer-backdrop" onClick={onClose} />
      <div className="modal-panel">
        <h3 className="drawer-title">编辑信息</h3>
        <label className="field">
          <span>显示标题</span>
          <input
            className="text-input"
            value={displayTitle}
            onChange={(e) => setDisplayTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>作者</span>
          <input className="text-input" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="field">
          <span>标签（逗号分隔）</span>
          <input className="text-input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <div className="meta-readonly muted">
          <div>来源：{entry.source}</div>
          <div>ID：{entry.galleryId}</div>
          <div>URL：{detail?.sourceUrl || '—'}</div>
        </div>
        <div className="page-toolbar" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() =>
              onSave({
                displayTitle,
                author,
                tags: tags
                  .split(/[,，]/)
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
