import { useState, type JSX } from 'react'
import LibraryPage from './pages/LibraryPage'
import GalleryPage from './pages/GalleryPage'
import DownloadPage from './pages/DownloadPage'
import SettingsPage from './pages/SettingsPage'
import ToastHost from './components/Toast'
import { ToastProvider, useToast } from './lib/toast'
import type { LibraryIndexEntry } from './lib/api'

type Tab = 'library' | 'download' | 'settings'

function AppShell(): JSX.Element {
  const [tab, setTab] = useState<Tab>('library')
  const [active, setActive] = useState<LibraryIndexEntry | null>(null)
  const toast = useToast()

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
        ) : tab === 'library' ? (
          <LibraryPage onOpenGallery={setActive} />
        ) : tab === 'download' ? (
          <DownloadPage />
        ) : (
          <SettingsPage />
        )}
      </main>
      <ToastHost />
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  )
}
