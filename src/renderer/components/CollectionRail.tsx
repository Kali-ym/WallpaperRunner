import { useEffect, useState, type JSX } from 'react'
import { api, type AuthorStat } from '../lib/api'

export type BrowseSelection =
  | { kind: 'all' }
  | { kind: 'favorite' }
  | { kind: 'author'; author: string }
  | { kind: 'playlist'; id: string; name: string }

type PlaylistLite = { id: string; name: string; count: number }

type Props = {
  selection: BrowseSelection
  onSelect: (next: BrowseSelection) => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export default function CollectionRail({
  selection,
  onSelect,
  collapsed,
  onToggleCollapsed,
}: Props): JSX.Element {
  const [authors, setAuthors] = useState<AuthorStat[]>([])
  const [playlists, setPlaylists] = useState<PlaylistLite[]>([])
  const [authorsOpen, setAuthorsOpen] = useState(true)
  const [listsOpen, setListsOpen] = useState(true)

  useEffect(() => {
    void Promise.all([api.authorStats(), api.listPlaylists()]).then(([a, pls]) => {
      setAuthors(a)
      setPlaylists(
        pls.map((p) => ({
          id: p.id,
          name: p.name,
          count: p.galleryRefs.length,
        })),
      )
    })
    return api.onLibraryChange(() => {
      void api.authorStats().then(setAuthors)
    })
  }, [])

  useEffect(() => {
    const reloadPl = (): void => {
      void api.listPlaylists().then((pls) =>
        setPlaylists(
          pls.map((p) => ({
            id: p.id,
            name: p.name,
            count: p.galleryRefs.length,
          })),
        ),
      )
    }
    const t = setInterval(reloadPl, 4000)
    return () => clearInterval(t)
  }, [])

  if (collapsed) {
    return (
      <aside className="collection-rail collapsed">
        <button type="button" className="btn tiny" onClick={onToggleCollapsed} title="展开侧栏">
          »
        </button>
      </aside>
    )
  }

  return (
    <aside className="collection-rail">
      <div className="rail-head">
        <span className="rail-title">收藏夹</span>
        {onToggleCollapsed ? (
          <button type="button" className="btn tiny" onClick={onToggleCollapsed} title="收起">
            «
          </button>
        ) : null}
      </div>
      <nav className="rail-nav" aria-label="收藏夹">
        <button
          type="button"
          className={selection.kind === 'all' ? 'rail-item active' : 'rail-item'}
          onClick={() => onSelect({ kind: 'all' })}
        >
          全部
        </button>
        <button
          type="button"
          className={selection.kind === 'favorite' ? 'rail-item active' : 'rail-item'}
          onClick={() => onSelect({ kind: 'favorite' })}
        >
          收藏
        </button>

        <button
          type="button"
          className="rail-section-toggle"
          onClick={() => setAuthorsOpen((v) => !v)}
        >
          作者 {authorsOpen ? '▾' : '▸'}
        </button>
        {authorsOpen ? (
          <ul className="rail-list">
            {authors.slice(0, 40).map((a) => (
              <li key={a.author}>
                <button
                  type="button"
                  className={
                    selection.kind === 'author' && selection.author === a.author
                      ? 'rail-item active'
                      : 'rail-item'
                  }
                  onClick={() => onSelect({ kind: 'author', author: a.author })}
                >
                  <span className="rail-label">{a.author}</span>
                  <span className="rail-count muted">{a.count}</span>
                </button>
              </li>
            ))}
            {authors.length === 0 ? <li className="muted rail-empty">暂无作者</li> : null}
          </ul>
        ) : null}

        <button
          type="button"
          className="rail-section-toggle"
          onClick={() => setListsOpen((v) => !v)}
        >
          播放列表 {listsOpen ? '▾' : '▸'}
        </button>
        {listsOpen ? (
          <ul className="rail-list">
            {playlists.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={
                    selection.kind === 'playlist' && selection.id === p.id
                      ? 'rail-item active'
                      : 'rail-item'
                  }
                  onClick={() => onSelect({ kind: 'playlist', id: p.id, name: p.name })}
                >
                  <span className="rail-label">{p.name}</span>
                  <span className="rail-count muted">{p.count}</span>
                </button>
              </li>
            ))}
            {playlists.length === 0 ? <li className="muted rail-empty">暂无列表</li> : null}
            <li>
              <button
                type="button"
                className="rail-item ghost"
                onClick={() => {
                  void api.createPlaylist('未命名列表').then((pl) => {
                    setPlaylists((prev) => [
                      { id: pl.id, name: pl.name, count: 0 },
                      ...prev,
                    ])
                    onSelect({ kind: 'playlist', id: pl.id, name: pl.name })
                  })
                }}
              >
                + 新建列表
              </button>
            </li>
          </ul>
        ) : null}
      </nav>
    </aside>
  )
}
