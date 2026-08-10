import { useEffect, useRef, useState, type JSX } from 'react'
import LibraryPage from './pages/LibraryPage'
import GalleryPage from './pages/GalleryPage'
import DownloadPage from './pages/DownloadPage'
import SettingsPage from './pages/SettingsPage'
import ToastHost from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import ShortcutHelp from './components/ShortcutHelp'
import DownloadDock from './components/DownloadDock'
import OnboardingModal from './components/OnboardingModal'
import CollectionRail, { type BrowseSelection } from './components/CollectionRail'
import { ToastProvider, useToast } from './lib/toast'
import { api, type AppSettings, type LibraryIndexEntry, type QueueTask } from './lib/api'
import {
  applyTheme,
  THEME_CHANGED_EVENT,
  watchSystemTheme,
  type ThemePreference,
} from './lib/theme'

type AppMode = 'browse' | 'acquire' | 'settings'

const ACTIVE = new Set(['queued', 'resolving', 'downloading', 'paused'])

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  const tag = t.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return t.isContentEditable
}

function AppShell(): JSX.Element {
  const toast = useToast()
  const [mode, setMode] = useState<AppMode>('browse')
  const [browseSelection, setBrowseSelection] = useState<BrowseSelection>({ kind: 'all' })
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [headerQuery, setHeaderQuery] = useState('')
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
      setMode('acquire')
    }
    window.addEventListener('wallpaper-runner:go-download', onGoDownload)
    return () => window.removeEventListener('wallpaper-runner:go-download', onGoDownload)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)')
    const apply = (): void => setRailCollapsed(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (document.querySelector('.yarl__root')) return
      if (isTypingTarget(e.target) && e.key !== 'Escape') return

      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === ',') {
        e.preventDefault()
        setActive(null)
        setMode('settings')
        return
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setActive(null)
        setMode('browse')
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>('[data-focus="library-search"]')?.focus()
        })
        return
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setActive(null)
        setMode('acquire')
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
        if (activeRef.current) {
          setActive(null)
          return
        }
        if (mode !== 'browse') setMode('browse')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode])

  const activeCount = tasks.filter((t) => ACTIVE.has(t.status)).length
  const showRail = mode === 'browse' && !active

  function openGallery(entry: LibraryIndexEntry): void {
    setActive(entry)
    void api.recordBrowse({
      source: entry.source,
      galleryId: entry.galleryId,
      title: entry.displayTitle || entry.title,
      dirName: entry.dirName,
      cover: entry.cover,
    })
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="brand-block"
          onClick={() => {
            setActive(null)
            setMode('browse')
            setBrowseSelection({ kind: 'all' })
          }}
        >
          <h1 className="brand-title">WallpaperRunner</h1>
          <p className="muted brand-sub">套图下载 · 本地库 · 上墙</p>
        </button>
        {mode === 'browse' && !active ? (
          <input
            className="header-search"
            data-focus="library-search"
            placeholder="搜索标题 / 作者 / 标签"
            value={headerQuery}
            onChange={(e) => setHeaderQuery(e.target.value)}
          />
        ) : (
          <div className="header-spacer" />
        )}
        <div className="header-actions">
          <button
            type="button"
            className={mode === 'acquire' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => {
              setActive(null)
              setMode('acquire')
            }}
          >
            获取
            {activeCount > 0 ? <span className="nav-badge">{activeCount}</span> : null}
          </button>
          <button
            type="button"
            className={mode === 'settings' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => {
              setActive(null)
              setMode('settings')
            }}
          >
            设置
          </button>
        </div>
      </header>

      <div className={`app-body${showRail ? ' with-rail' : ''}`}>
        {showRail ? (
          <CollectionRail
            selection={browseSelection}
            onSelect={setBrowseSelection}
            collapsed={railCollapsed}
            onToggleCollapsed={() => setRailCollapsed((v) => !v)}
          />
        ) : null}
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
            hidden={Boolean(active) || mode !== 'browse'}
            style={{ display: active || mode !== 'browse' ? 'none' : undefined }}
          >
            <LibraryPage
              browseSelection={browseSelection}
              query={headerQuery}
              onQueryChange={setHeaderQuery}
              hideSearch
              onOpenGallery={openGallery}
            />
          </div>
          <div
            className="tab-panel"
            hidden={Boolean(active) || mode !== 'acquire'}
            style={{ display: active || mode !== 'acquire' ? 'none' : undefined }}
          >
            <DownloadPage />
          </div>
          <div
            className="tab-panel"
            hidden={Boolean(active) || mode !== 'settings'}
            style={{ display: active || mode !== 'settings' ? 'none' : undefined }}
          >
            <SettingsPage />
          </div>
        </main>
      </div>
      <DownloadDock
        tasks={tasks}
        onOpenDownload={() => {
          setActive(null)
          setMode('acquire')
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
