import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type JSX,
  type MouseEvent,
} from 'react'
import GalleryCard from '../components/GalleryCard'
import GalleryListRow from '../components/GalleryListRow'
import ContextMenu from '../components/ContextMenu'
import EditMetadataModal from '../components/EditMetadataModal'
import JoinPlaylistModal from '../components/JoinPlaylistModal'
import BatchTagModal from '../components/BatchTagModal'
import { useToast } from '../lib/toast'
import {
  api,
  type GalleryMetadata,
  type LibraryFilters,
  type LibraryIndexEntry,
  type TagStat,
} from '../lib/api'

interface Props {
  onOpenGallery: (entry: LibraryIndexEntry) => void
}

type LibraryView = 'grid-comfy' | 'grid-compact' | 'grid-large' | 'list'

const VIEW_KEY = 'wallpaper-runner:libraryView'
const SOURCE_OPTIONS = ['xchina', 'telegram', 'telegraph', 'local'] as const

function keyOf(e: LibraryIndexEntry): string {
  return `${e.source}:${e.galleryId}`
}

function readView(): LibraryView {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    if (v === 'grid-comfy' || v === 'grid-compact' || v === 'grid-large' || v === 'list') return v
  } catch {
    /* ignore */
  }
  return 'grid-comfy'
}

function hasActiveFilters(f: LibraryFilters, query: string): boolean {
  if (query.trim()) return true
  if (f.favoriteOnly) return true
  if (f.tags && f.tags.length > 0) return true
  if (f.sources && f.sources.length > 0) return true
  if (f.downloadedFrom || f.downloadedTo) return true
  if (f.minImages != null || f.maxImages != null) return true
  return false
}

export default function LibraryPage({ onOpenGallery }: Props): JSX.Element {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<LibraryFilters>({})
  const [tagStats, setTagStats] = useState<TagStat[]>([])
  const [tagsOpen, setTagsOpen] = useState(true)
  const [view, setView] = useState<LibraryView>(() => readView())
  const [items, setItems] = useState<LibraryIndexEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tagModal, setTagModal] = useState(false)
  const [tagBusy, setTagBusy] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; entry: LibraryIndexEntry | null } | null>(
    null,
  )
  const [editEntry, setEditEntry] = useState<LibraryIndexEntry | null>(null)
  const [editDetail, setEditDetail] = useState<GalleryMetadata | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [joinRefs, setJoinRefs] = useState<LibraryIndexEntry[] | null>(null)
  const [joinLists, setJoinLists] = useState<
    Array<{ id: string; name: string; galleryRefs: Array<{ source: string; galleryId: string }> }>
  >([])
  const [folderDragOver, setFolderDragOver] = useState(false)

  const reload = useCallback(
    (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true)
      void Promise.all([api.listLibrary(query, filters), api.tagStats()])
        .then(([list, stats]) => {
          setItems(list)
          setTagStats(stats)
          setLoading(false)
        })
        .catch((err: unknown) => {
          setLoading(false)
          toast.error(err instanceof Error ? err.message : String(err))
        })
    },
    [query, filters, toast],
  )

  useEffect(() => {
    const timer = setTimeout(() => reload(), 150)
    return () => clearTimeout(timer)
  }, [reload])

  useEffect(() => {
    return api.onLibraryChange(() => reload({ silent: true }))
  }, [reload])

  useEffect(() => {
    setSelected((prev) => {
      const keys = new Set(items.map(keyOf))
      const next = new Set([...prev].filter((k) => keys.has(k)))
      return next.size === prev.size ? prev : next
    })
  }, [items])

  function setViewPersist(v: LibraryView): void {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignore */
    }
  }

  function patchFavorite(entry: LibraryIndexEntry, favorite: boolean): void {
    setItems((prev) => {
      const next = prev.map((e) =>
        e.source === entry.source && e.galleryId === entry.galleryId ? { ...e, favorite } : e,
      )
      if (filters.favoriteOnly && !favorite) {
        return next.filter(
          (e) => !(e.source === entry.source && e.galleryId === entry.galleryId),
        )
      }
      return next
    })
    void api.setFavorite(entry.source, entry.galleryId, favorite).catch(() => {
      reload({ silent: true })
      toast.error('收藏更新失败')
    })
  }

  function toggleSelect(entry: LibraryIndexEntry): void {
    const k = keyOf(entry)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function toggleTag(tag: string): void {
    setFilters((prev) => {
      const cur = prev.tags ?? []
      const has = cur.some((t) => t.toLowerCase() === tag.toLowerCase())
      const tags = has
        ? cur.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...cur, tag]
      return { ...prev, tags: tags.length ? tags : undefined }
    })
  }

  function toggleSource(source: string): void {
    setFilters((prev) => {
      const cur = prev.sources ?? []
      const has = cur.includes(source)
      const sources = has ? cur.filter((s) => s !== source) : [...cur, source]
      return { ...prev, sources: sources.length ? sources : undefined }
    })
  }

  function clearFilters(): void {
    setQuery('')
    setFilters({})
  }

  const selectedRefs = items
    .filter((e) => selected.has(keyOf(e)))
    .map((e) => ({ source: e.source, galleryId: e.galleryId }))

  const filtering = hasActiveFilters(filters, query)

  const density = useMemo(() => {
    if (view === 'grid-compact') return 'compact'
    if (view === 'grid-large') return 'large'
    return 'comfy'
  }, [view])

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
    if ((e.target as HTMLElement).closest('.gallery-card, .gallery-list-row')) return
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, entry: null })
  }

  async function openJoin(entries: LibraryIndexEntry[]): Promise<void> {
    if (entries.length === 0) return
    const pls = await api.listPlaylists()
    setJoinLists(pls)
    setJoinRefs(entries)
  }

  async function handleFolderDrop(e: DragEvent): Promise<void> {
    e.preventDefault()
    setFolderDragOver(false)
    const files = Array.from(e.dataTransfer.files ?? [])
    const paths = files
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => Boolean(p))
    if (paths.length === 0) {
      toast.info('请拖入本地文件夹（需 Electron 路径）')
      return
    }
    try {
      const result = await api.importLocalFolders(paths)
      if (result.imported > 0) {
        toast.success(`已导入 ${result.imported} 套本地图集`)
        reload()
      } else {
        toast.info('未找到可导入的图片文件夹')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
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
    if (id === 'favorite') patchFavorite(entry, !entry.favorite)
    if (id === 'addPlaylist') await openJoin([entry])
    if (id === 'folder') await api.openGalleryFolder(entry.source, entry.galleryId)
    if (id === 'redownload') {
      const detail = await api.getGallery(entry.source, entry.galleryId)
      if (detail?.sourceUrl) {
        await api.redownloadGallery(detail.sourceUrl)
        toast.success('已加入重新下载')
      } else toast.error('缺少来源 URL，无法重新下载')
    }
    if (id === 'delete') {
      if (!window.confirm(`确定删除「${entry.displayTitle || entry.title}」？`)) return
      await api.deleteGallery(entry.source, entry.galleryId)
      reload()
      toast.success('已删除')
    }
  }

  return (
    <section
      className={`page library-page${folderDragOver ? ' drop-active' : ''}`}
      onContextMenu={openBlankMenu}
      onDragEnter={(e) => {
        e.preventDefault()
        setFolderDragOver(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setFolderDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setFolderDragOver(false)
      }}
      onDrop={(e) => void handleFolderDrop(e)}
    >
      {folderDragOver ? <p className="drop-hint">松开以导入本地文件夹</p> : null}
      <div className="page-toolbar wrap">
        <input
          className="search-input"
          data-focus="library-search"
          placeholder="搜索标题 / 标签 / 模特"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filter-chips" role="group" aria-label="来源">
          {SOURCE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip ${(filters.sources ?? []).includes(s) ? 'active' : ''}`}
              onClick={() => toggleSource(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={Boolean(filters.favoriteOnly)}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                favoriteOnly: e.target.checked ? true : undefined,
              }))
            }
          />
          仅收藏
        </label>
        <label className="field-inline">
          <span className="muted">从</span>
          <input
            type="date"
            className="text-input narrow-date"
            value={filters.downloadedFrom ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                downloadedFrom: e.target.value || undefined,
              }))
            }
          />
        </label>
        <label className="field-inline">
          <span className="muted">到</span>
          <input
            type="date"
            className="text-input narrow-date"
            value={filters.downloadedTo ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                downloadedTo: e.target.value || undefined,
              }))
            }
          />
        </label>
        <label className="field-inline">
          <span className="muted">张数</span>
          <input
            type="number"
            className="text-input narrow"
            min={0}
            placeholder="min"
            value={filters.minImages ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                minImages: e.target.value === '' ? undefined : Number(e.target.value),
              }))
            }
          />
          <span className="muted">–</span>
          <input
            type="number"
            className="text-input narrow"
            min={0}
            placeholder="max"
            value={filters.maxImages ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                maxImages: e.target.value === '' ? undefined : Number(e.target.value),
              }))
            }
          />
        </label>
        <button type="button" className="btn" onClick={clearFilters}>
          清除筛选
        </button>
        <button type="button" className="btn" onClick={() => setSelectMode((v) => !v)}>
          {selectMode ? '取消多选' : '多选'}
        </button>
        <div className="view-switch" role="group" aria-label="视图">
          {(
            [
              ['grid-compact', '紧凑'],
              ['grid-comfy', '舒适'],
              ['grid-large', '大图'],
              ['list', '列表'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip ${view === id ? 'active' : ''}`}
              onClick={() => setViewPersist(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="muted">
          {loading ? '加载中…' : `${items.length} 部套图${filtering ? '（已筛选）' : ''}`}
        </span>
      </div>

      {selectMode ? (
        <div className="page-toolbar batch-bar">
          <span>
            已选 {selectedRefs.length} / 当前 {items.length}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => setSelected(new Set(items.map(keyOf)))}
          >
            全选
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setSelected((prev) => {
                const next = new Set(prev)
                for (const e of items) {
                  const k = keyOf(e)
                  if (next.has(k)) next.delete(k)
                  else next.add(k)
                }
                return next
              })
            }
          >
            反选
          </button>
          <button
            type="button"
            className="btn"
            disabled={selectedRefs.length === 0}
            onClick={() => void batchFavorite(true)}
          >
            批量收藏
          </button>
          <button
            type="button"
            className="btn"
            disabled={selectedRefs.length === 0}
            onClick={() => void batchFavorite(false)}
          >
            取消收藏
          </button>
          <button
            type="button"
            className="btn"
            disabled={selectedRefs.length === 0}
            onClick={() => {
              const entries = items.filter((e) => selected.has(keyOf(e)))
              void openJoin(entries)
            }}
          >
            加入播放列表
          </button>
          <button
            type="button"
            className="btn"
            disabled={selectedRefs.length === 0}
            onClick={() => setTagModal(true)}
          >
            批量打标签
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={selectedRefs.length === 0}
            onClick={() => void batchDelete()}
          >
            批量删除
          </button>
        </div>
      ) : null}

      <div className={`library-layout ${tagsOpen ? 'with-tags' : ''}`}>
        <aside className={`tag-sidebar ${tagsOpen ? '' : 'collapsed'}`}>
          <div className="tag-sidebar-head">
            <strong>标签</strong>
            <button type="button" className="btn" onClick={() => setTagsOpen((v) => !v)}>
              {tagsOpen ? '收起' : '展开'}
            </button>
          </div>
          {tagsOpen ? (
            <>
              {(filters.tags ?? []).length > 0 ? (
                <div className="filter-chips">
                  {(filters.tags ?? []).map((t) => (
                    <button key={t} type="button" className="chip active" onClick={() => toggleTag(t)}>
                      {t} ×
                    </button>
                  ))}
                </div>
              ) : null}
              <ul className="tag-stat-list">
                {tagStats.map((s) => {
                  const on = (filters.tags ?? []).some(
                    (t) => t.toLowerCase() === s.tag.toLowerCase(),
                  )
                  return (
                    <li key={s.tag}>
                      <button
                        type="button"
                        className={`tag-stat-btn ${on ? 'active' : ''}`}
                        onClick={() => toggleTag(s.tag)}
                      >
                        <span>{s.tag}</span>
                        <span className="muted">{s.count}</span>
                      </button>
                    </li>
                  )
                })}
                {tagStats.length === 0 ? <li className="muted">暂无标签</li> : null}
              </ul>
            </>
          ) : null}
        </aside>

        <div className="library-main">
          {items.length === 0 && !loading ? (
            <div className="empty-state">
              {filtering ? (
                <>
                  <p className="empty-hint">没有符合条件的套图</p>
                  <button type="button" className="btn primary" onClick={clearFilters}>
                    清除筛选
                  </button>
                </>
              ) : (
                <>
                  <p className="empty-hint">还没有套图</p>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() =>
                      window.dispatchEvent(new CustomEvent('wallpaper-runner:go-download'))
                    }
                  >
                    去下载
                  </button>
                </>
              )}
            </div>
          ) : loading && items.length === 0 ? (
            <div className="skeleton-grid" aria-hidden>
              {Array.from({ length: 8 }).map((_, i) => (
                <div className="skeleton-card" key={i}>
                  <div className="skeleton-cover" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line short" />
                </div>
              ))}
            </div>
          ) : view === 'list' ? (
            <div className="gallery-list">
              {items.map((entry) => (
                <div key={keyOf(entry)} onContextMenu={(e) => openCardMenu(e, entry)}>
                  <GalleryListRow
                    entry={entry}
                    selectMode={selectMode}
                    selected={selected.has(keyOf(entry))}
                    onOpen={onOpenGallery}
                    onToggleSelect={toggleSelect}
                    onToggleFavorite={(e) => patchFavorite(e, !e.favorite)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="gallery-grid" data-density={density}>
              {items.map((entry) => (
                <div key={keyOf(entry)} onContextMenu={(e) => openCardMenu(e, entry)}>
                  <GalleryCard
                    entry={entry}
                    selectMode={selectMode}
                    selected={selected.has(keyOf(entry))}
                    onOpen={onOpenGallery}
                    onToggleSelect={toggleSelect}
                    onToggleFavorite={(e) => patchFavorite(e, !e.favorite)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            menu.entry
              ? [
                  { id: 'open', label: '打开' },
                  { id: 'edit', label: '编辑信息' },
                  { id: 'favorite', label: menu.entry.favorite ? '取消收藏' : '收藏' },
                  { id: 'addPlaylist', label: '加入播放列表…' },
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
              .catch((err: unknown) => toast.error(err instanceof Error ? err.message : String(err)))
              .finally(() => setEditBusy(false))
          }}
        />
      ) : null}

      {joinRefs ? (
        <JoinPlaylistModal
          initialPlaylists={joinLists}
          refs={joinRefs.map((e) => ({ source: e.source, galleryId: e.galleryId }))}
          titles={joinRefs.map((e) => e.displayTitle?.trim() || e.title)}
          onClose={() => setJoinRefs(null)}
          onSaved={(message) => {
            toast.success(message)
            setJoinRefs(null)
            if (selectMode) setSelected(new Set())
          }}
          onError={(message) => toast.error(message)}
        />
      ) : null}

      <BatchTagModal
        open={tagModal}
        busy={tagBusy}
        onClose={() => setTagModal(false)}
        onSubmit={(tags) => {
          setTagBusy(true)
          void api
            .addTags(selectedRefs, tags)
            .then((n) => {
              toast.success(`已为 ${n} 部套图追加标签`)
              setTagModal(false)
              reload()
            })
            .catch((err: unknown) => toast.error(err instanceof Error ? err.message : String(err)))
            .finally(() => setTagBusy(false))
        }}
      />
    </section>
  )
}
