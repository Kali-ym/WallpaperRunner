import { memo, useState, type JSX } from 'react'
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

function GalleryCard({
  entry,
  selected,
  selectMode,
  onOpen,
  onToggleSelect,
  onToggleFavorite,
}: Props): JSX.Element {
  const [hover, setHover] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)

  const cover = entry.cover
    ? api.getMediaUrl(entry.dirName, entry.cover, {
        thumb: true,
        bust: entry.downloadedAt,
      })
    : undefined

  const preview = entry.cover
    ? api.getMediaUrl(entry.dirName, entry.cover, {
        bust: entry.downloadedAt,
      })
    : undefined

  return (
    <div
      className={`gallery-card ${selected ? 'selected' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setPreviewReady(false)
      }}
    >
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
            <img src={cover} alt={labelOf(entry)} loading="lazy" decoding="async" />
          ) : (
            <div className="cover-empty">无封面</div>
          )}
          {hover && preview ? (
            <img
              className={`gallery-card-preview${previewReady ? ' is-ready' : ''}`}
              src={preview}
              alt=""
              decoding="async"
              onLoad={() => setPreviewReady(true)}
            />
          ) : null}
        </div>
        <div className="gallery-card-body">
          <h3>{labelOf(entry)}</h3>
          <p className="muted">
            {entry.author || '未知作者'} · {entry.imageCount} 张
          </p>
          {entry.tags.length > 0 ? (
            <p className="tags muted">{entry.tags.slice(0, 3).join(' · ')}</p>
          ) : null}
        </div>
      </button>
    </div>
  )
}

export default memo(GalleryCard)
