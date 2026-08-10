import { memo, type JSX } from 'react'
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

function GalleryListRow({
  entry,
  selected,
  selectMode,
  onOpen,
  onToggleSelect,
  onToggleFavorite,
}: Props): JSX.Element {
  const cover = entry.cover
    ? api.getMediaUrl(entry.dirName, entry.cover, {
        thumb: true,
        bust: entry.downloadedAt,
      })
    : undefined
  const date = entry.downloadedAt.slice(0, 10)

  return (
    <div className={`gallery-list-row ${selected ? 'selected' : ''}`}>
      {selectMode ? (
        <label className="card-check">
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelect?.(entry)}
          />
        </label>
      ) : null}
      <button type="button" className="gallery-list-main" onClick={() => onOpen(entry)}>
        <div className="gallery-list-thumb">
          {cover ? (
            <img src={cover} alt="" loading="lazy" decoding="async" />
          ) : (
            <div className="cover-empty">无</div>
          )}
        </div>
        <div className="gallery-list-body">
          <h3>{labelOf(entry)}</h3>
          <p className="muted">
            {entry.author || '未知作者'} · {entry.source} · {entry.imageCount} 张 · {date}
          </p>
        </div>
      </button>
      <button
        type="button"
        className="fav-btn list-fav"
        title={entry.favorite ? '取消收藏' : '收藏'}
        onClick={() => onToggleFavorite?.(entry)}
      >
        {entry.favorite ? '★' : '☆'}
      </button>
    </div>
  )
}

export default memo(GalleryListRow)
