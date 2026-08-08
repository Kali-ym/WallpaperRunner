import { useCallback, useEffect, useState, type JSX } from 'react'
import GalleryCard from '../components/GalleryCard'
import { api, type LibraryIndexEntry } from '../lib/api'

interface Props {
  onOpenGallery: (entry: LibraryIndexEntry) => void
}

function keyOf(e: LibraryIndexEntry): string {
  return `${e.source}:${e.galleryId}`
}

export default function LibraryPage({ onOpenGallery }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [items, setItems] = useState<LibraryIndexEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const reload = useCallback(() => {
    setLoading(true)
    void api.listLibrary(query, favoriteOnly).then((list) => {
      setItems(list)
      setLoading(false)
    })
  }, [query, favoriteOnly])

  useEffect(() => {
    const timer = setTimeout(reload, 150)
    return () => clearTimeout(timer)
  }, [reload])

  function toggleSelect(entry: LibraryIndexEntry): void {
    const k = keyOf(entry)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const selectedRefs = items
    .filter((e) => selected.has(keyOf(e)))
    .map((e) => ({ source: e.source, galleryId: e.galleryId }))

  async function batchDelete(): Promise<void> {
    if (selectedRefs.length === 0) return
    if (!window.confirm(`确定删除选中的 ${selectedRefs.length} 部套图？此操作不可恢复。`)) return
    await api.deleteGalleries(selectedRefs)
    setSelected(new Set())
    reload()
  }

  async function batchFavorite(favorite: boolean): Promise<void> {
    if (selectedRefs.length === 0) return
    await api.setFavorites(selectedRefs, favorite)
    setSelected(new Set())
    reload()
  }

  return (
    <section className="page">
      <div className="page-toolbar">
        <input
          className="search-input"
          placeholder="搜索标题 / 标签 / 模特"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="inline-check">
          <input
            type="checkbox"
            checked={favoriteOnly}
            onChange={(e) => setFavoriteOnly(e.target.checked)}
          />
          仅收藏
        </label>
        <button type="button" className="btn" onClick={() => setSelectMode((v) => !v)}>
          {selectMode ? '取消多选' : '多选'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void api.cleanupEmptyGalleries().then((n) => {
              window.alert(`已清理 ${n} 个空壳`)
              reload()
            })
          }
        >
          清理空壳
        </button>
        <span className="muted">{loading ? '加载中…' : `${items.length} 部套图`}</span>
      </div>

      {selectMode && selectedRefs.length > 0 ? (
        <div className="page-toolbar batch-bar">
          <span>已选 {selectedRefs.length}</span>
          <button type="button" className="btn" onClick={() => void batchFavorite(true)}>
            批量收藏
          </button>
          <button type="button" className="btn" onClick={() => void batchFavorite(false)}>
            取消收藏
          </button>
          <button type="button" className="btn danger" onClick={() => void batchDelete()}>
            批量删除
          </button>
        </div>
      ) : null}

      {items.length === 0 && !loading ? (
        <p className="empty-hint">还没有套图。去「下载」页粘贴 URL 开始吧。</p>
      ) : (
        <div className="gallery-grid">
          {items.map((entry) => (
            <GalleryCard
              key={keyOf(entry)}
              entry={entry}
              selectMode={selectMode}
              selected={selected.has(keyOf(entry))}
              onOpen={onOpenGallery}
              onToggleSelect={toggleSelect}
              onToggleFavorite={(e) =>
                void api.setFavorite(e.source, e.galleryId, !e.favorite).then(reload)
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}
