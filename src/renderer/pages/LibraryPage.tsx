import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type JSX,
  type MouseEvent,
} from 'react'
import GalleryCard from '../components/GalleryCard'
import AuthorCard from '../components/AuthorCard'
import AuthorAvatarModal from '../components/AuthorAvatarModal'
import AuthorRenameModal from '../components/AuthorRenameModal'
import VirtualGalleryGrid from '../components/VirtualGalleryGrid'
import ContextMenu from '../components/ContextMenu'
import EditMetadataModal from '../components/EditMetadataModal'
import BatchTagModal from '../components/BatchTagModal'
import PlaylistManageModal from '../components/PlaylistManageModal'
import type { BrowseSelection } from '../components/CollectionRail'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { buildAuthorCoverMap, defaultAuthorCoverEntry } from '../lib/authorCover'
import {
  api,
  type AuthorAvatarRecord,
  type GalleryMetadata,
  type AuthorStat,
  type LibraryFilters,
  type LibraryIndexEntry,
} from '../lib/api'

type LibraryView = 'grid-compact' | 'grid-comfy' | 'grid-large'

const VIEW_MODES: { id: LibraryView; label: string; icon: JSX.Element }[] = [
  {
    id: 'grid-compact',
    label: '紧凑',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    id: 'grid-comfy',
    label: '舒适',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="5" width="16" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="4" y="13" width="16" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    id: 'grid-large',
    label: '大图',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
]

interface Props {
  onOpenGallery: (entry: LibraryIndexEntry) => void
  browseSelection?: BrowseSelection
  onBrowseSelectionChange?: (next: BrowseSelection) => void
  query?: string
  onQueryChange?: (q: string) => void
  hideSearch?: boolean
}

type BatchAction = {
  id: string
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

function authorInitial(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  return t.slice(0, 1).toUpperCase()
}

function isFileFolderDrag(e: DragEvent): boolean {
  const types = e.dataTransfer?.types
  if (!types) return false
  return Array.from(types).includes('Files')
}

function pageInfo(selection: BrowseSelection, count: number, loading: boolean): {
  title: string
  meta: string
  scope: string
} {
  const countLabel = loading ? '加载中…' : `${count} 部套图`
  switch (selection.kind) {
    case 'favorite':
      return { title: '收藏', meta: countLabel, scope: 'favorite' }
    case 'authors':
      return {
        title: '作者',
        meta: loading ? '加载中…' : `${count} 位作者`,
        scope: 'authors',
      }
    case 'author':
      return {
        title: selection.author,
        meta: countLabel,
        scope: 'author',
      }
    case 'playlist':
      return {
        title: selection.name,
        meta: countLabel,
        scope: 'playlist',
      }
    default:
      return { title: '全部套图', meta: countLabel, scope: 'all' }
  }
}

const VIEW_KEY = 'wallpaper-runner:libraryView'

function keyOf(e: LibraryIndexEntry): string {
  return `${e.source}:${e.galleryId}`
}

function readView(): LibraryView {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    if (v === 'grid-comfy' || v === 'grid-compact' || v === 'grid-large') return v
    if (v === 'list') return 'grid-comfy'
  } catch {
    /* ignore */
  }
  return 'grid-comfy'
}

export default function LibraryPage({
  onOpenGallery,
  browseSelection = { kind: 'all' },
  onBrowseSelectionChange,
  query: queryProp,
  onQueryChange,
  hideSearch,
}: Props): JSX.Element {
  const toast = useToast()
  const confirm = useConfirm()
  const [queryLocal, setQueryLocal] = useState('')
  const query = queryProp ?? queryLocal
  const setQuery = onQueryChange ?? setQueryLocal
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
  const [folderDragOver, setFolderDragOver] = useState(false)
  const folderDragDepth = useRef(0)
  const [playlistManageOpen, setPlaylistManageOpen] = useState(false)
  const [authorStats, setAuthorStats] = useState<AuthorStat[]>([])
  const [authorCoverLib, setAuthorCoverLib] = useState<LibraryIndexEntry[]>([])
  const [authorAvatars, setAuthorAvatars] = useState<AuthorAvatarRecord[]>([])
  const [authorAvatarRecord, setAuthorAvatarRecord] = useState<AuthorAvatarRecord | null>(null)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameBusy, setRenameBusy] = useState(false)
  const reloadSeq = useRef(0)

  useEffect(() => {
    const resetFolderDrag = (): void => {
      folderDragDepth.current = 0
      setFolderDragOver(false)
    }
    window.addEventListener('dragend', resetFolderDrag)
    window.addEventListener('blur', resetFolderDrag)
    return () => {
      window.removeEventListener('dragend', resetFolderDrag)
      window.removeEventListener('blur', resetFolderDrag)
    }
  }, [])

  const reload = useCallback(
    (opts?: { silent?: boolean; author?: string }) => {
      if (!opts?.silent) setLoading(true)
      const seq = ++reloadSeq.current

      if (browseSelection.kind === 'authors') {
        void Promise.all([api.authorStats(), api.listLibrary(''), api.listAuthorAvatars()])
          .then(([stats, lib, avatars]) => {
            if (seq !== reloadSeq.current) return
            setAuthorStats(stats)
            setAuthorCoverLib(lib)
            setAuthorAvatars(avatars)
            setItems([])
            setLoading(false)
          })
          .catch((err: unknown) => {
            if (seq !== reloadSeq.current) return
            setLoading(false)
            toast.error(err instanceof Error ? err.message : String(err))
          })
        return
      }

      const effective: LibraryFilters = {}
      if (browseSelection.kind === 'favorite') effective.favoriteOnly = true
      if (browseSelection.kind === 'author') {
        effective.authors = [opts?.author ?? browseSelection.author]
      }

      void Promise.all([
        api.listLibrary(query, effective),
        browseSelection.kind === 'playlist' ? api.listPlaylists() : Promise.resolve(null),
      ])
        .then(([list, pls]) => {
          if (seq !== reloadSeq.current) return
          let next = list
          if (browseSelection.kind === 'playlist' && pls) {
            const pl = pls.find((p) => p.id === browseSelection.id)
            const keys = new Set((pl?.galleryRefs ?? []).map((r) => `${r.source}:${r.galleryId}`))
            next = list.filter((e) => keys.has(keyOf(e)))
          }
          setItems(next)
          setLoading(false)
        })
        .catch((err: unknown) => {
          if (seq !== reloadSeq.current) return
          setLoading(false)
          toast.error(err instanceof Error ? err.message : String(err))
        })
    },
    [query, toast, browseSelection],
  )

  useEffect(() => {
    const timer = setTimeout(() => reload(), 150)
    return () => clearTimeout(timer)
  }, [reload])

  useEffect(() => {
    return api.onLibraryChange(() => reload({ silent: true }))
  }, [reload])

  useEffect(() => {
    function onManagePlaylist(e: Event): void {
      const id = (e as CustomEvent<{ id: string }>).detail?.id
      if (browseSelection.kind === 'playlist' && browseSelection.id === id) {
        setPlaylistManageOpen(true)
      }
    }
    window.addEventListener('wallpaper-runner:manage-playlist', onManagePlaylist)
    return () => window.removeEventListener('wallpaper-runner:manage-playlist', onManagePlaylist)
  }, [browseSelection])

  useEffect(() => {
    if (browseSelection.kind !== 'author') {
      setAuthorAvatarRecord(null)
      return
    }
    let cancelled = false
    void api.getAuthorAvatar(browseSelection.author).then((record) => {
      if (!cancelled) setAuthorAvatarRecord(record)
    })
    return () => {
      cancelled = true
    }
  }, [browseSelection])

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
    setItems((prev) =>
      prev
        .map((e) =>
          e.source === entry.source && e.galleryId === entry.galleryId ? { ...e, favorite } : e,
        )
        .filter((e) =>
          browseSelection.kind === 'favorite' && !favorite
            ? !(e.source === entry.source && e.galleryId === entry.galleryId)
            : true,
        ),
    )
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

  const selectedRefs = items
    .filter((e) => selected.has(keyOf(e)))
    .map((e) => ({ source: e.source, galleryId: e.galleryId }))

  const narrowed = Boolean(query.trim()) || (browseSelection.kind !== 'all' && browseSelection.kind !== 'authors')

  const isAuthorsIndex = browseSelection.kind === 'authors'
  const isGalleryBrowse = !isAuthorsIndex

  const visibleAuthors = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return authorStats
    return authorStats.filter((a) => a.author.toLowerCase().includes(q))
  }, [authorStats, query])

  const authorCoverMap = useMemo(() => buildAuthorCoverMap(authorCoverLib), [authorCoverLib])

  const authorAvatarsByAuthor = useMemo(() => {
    const map = new Map<string, AuthorAvatarRecord>()
    for (const record of authorAvatars) map.set(record.author, record)
    return map
  }, [authorAvatars])

  const authorToolbarAvatarUrl = useMemo(() => {
    if (browseSelection.kind !== 'author') return undefined
    if (authorAvatarRecord) {
      return api.getAuthorAvatarUrl(authorAvatarRecord.relativePath, authorAvatarRecord.updatedAt)
    }
    const cover = defaultAuthorCoverEntry(items, browseSelection.author)
    if (cover?.cover) {
      return api.getMediaUrl(cover.dirName, cover.cover, { thumb: true, bust: cover.downloadedAt })
    }
    return undefined
  }, [browseSelection, authorAvatarRecord, items])

  const page = pageInfo(
    browseSelection,
    isAuthorsIndex ? visibleAuthors.length : items.length,
    loading,
  )

  const density = useMemo(() => {
    if (view === 'grid-compact') return 'compact'
    if (view === 'grid-large') return 'large'
    return 'comfy'
  }, [view])

  async function batchDelete(): Promise<void> {
    if (selectedRefs.length === 0) return
    const ok = await confirm({
      title: '删除套图',
      message: `确定删除选中的 ${selectedRefs.length} 部套图？此操作不可恢复。`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
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
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, entry })
  }

  function openBlankMenu(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('.card, .gallery-card, .gallery-list-row, .gallery-cell')) {
      return
    }
    const items = blankMenuItems()
    if (items.length === 0) return
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, entry: null })
  }

  async function handleFolderDrop(e: DragEvent): Promise<void> {
    e.preventDefault()
    folderDragDepth.current = 0
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

  async function batchRemoveFromPlaylist(): Promise<void> {
    if (browseSelection.kind !== 'playlist' || selectedRefs.length === 0) return
    const pls = await api.listPlaylists()
    const pl = pls.find((p) => p.id === browseSelection.id)
    if (!pl) return
    const removeKeys = new Set(selectedRefs.map((r) => `${r.source}:${r.galleryId}`))
    const nextRefs = pl.galleryRefs.filter((r) => !removeKeys.has(`${r.source}:${r.galleryId}`))
    await api.setPlaylistMembers(browseSelection.id, nextRefs)
    setSelected(new Set())
    reload()
    toast.success(`已从列表移除 ${selectedRefs.length} 部`)
  }

  async function deleteCurrentPlaylist(): Promise<void> {
    if (browseSelection.kind !== 'playlist') return
    const ok = await confirm({
      title: '删除播放列表',
      message: `确定删除播放列表「${browseSelection.name}」？`,
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    await api.deletePlaylist(browseSelection.id)
    onBrowseSelectionChange?.({ kind: 'all' })
    toast.success('已删除播放列表')
  }

  const batchActions = useMemo((): BatchAction[] => {
    const commonSelect: BatchAction[] = [
      {
        id: 'all',
        label: '全选',
        onClick: () => setSelected(new Set(items.map(keyOf))),
      },
      {
        id: 'invert',
        label: '反选',
        onClick: () =>
          setSelected((prev) => {
            const next = new Set(prev)
            for (const e of items) {
              const k = keyOf(e)
              if (next.has(k)) next.delete(k)
              else next.add(k)
            }
            return next
          }),
      },
    ]

    const withSelection = (actions: BatchAction[]): BatchAction[] =>
      actions.map((a) => ({
        ...a,
        disabled: a.id === 'all' || a.id === 'invert' ? false : selectedRefs.length === 0,
      }))

    if (browseSelection.kind === 'playlist') {
      return withSelection([
        ...commonSelect,
        {
          id: 'remove',
          label: '移出列表',
          onClick: () => void batchRemoveFromPlaylist(),
        },
        {
          id: 'fav',
          label: '收藏',
          onClick: () => void batchFavorite(true),
        },
        {
          id: 'tag',
          label: '打标签',
          onClick: () => setTagModal(true),
        },
        {
          id: 'delete',
          label: '删除套图',
          danger: true,
          onClick: () => void batchDelete(),
        },
      ])
    }

    if (browseSelection.kind === 'favorite') {
      return withSelection([
        ...commonSelect,
        {
          id: 'unfav',
          label: '取消收藏',
          onClick: () => void batchFavorite(false),
        },
        {
          id: 'tag',
          label: '打标签',
          onClick: () => setTagModal(true),
        },
        {
          id: 'delete',
          label: '删除',
          danger: true,
          onClick: () => void batchDelete(),
        },
      ])
    }

    if (browseSelection.kind === 'author') {
      return withSelection([
        ...commonSelect,
        {
          id: 'fav',
          label: '收藏',
          onClick: () => void batchFavorite(true),
        },
        {
          id: 'unfav',
          label: '取消收藏',
          onClick: () => void batchFavorite(false),
        },
        {
          id: 'tag',
          label: '打标签',
          onClick: () => setTagModal(true),
        },
        {
          id: 'delete',
          label: '删除',
          danger: true,
          onClick: () => void batchDelete(),
        },
      ])
    }

    return withSelection([
      ...commonSelect,
      {
        id: 'fav',
        label: '收藏',
        onClick: () => void batchFavorite(true),
      },
      {
        id: 'unfav',
        label: '取消收藏',
        onClick: () => void batchFavorite(false),
      },
      {
        id: 'tag',
        label: '打标签',
        onClick: () => setTagModal(true),
      },
      {
        id: 'delete',
        label: '删除',
        danger: true,
        onClick: () => void batchDelete(),
      },
    ])
  }, [browseSelection.kind, items, selected, selectedRefs.length])

  async function onMenuSelect(id: string): Promise<void> {
    const entry = menu?.entry
    if (id === 'managePlaylist' && browseSelection.kind === 'playlist') {
      setPlaylistManageOpen(true)
      return
    }
    if (id === 'deletePlaylist' && browseSelection.kind === 'playlist') {
      await deleteCurrentPlaylist()
      return
    }
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
    if (id === 'folder') await api.openGalleryFolder(entry.source, entry.galleryId)
    if (id === 'delete') {
      const ok = await confirm({
        title: '删除套图',
        message: `确定删除「${entry.displayTitle || entry.title}」？`,
        confirmLabel: '删除',
        danger: true,
      })
      if (!ok) return
      await api.deleteGallery(entry.source, entry.galleryId)
      reload()
      toast.success('已删除')
    }
  }

  function blankMenuItems() {
    if (browseSelection.kind === 'playlist') {
      return [
        { id: 'managePlaylist', label: '管理套图' },
        { id: 'deletePlaylist', label: '删除列表', danger: true },
      ]
    }
    if (browseSelection.kind === 'all') {
      return [{ id: 'cleanup', label: '清理空壳套图' }]
    }
    return []
  }

  function cardMenuItems(entry: LibraryIndexEntry) {
    const base = [
      { id: 'open', label: '打开' },
      { id: 'edit', label: '编辑信息' },
      { id: 'favorite', label: entry.favorite ? '取消收藏' : '收藏' },
      { id: 'folder', label: '打开文件夹' },
    ]
    if (browseSelection.kind === 'playlist') {
      return [...base, { id: 'delete', label: '删除套图', danger: true }]
    }
    return [...base, { id: 'delete', label: '删除', danger: true }]
  }

  return (
    <section
      className={`page library-page library-page--${page.scope}${folderDragOver ? ' drop-active' : ''}${selectMode ? ' is-selecting' : ''}`}
      onContextMenu={openBlankMenu}
      onDragEnter={(e) => {
        if (!isFileFolderDrag(e)) return
        e.preventDefault()
        folderDragDepth.current += 1
        setFolderDragOver(true)
      }}
      onDragOver={(e) => {
        if (!isFileFolderDrag(e)) return
        e.preventDefault()
        setFolderDragOver(true)
      }}
      onDragLeave={() => {
        folderDragDepth.current = Math.max(0, folderDragDepth.current - 1)
        if (folderDragDepth.current === 0) setFolderDragOver(false)
      }}
      onDrop={(e) => void handleFolderDrop(e)}
    >
      {folderDragOver ? (
        <div className="browse-drop show" aria-hidden="true">
          <div className="browse-drop-card">松开以导入本地文件夹</div>
        </div>
      ) : null}
      {!hideSearch ? (
        <div className="page-toolbar wrap browse-toolbar">
          <input
            className="search-input"
            data-focus="library-search"
            placeholder="搜索标题 / 作者 / 标签"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      ) : null}

      <div className="toolbar">
        <div className={`toolbar-head toolbar-head--${page.scope}`}>
          {browseSelection.kind === 'all' ? (
            <span className="browse-scope-ico" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 6.5h16M4 12h16M4 17.5h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          ) : null}
          {browseSelection.kind === 'favorite' ? (
            <span className="browse-scope-ico" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          ) : null}
          {browseSelection.kind === 'authors' ? (
            <span className="browse-scope-ico" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M6 19.5c.8-3.2 3.2-5 6-5s5.2 1.8 6 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          ) : null}
          {browseSelection.kind === 'author' ? (
            <>
              <button
                type="button"
                className="browse-back-btn"
                aria-label="返回作者列表"
                onClick={() => onBrowseSelectionChange?.({ kind: 'authors' })}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M14.5 6.5L9 12l5.5 5.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="browse-avatar browse-avatar-btn"
                aria-label="编辑作者头像"
                title="编辑头像"
                onClick={() => setAvatarModalOpen(true)}
              >
                {authorToolbarAvatarUrl ? (
                  <img className="browse-avatar-img" src={authorToolbarAvatarUrl} alt="" />
                ) : (
                  authorInitial(browseSelection.author)
                )}
              </button>
            </>
          ) : null}
          {browseSelection.kind === 'playlist' ? (
            <span className="browse-scope-ico" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M8 6h12M8 12h12M8 18h8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="5" cy="6" r="1.2" fill="currentColor" />
                <circle cx="5" cy="12" r="1.2" fill="currentColor" />
                <circle cx="5" cy="18" r="1.2" fill="currentColor" />
              </svg>
            </span>
          ) : null}
          <div className="toolbar-title-block">
            {browseSelection.kind === 'author' ? (
              <button
                type="button"
                className="toolbar-title-btn"
                title="编辑作者名"
                onClick={() => setRenameModalOpen(true)}
              >
                <h2 id="browse-title">{page.title}</h2>
              </button>
            ) : (
              <h2 id="browse-title">{page.title}</h2>
            )}
            <div className="meta" id="browse-meta">
              {page.meta}
            </div>
          </div>
        </div>
        <div className="toolbar-actions">
          {isGalleryBrowse ? (
            <>
              <button
                type="button"
                className={`btn-select${selectMode ? ' is-on' : ''}`}
                onClick={() => {
                  setSelectMode((v) => {
                    if (v) setSelected(new Set())
                    return !v
                  })
                }}
              >
                {selectMode ? '取消多选' : '多选'}
              </button>
              <div className="sort-group view-switch" role="group" aria-label="视图">
                {VIEW_MODES.map(({ id, label, icon }) => (
                  <button
                    key={id}
                    type="button"
                    className="view-switch-btn"
                    aria-pressed={view === id}
                    title={label}
                    aria-label={label}
                    onClick={() => setViewPersist(id)}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {selectMode && isGalleryBrowse ? (
        <div className="batch-dock" role="toolbar" aria-label="批量操作">
          <div className="batch-dock-count">
            <strong>{selectedRefs.length}</strong>
            <span>已选 / {items.length}</span>
          </div>
          <div className="batch-dock-actions">
            {batchActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`batch-dock-btn${action.danger ? ' danger' : ''}`}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="library-layout">
        <div className={`library-main${isGalleryBrowse ? ' grid-scroll' : ' authors-scroll'}`}>
          {isAuthorsIndex ? (
            visibleAuthors.length === 0 && !loading ? (
              <div className="empty">
                <h3>{query.trim() ? '没有匹配的作者' : '还没有作者'}</h3>
                {query.trim() ? (
                  <button type="button" className="btn btn-primary" onClick={() => setQuery('')}>
                    清空搜索
                  </button>
                ) : null}
              </div>
            ) : loading && visibleAuthors.length === 0 ? (
              <div className="authors-grid" aria-hidden>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div className="author-card skeleton-author-card" key={i}>
                    <div className="author-card-cover skeleton-cover" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line short" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="authors-grid">
                {visibleAuthors.map((a) => {
                  const avatarRecord = authorAvatarsByAuthor.get(a.author)
                  const avatarUrl = avatarRecord
                    ? api.getAuthorAvatarUrl(avatarRecord.relativePath, avatarRecord.updatedAt)
                    : undefined
                  return (
                    <AuthorCard
                      key={a.author}
                      author={a.author}
                      count={a.count}
                      coverEntry={authorCoverMap.get(a.author)}
                      avatarUrl={avatarUrl}
                      onOpen={(author) => onBrowseSelectionChange?.({ kind: 'author', author })}
                    />
                  )
                })}
              </div>
            )
          ) : items.length === 0 && !loading ? (
            <div className="empty">
              {narrowed ? (
                <>
                  <h3>没有符合条件的套图</h3>
                  {query.trim() ? (
                    <button type="button" className="btn btn-primary" onClick={() => setQuery('')}>
                      清空搜索
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <h3>还没有套图</h3>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      window.dispatchEvent(new CustomEvent('wallpaper-runner:go-download'))
                    }
                  >
                    去获取
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
          ) : (
            <VirtualGalleryGrid
              items={items}
              density={density}
              getKey={keyOf}
              onOpenIndex={(i) => {
                const entry = items[i]
                if (entry) onOpenGallery(entry)
              }}
              renderItem={(entry) => (
                <div onContextMenu={(e) => openCardMenu(e, entry)}>
                  <GalleryCard
                    entry={entry}
                    selectMode={selectMode}
                    selected={selected.has(keyOf(entry))}
                    onOpen={onOpenGallery}
                    onToggleSelect={toggleSelect}
                    onToggleFavorite={(e) => patchFavorite(e, !e.favorite)}
                  />
                </div>
              )}
            />
          )}
        </div>
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.entry ? cardMenuItems(menu.entry) : blankMenuItems()}
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

      {browseSelection.kind === 'author' && renameModalOpen ? (
        <AuthorRenameModal
          author={browseSelection.author}
          galleryCount={items.length}
          busy={renameBusy}
          onClose={() => setRenameModalOpen(false)}
          onSave={(newName) => {
            const oldName = browseSelection.author
            setRenameModalOpen(false)
            setRenameBusy(true)
            void api
              .renameAuthor(oldName, newName)
              .then((n) => {
                onBrowseSelectionChange?.({ kind: 'author', author: newName })
                setAuthorAvatars((prev) =>
                  prev.map((a) => (a.author === oldName ? { ...a, author: newName } : a)),
                )
                void api.getAuthorAvatar(newName).then((record) => {
                  setAuthorAvatarRecord(record)
                })
                reload({ author: newName })
                toast.success(`已更新 ${n} 部套图的作者名`)
              })
              .catch((err: unknown) =>
                toast.error(err instanceof Error ? err.message : String(err)),
              )
              .finally(() => setRenameBusy(false))
          }}
        />
      ) : null}

      {browseSelection.kind === 'author' && avatarModalOpen ? (
        <AuthorAvatarModal
          author={browseSelection.author}
          initialRecord={authorAvatarRecord}
          onClose={() => setAvatarModalOpen(false)}
          onSaved={(record) => {
            setAuthorAvatarRecord(record)
            if (record) {
              setAuthorAvatars((prev) => [...prev.filter((a) => a.author !== record.author), record])
            } else if (browseSelection.kind === 'author') {
              setAuthorAvatars((prev) => prev.filter((a) => a.author !== browseSelection.author))
            }
          }}
        />
      ) : null}

      {browseSelection.kind === 'playlist' ? (
        <PlaylistManageModal
          playlistId={browseSelection.id}
          playlistName={browseSelection.name}
          open={playlistManageOpen}
          onClose={() => setPlaylistManageOpen(false)}
          onSaved={(message) => {
            toast.success(message)
            reload()
          }}
          onError={(message) => toast.error(message)}
        />
      ) : null}
    </section>
  )
}
