import type { JSX } from 'react'
import type { LibraryIndexEntry } from '../lib/api'
import { api } from '../lib/api'

interface Props {
  entry: LibraryIndexEntry
  selected?: boolean
  selectMode?: boolean
  onOpen: (entry: LibraryIndexEntry) => void
  onToggleSelect?: (entry: LibraryIndexEntry) => void
  onToggleFavorite?: (entry: LibraryIndexEntry) => void
}

function labelOf(entry: LibraryIndexEntry): string {
  return entry.displayTitle?.trim() || entry.title
}

export default function GalleryCard({
  entry,
  selected,
  selectMode,
  onOpen,
  onToggleSelect,
  onToggleFavorite,
}: Props): JSX.Element {
  const cover = entry.cover
    ? api.getMediaUrl(entry.dirName, entry.cover)
    : undefined

  return (
    <div className={`gallery-card ${selected ? 'selected' : ''}`}>
      {selectMode ? (
        <label className="card-check">
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelect?.(entry)}
          />
        </label>
      ) : null}
      <button
        type="button"
        className="fav-btn"
        title={entry.favorite ? '取消收藏' : '收藏'}
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavorite?.(entry)
        }}
      >
        {entry.favorite ? '★' : '☆'}
      </button>
      <button type="button" className="gallery-card-main" onClick={() => onOpen(entry)}>
        <div className="gallery-card-cover">
          {cover ? (
            <img src={cover} alt={labelOf(entry)} loading="lazy" />
          ) : (
            <div className="cover-empty">无封面</div>
          )}
        </div>
        <div className="gallery-card-body">
          <h3>{labelOf(entry)}</h3>
          <p className="muted">
            {entry.author || '未知作者'} · {entry.imageCount} 张
          </p>
          <p className="tags">{entry.tags.slice(0, 4).join(' / ')}</p>
        </div>
      </button>
    </div>
  )
}
