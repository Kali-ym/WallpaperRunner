import { useEffect, useState, type JSX } from 'react'
import LibraryPage from './pages/LibraryPage'
import GalleryPage from './pages/GalleryPage'
import DownloadPage from './pages/DownloadPage'
import SettingsPage from './pages/SettingsPage'
import PlaylistsPage from './pages/PlaylistsPage'
import ToastHost from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './lib/toast'
import { api, type LibraryIndexEntry } from './lib/api'
import {
  applyTheme,
  THEME_CHANGED_EVENT,
  watchSystemTheme,
  type ThemePreference,
} from './lib/theme'

type Tab = 'library' | 'playlists' | 'download' | 'settings'

function AppShell(): JSX.Element {
  const [tab, setTab] = useState<Tab>('library')
  const [active, setActive] = useState<LibraryIndexEntry | null>(null)
  const [themePref, setThemePref] = useState<ThemePreference>('system')

  useEffect(() => {
    void api.getSettings().then((s) => {
      const pref = s.theme ?? 'system'
      setThemePref(pref)
      applyTheme(pref)
    })
  }, [])

  useEffect(() => {
    applyTheme(themePref)
    return watchSystemTheme(themePref, () => applyTheme(themePref))
  }, [themePref])

  useEffect(() => {
    const onTheme = (e: Event) => {
      const pref = (e as CustomEvent<ThemePreference>).detail
      if (pref) setThemePref(pref)
    }
    window.addEventListener(THEME_CHANGED_EVENT, onTheme)
    return () => window.removeEventListener(THEME_CHANGED_EVENT, onTheme)
  }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>套图库</h1>
          <p className="muted">本地套图下载与查看器</p>
        </div>
        <nav className="nav" aria-label="主导航">
          <button
            type="button"
            className={tab === 'library' && !active ? 'nav-btn active' : 'nav-btn'}
            onClick={() => {
              setActive(null)
              setTab('library')
            }}
          >
            库
          </button>
          <button
            type="button"
            className={tab === 'playlists' && !active ? 'nav-btn active' : 'nav-btn'}
            onClick={() => {
              setActive(null)
              setTab('playlists')
            }}
          >
            播放列表
          </button>
          <button
            type="button"
            className={tab === 'download' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => {
              setActive(null)
              setTab('download')
            }}
          >
            下载
          </button>
          <button
            type="button"
            className={tab === 'settings' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => {
              setActive(null)
              setTab('settings')
            }}
          >
            设置
          </button>
        </nav>
      </header>

      <main className="app-main">
        {active ? (
          <GalleryPage
            entry={active}
            onBack={() => setActive(null)}
            onDeleted={() => setActive(null)}
          />
        ) : null}
        <div
          className="tab-panel"
          hidden={Boolean(active) || tab !== 'library'}
          style={{ display: active || tab !== 'library' ? 'none' : undefined }}
        >
          <LibraryPage onOpenGallery={setActive} />
        </div>
        <div
          className="tab-panel"
          hidden={Boolean(active) || tab !== 'playlists'}
          style={{ display: active || tab !== 'playlists' ? 'none' : undefined }}
        >
          <PlaylistsPage active={!active && tab === 'playlists'} />
        </div>
        <div
          className="tab-panel"
          hidden={Boolean(active) || tab !== 'download'}
          style={{ display: active || tab !== 'download' ? 'none' : undefined }}
        >
          <DownloadPage />
        </div>
        <div
          className="tab-panel"
          hidden={Boolean(active) || tab !== 'settings'}
          style={{ display: active || tab !== 'settings' ? 'none' : undefined }}
        >
          <SettingsPage />
        </div>
      </main>
      <ToastHost />
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </ErrorBoundary>
  )
}
