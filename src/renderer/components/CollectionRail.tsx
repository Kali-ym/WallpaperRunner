import { useEffect, useRef, useState, type JSX, type KeyboardEvent, type MouseEvent } from 'react'
import { api } from '../lib/api'
import ContextMenu from './ContextMenu'

export type BrowseSelection =
  | { kind: 'all' }
  | { kind: 'favorite' }
  | { kind: 'authors' }
  | { kind: 'author'; author: string }
  | { kind: 'playlist'; id: string; name: string }

type PlaylistLite = { id: string; name: string; count: number }

type Props = {
  selection: BrowseSelection
  onSelect: (next: BrowseSelection) => void
  onManagePlaylist?: (id: string, name: string) => void
}

export default function CollectionRail({ selection, onSelect, onManagePlaylist }: Props): JSX.Element {
  const [authorCount, setAuthorCount] = useState(0)
  const [playlists, setPlaylists] = useState<PlaylistLite[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [favCount, setFavCount] = useState(0)
  const [listsOpen, setListsOpen] = useState(true)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [playlistMenu, setPlaylistMenu] = useState<{ id: string; name: string; x: number; y: number } | null>(
    null,
  )
  const renameInputRef = useRef<HTMLInputElement>(null)

  const authorsActive = selection.kind === 'authors' || selection.kind === 'author'

  function reloadStats(): void {
    void Promise.all([api.authorStats(), api.listPlaylists(), api.listLibrary('')]).then(
      ([a, pls, lib]) => {
        setAuthorCount(a.length)
        setPlaylists(
          pls.map((p) => ({
            id: p.id,
            name: p.name,
            count: p.galleryRefs.length,
          })),
        )
        setTotalCount(lib.length)
        setFavCount(lib.filter((e) => e.favorite).length)
      },
    )
  }

  useEffect(() => {
    reloadStats()
    return api.onLibraryChange(() => reloadStats())
  }, [])

  useEffect(() => {
    if (!renamingId) return
    const el = renameInputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [renamingId])

  function startRename(id: string, name: string): void {
    setRenamingId(id)
    setRenameDraft(name)
  }

  async function commitRename(id: string): Promise<void> {
    const pl = playlists.find((p) => p.id === id)
    const name = renameDraft.trim() || pl?.name || '未命名列表'
    setRenamingId(null)
    if (!pl || name === pl.name) return
    await api.renamePlaylist(id, name)
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
    if (selection.kind === 'playlist' && selection.id === id) {
      onSelect({ kind: 'playlist', id, name })
    }
  }

  function onRenameKey(e: KeyboardEvent<HTMLInputElement>, id: string): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commitRename(id)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setRenamingId(null)
    }
  }

  function playlistIcon(): JSX.Element {
    return (
      <span className="ico" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
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
    )
  }

  async function deletePlaylist(id: string, name: string): Promise<void> {
    if (!window.confirm(`确定删除播放列表「${name}」？`)) return
    await api.deletePlaylist(id)
    setPlaylists((prev) => prev.filter((p) => p.id !== id))
    if (selection.kind === 'playlist' && selection.id === id) {
      onSelect({ kind: 'all' })
    }
  }

  function openPlaylistMenu(e: MouseEvent, p: PlaylistLite): void {
    e.preventDefault()
    e.stopPropagation()
    setPlaylistMenu({ id: p.id, name: p.name, x: e.clientX, y: e.clientY })
  }

  return (
    <aside className="rail" aria-label="收藏夹与导航">
      <div className="rail-section">
        <div className="rail-label">浏览</div>
        <button
          type="button"
          className={selection.kind === 'all' ? 'rail-item active' : 'rail-item'}
          onClick={() => onSelect({ kind: 'all' })}
        >
          <span className="ico" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 6.5h16M4 12h16M4 17.5h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="name">全部</span>
          <span className="count">{totalCount}</span>
        </button>
        <button
          type="button"
          className={selection.kind === 'favorite' ? 'rail-item active' : 'rail-item'}
          onClick={() => onSelect({ kind: 'favorite' })}
        >
          <span className="ico" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
                fill={selection.kind === 'favorite' ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="name">收藏</span>
          <span className="count">{favCount}</span>
        </button>
        <button
          type="button"
          className={authorsActive ? 'rail-item active' : 'rail-item'}
          onClick={() => onSelect({ kind: 'authors' })}
        >
          <span className="ico" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M6 19.5c.8-3.2 3.2-5 6-5s5.2 1.8 6 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="name">作者</span>
          <span className="count">{authorCount}</span>
        </button>
      </div>

      <div className="rail-section rail-section-playlists">
        <button type="button" className="rail-section-toggle" onClick={() => setListsOpen((v) => !v)}>
          播放列表 {listsOpen ? '▾' : '▸'}
        </button>
        {listsOpen ? (
          <>
            <ul className="rail-list rail-list-playlists">
              {playlists.map((p) => {
                const isActive = selection.kind === 'playlist' && selection.id === p.id
                const isRenaming = renamingId === p.id
                return (
                  <li key={p.id} className={isRenaming ? 'rail-playlist-item is-renaming' : 'rail-playlist-item'}>
                    {isRenaming ? (
                      <div
                        className={`rail-item rail-item-rename${isActive ? ' active' : ''}`}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        {playlistIcon()}
                        <input
                          ref={renameInputRef}
                          className="rail-rename-input"
                          value={renameDraft}
                          aria-label="播放列表名称"
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={() => void commitRename(p.id)}
                          onKeyDown={(e) => onRenameKey(e, p.id)}
                        />
                        <span className="count">{p.count}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={isActive ? 'rail-item active' : 'rail-item'}
                        onClick={() => onSelect({ kind: 'playlist', id: p.id, name: p.name })}
                        onDoubleClick={() => startRename(p.id, p.name)}
                        onContextMenu={(e) => openPlaylistMenu(e, p)}
                      >
                        {playlistIcon()}
                        <span className="name">{p.name}</span>
                        <span className="count">{p.count}</span>
                      </button>
                    )}
                  </li>
                )
              })}
              {playlists.length === 0 ? <li className="muted rail-empty">暂无列表</li> : null}
            </ul>
            <button
              type="button"
              className="btn-new-list"
              onClick={() => {
                void api.createPlaylist('未命名列表').then((pl) => {
                  setPlaylists((prev) => [{ id: pl.id, name: pl.name, count: 0 }, ...prev])
                  onSelect({ kind: 'playlist', id: pl.id, name: pl.name })
                  startRename(pl.id, pl.name)
                })
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              新建播放列表
            </button>
          </>
        ) : null}
      </div>

      {playlistMenu ? (
        <ContextMenu
          x={playlistMenu.x}
          y={playlistMenu.y}
          items={[
            { id: 'open', label: '打开' },
            { id: 'manage', label: '管理套图' },
            { id: 'rename', label: '重命名' },
            { id: 'delete', label: '删除列表', danger: true },
          ]}
          onClose={() => setPlaylistMenu(null)}
          onSelect={(id) => {
            const { id: plId, name } = playlistMenu
            setPlaylistMenu(null)
            if (id === 'open') onSelect({ kind: 'playlist', id: plId, name })
            if (id === 'manage') {
              onSelect({ kind: 'playlist', id: plId, name })
              window.setTimeout(() => onManagePlaylist?.(plId, name), 0)
            }
            if (id === 'rename') startRename(plId, name)
            if (id === 'delete') void deletePlaylist(plId, name)
          }}
        />
      ) : null}
    </aside>
  )
}
