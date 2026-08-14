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

function GalleryCard({
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

  function onCardActivate(): void {
    if (selectMode) onToggleSelect?.(entry)
    else onOpen(entry)
  }

  return (
    <article
      className={`card${selected ? ' selected' : ''}${selectMode ? ' select-mode' : ''}`}
    >
      {selectMode ? (
        <span className={`card-check${selected ? ' is-checked' : ''}`} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none">
            {selected ? (
              <path
                d="M7.5 12.2l3 3 6.2-6.2"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </svg>
        </span>
      ) : null}
      <button type="button" className="card-hit" onClick={onCardActivate}>
        <div className="cover">
          {cover ? (
            <img className="art" src={cover} alt="" loading="lazy" decoding="async" />
          ) : (
            <div className="art cover-empty">无封面</div>
          )}
          {!selectMode ? (
            <span className="cover-author" title={entry.author || '未知作者'}>
              {entry.author || '未知作者'}
            </span>
          ) : null}
          <span className="count-badge">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="4"
                y="6"
                width="16"
                height="12"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
            {entry.imageCount}
          </span>
          {!selectMode ? (
            <div className="overlay" aria-hidden>
              <span className="open-label">打开</span>
            </div>
          ) : null}
        </div>
      </button>
      <div className="card-meta">
        <button
          type="button"
          className={`card-fav${entry.favorite ? ' is-fav' : ''}`}
          title={entry.favorite ? '取消收藏' : '收藏'}
          aria-label={entry.favorite ? '取消收藏' : '收藏'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite?.(entry)
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
              fill={entry.favorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button type="button" className="title card-title-btn" onClick={onCardActivate}>
          {labelOf(entry)}
        </button>
      </div>
    </article>
  )
}

export default memo(GalleryCard)
