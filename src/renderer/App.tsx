import { useEffect, useRef, useState, type JSX } from 'react'
import LibraryPage from './pages/LibraryPage'
import GalleryPage from './pages/GalleryPage'
import DownloadPage from './pages/DownloadPage'
import SettingsPage from './pages/SettingsPage'
import PlaylistsPage from './pages/PlaylistsPage'
import ToastHost from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import ShortcutHelp from './components/ShortcutHelp'
import DownloadDock from './components/DownloadDock'
import OnboardingModal from './components/OnboardingModal'
import { ToastProvider, useToast } from './lib/toast'
import { api, type AppSettings, type LibraryIndexEntry, type QueueTask } from './lib/api'
import {
  applyTheme,
  THEME_CHANGED_EVENT,
  watchSystemTheme,
  type ThemePreference,
} from './lib/theme'

type Tab = 'library' | 'playlists' | 'download' | 'settings'

const TABS: Tab[] = ['library', 'playlists', 'download', 'settings']
const ACTIVE = new Set(['queued', 'resolving', 'downloading'])

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  const tag = t.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return t.isContentEditable
}

function AppShell(): JSX.Element {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('library')
  const [active, setActive] = useState<LibraryIndexEntry | null>(null)
  const [themePref, setThemePref] = useState<ThemePreference>('system')
  const [helpOpen, setHelpOpen] = useState(false)
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [bootSettings, setBootSettings] = useState<AppSettings | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const helpOpenRef = useRef(helpOpen)
  const activeRef = useRef(active)
  const prevStatus = useRef<Map<string, QueueTask['status']>>(new Map())
  helpOpenRef.current = helpOpen
  activeRef.current = active

  useEffect(() => {
    void api.getSettings().then((s) => {
      const pref = s.theme ?? 'system'
      setThemePref(pref)
      applyTheme(pref)
      setBootSettings(s)
      setShowOnboarding(!s.onboardingDone)
    })
  }, [])

  useEffect(() => {
    function onReplay(): void {
      void api.getSettings().then((s) => {
        setBootSettings(s)
        setShowOnboarding(true)
      })
    }
    window.addEventListener('wallpaper-runner:replay-onboarding', onReplay)
    return () => window.removeEventListener('wallpaper-runner:replay-onboarding', onReplay)
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

  useEffect(() => {
    void api.listTasks().then((list) => {
      setTasks(list)
      prevStatus.current = new Map(list.map((t) => [t.id, t.status]))
    })
    return api.onQueueUpdate((list) => {
      setTasks(list)
      for (const t of list) {
        const prev = prevStatus.current.get(t.id)
        if (prev && prev !== 'completed' && t.status === 'completed') {
          toast.success(t.title ? `下载完成：${t.title}` : '下载完成')
        }
        if (prev && prev !== 'failed' && t.status === 'failed') {
          toast.error(t.error ? `下载失败：${t.error}` : '下载失败')
        }
      }
      prevStatus.current = new Map(list.map((x) => [x.id, x.status]))
    })
  }, [toast])

  useEffect(() => {
    function onGoDownload(): void {
      setActive(null)
      setTab('download')
    }
    window.addEventListener('wallpaper-runner:go-download', onGoDownload)
    return () => window.removeEventListener('wallpaper-runner:go-download', onGoDownload)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (document.querySelector('.yarl__root')) return
      if (isTypingTarget(e.target) && e.key !== 'Escape') return

      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key >= '1' && e.key <= '4') {
        e.preventDefault()
        setActive(null)
        setTab(TABS[Number(e.key) - 1]!)
        return
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setActive(null)
        setTab('library')
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>('[data-focus="library-search"]')?.focus()
        })
        return
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setActive(null)
        setTab('download')
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>('[data-focus="download-urls"]')?.focus()
        })
        return
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setHelpOpen(true)
        return
      }
      if (e.key === 'Escape') {
        if (helpOpenRef.current) {
          setHelpOpen(false)
          return
        }
        if (activeRef.current) setActive(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const activeCount = tasks.filter((t) => ACTIVE.has(t.status)).length

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
            {activeCount > 0 ? <span className="nav-badge">{activeCount}</span> : null}
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
          <LibraryPage
            onOpenGallery={(entry) => {
              setActive(entry)
              void api.recordBrowse({
                source: entry.source,
                galleryId: entry.galleryId,
                title: entry.displayTitle || entry.title,
                dirName: entry.dirName,
                cover: entry.cover,
              })
            }}
          />
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
      <DownloadDock
        tasks={tasks}
        onOpenDownload={() => {
          setActive(null)
          setTab('download')
        }}
      />
      {showOnboarding && bootSettings ? (
        <OnboardingModal
          initial={bootSettings}
          onDone={(next) => {
            setBootSettings(next)
            setShowOnboarding(false)
            if (next.theme) {
              setThemePref(next.theme)
              applyTheme(next.theme)
            }
            toast.success('初始设置已完成')
          }}
        />
      ) : null}
      {helpOpen ? <ShortcutHelp onClose={() => setHelpOpen(false)} /> : null}
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
