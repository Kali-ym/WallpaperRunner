import { useEffect, useState, type JSX } from 'react'
import GalleryCard from '../components/GalleryCard'
import { api, type LibraryIndexEntry } from '../lib/api'

interface Props {
  onOpenGallery: (entry: LibraryIndexEntry) => void
}

export default function LibraryPage({ onOpenGallery }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<LibraryIndexEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      void api.listLibrary(query).then((list) => {
        if (!cancelled) {
          setItems(list)
          setLoading(false)
        }
      })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  return (
    <section className="page">
      <div className="page-toolbar">
        <input
          className="search-input"
          placeholder="搜索标题 / 标签 / 模特"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted">{loading ? '加载中…' : `${items.length} 部套图`}</span>
      </div>
      {items.length === 0 && !loading ? (
        <p className="empty-hint">还没有套图。去「下载」页粘贴 URL 开始吧。</p>
      ) : (
        <div className="gallery-grid">
          {items.map((entry) => (
            <GalleryCard
              key={`${entry.source}:${entry.galleryId}`}
              entry={entry}
              onOpen={onOpenGallery}
            />
          ))}
        </div>
      )}
    </section>
  )
}
