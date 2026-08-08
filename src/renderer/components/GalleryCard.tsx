import type { JSX } from 'react'
import type { LibraryIndexEntry } from '../lib/api'
import { api } from '../lib/api'

interface Props {
  entry: LibraryIndexEntry
  onOpen: (entry: LibraryIndexEntry) => void
}

export default function GalleryCard({ entry, onOpen }: Props): JSX.Element {
  const cover = entry.cover
    ? api.getMediaUrl(entry.dirName, entry.cover)
    : undefined

  return (
    <button type="button" className="gallery-card" onClick={() => onOpen(entry)}>
      <div className="gallery-card-cover">
        {cover ? <img src={cover} alt={entry.title} loading="lazy" /> : <div className="cover-empty">无封面</div>}
      </div>
      <div className="gallery-card-body">
        <h3>{entry.title}</h3>
        <p className="muted">
          {entry.author || '未知作者'} · {entry.imageCount} 张
        </p>
        <p className="tags">{entry.tags.slice(0, 4).join(' / ')}</p>
      </div>
    </button>
  )
}
