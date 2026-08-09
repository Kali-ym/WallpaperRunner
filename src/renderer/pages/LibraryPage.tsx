import { useCallback, useEffect, useState, type JSX, type MouseEvent } from 'react'
import GalleryCard from '../components/GalleryCard'
import ContextMenu from '../components/ContextMenu'
import EditMetadataModal from '../components/EditMetadataModal'
import { useToast } from '../lib/toast'
import { api, type GalleryMetadata, type LibraryIndexEntry } from '../lib/api'

interface Props {
  onOpenGallery: (entry: LibraryIndexEntry) => void
}

function keyOf(e: LibraryIndexEntry): string {
  return `${e.source}:${e.galleryId}`
}

export default function LibraryPage({ onOpenGallery }: Props): JSX.Element {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [items, setItems] = useState<LibraryIndexEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; entry: LibraryIndexEntry | null } | null>(
    null,
  )
  const [editEntry, setEditEntry] = useState<LibraryIndexEntry | null>(null)
  const [editDetail, setEditDetail] = useState<GalleryMetadata | null>(null)
  const [editBusy, setEditBusy] = useState(false)

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
    toast.success('已删除选中套图')
  }

  async function batchFavorite(favorite: boolean): Promise<void> {
    if (selectedRefs.length === 0) return
    await api.setFavorites(selectedRefs, favorite)
    setSelected(new Set())
    reload()
  }

  function openCardMenu(e: MouseEvent, entry: LibraryIndexEntry): void {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, entry })
  }

  function openBlankMenu(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('.gallery-card')) return
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, entry: null })
  }

  async function onMenuSelect(id: string): Promise<void> {
    const entry = menu?.entry
    if (id === 'cleanup') {
      const n = await api.cleanupEmptyGalleries()
      toast.success(`已清理 ${n} 个空壳`)
      reload()
      return
    }
    if (!entry) return
    if (id === 'open') onOpenGallery(entry)
    if (id === 'edit') {
      setEditEntry(entry)
      const detail = await api.getGallery(entry.source, entry.galleryId)
      setEditDetail(detail)
    }
    if (id === 'favorite') {
      await api.setFavorite(entry.source, entry.galleryId, !entry.favorite)
      reload()
    }
    if (id === 'folder') {
      await api.openGalleryFolder(entry.source, entry.galleryId)
    }
    if (id === 'redownload') {
      const detail = await api.getGallery(entry.source, entry.galleryId)
      if (detail?.sourceUrl) {
        await api.redownloadGallery(detail.sourceUrl)
        toast.success('已加入重新下载')
      } else {
        toast.error('缺少来源 URL，无法重新下载')
      }
    }
    if (id === 'delete') {
      if (!window.confirm(`确定删除「${entry.displayTitle || entry.title}」？`)) return
      await api.deleteGallery(entry.source, entry.galleryId)
      reload()
      toast.success('已删除')
    }
  }

  return (
    <section className="page" onContextMenu={openBlankMenu}>
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
        <p className="empty-hint">还没有套图。去「下载」页粘贴链接开始。</p>
      ) : (
        <div className="gallery-grid">
          {items.map((entry) => (
            <div key={keyOf(entry)} onContextMenu={(e) => openCardMenu(e, entry)}>
              <GalleryCard
                entry={entry}
                selectMode={selectMode}
                selected={selected.has(keyOf(entry))}
                onOpen={onOpenGallery}
                onToggleSelect={toggleSelect}
                onToggleFavorite={(e) =>
                  void api.setFavorite(e.source, e.galleryId, !e.favorite).then(reload)
                }
              />
            </div>
          ))}
        </div>
      )}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            menu.entry
              ? [
                  { id: 'open', label: '打开' },
                  { id: 'edit', label: '编辑信息' },
                  {
                    id: 'favorite',
                    label: menu.entry.favorite ? '取消收藏' : '收藏',
                  },
                  { id: 'folder', label: '打开文件夹' },
                  { id: 'redownload', label: '重新下载' },
                  { id: 'delete', label: '删除', danger: true },
                ]
              : [{ id: 'cleanup', label: '清理空壳' }]
          }
          onClose={() => setMenu(null)}
          onSelect={(id) => void onMenuSelect(id)}
        />
      ) : null}

      {editEntry ? (
        <EditMetadataModal
          entry={editEntry}
          detail={editDetail}
          busy={editBusy}
          onClose={() => {
            setEditEntry(null)
            setEditDetail(null)
          }}
          onSave={(partial) => {
            setEditBusy(true)
            void api
              .updateGalleryMeta(editEntry.source, editEntry.galleryId, partial)
              .then(() => {
                toast.success('已保存')
                setEditEntry(null)
                setEditDetail(null)
                reload()
              })
              .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
              .finally(() => setEditBusy(false))
          }}
        />
      ) : null}
    </section>
  )
}
