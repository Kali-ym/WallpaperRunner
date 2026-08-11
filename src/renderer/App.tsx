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
import WindowControls from './components/WindowControls'
import CollectionRail, { type BrowseSelection } from './components/CollectionRail'
import { ToastProvider, useToast } from './lib/toast'
import { ConfirmProvider } from './lib/confirm'
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

function BrandMark(): JSX.Element {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M8 22c2-6 4.5-10 7-12 1.5 4 3 6.5 5 8 1.5-3 3-5 5-6-1 6-2.5 10-4 14H8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="22.5" cy="9.5" r="1.6" fill="currentColor" />
      <path
        d="M6 25h20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  )
}

function AppShell(): JSX.Element {
  const toast = useToast()
  const [mode, setMode] = useState<AppMode>('browse')
  const [browseSelection, setBrowseSelection] = useState<BrowseSelection>({ kind: 'all' })
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

  function goHome(): void {
    setActive(null)
    setMode('browse')
    setBrowseSelection({ kind: 'all' })
  }

  return (
    <div className={`app${api.windowIsFrameless() ? ' is-frameless' : ''}`}>
      <header
        className="header"
        onDoubleClick={() => {
          if (api.windowIsFrameless()) void api.windowToggleMaximize()
        }}
      >
        <div className="header-main">
          <button type="button" className="brand" onClick={goHome} aria-label="WallpaperRunner 首页">
            <BrandMark />
            <span className="brand-name">WallpaperRunner</span>
          </button>

          {mode === 'browse' && !active ? (
            <label className="search">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M16 16.5L20 20.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="search"
                data-focus="library-search"
                placeholder="搜索壁纸、作者或关键词"
                autoComplete="off"
                value={headerQuery}
                onChange={(e) => setHeaderQuery(e.target.value)}
              />
              <kbd>⌘K</kbd>
            </label>
          ) : (
            <div className="header-spacer" />
          )}

          <div className="header-actions">
            <button
              type="button"
              className={mode === 'acquire' ? 'icon-btn active' : 'icon-btn'}
              title="获取"
              aria-label="获取壁纸"
              onClick={() => {
                setActive(null)
                setMode('acquire')
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 4v11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path
                  d="M7.5 11.5L12 16l4.5-4.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M5 19.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {activeCount > 0 ? <span className="dot" /> : null}
            </button>
            <button
              type="button"
              className={mode === 'settings' ? 'icon-btn active' : 'icon-btn'}
              title="设置"
              aria-label="设置"
              onClick={() => {
                setActive(null)
                setMode('settings')
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <WindowControls />
      </header>

      <div className="body" style={showRail ? undefined : { gridTemplateColumns: '1fr' }}>
        {showRail ? (
          <CollectionRail
            selection={browseSelection}
            onSelect={setBrowseSelection}
            onManagePlaylist={(id) => {
              window.dispatchEvent(
                new CustomEvent('wallpaper-runner:manage-playlist', { detail: { id } }),
              )
            }}
          />
        ) : null}
        <main className="main">
          {active ? (
            <section className="view view-gallery active" aria-label="套图详情">
              <GalleryPage
                entry={active}
                onBack={() => setActive(null)}
                onDeleted={() => setActive(null)}
              />
            </section>
          ) : null}
          <section
            className={active || mode !== 'browse' ? 'view' : 'view active'}
            hidden={Boolean(active) || mode !== 'browse'}
            aria-label="本地套图库"
            style={{ display: active || mode !== 'browse' ? 'none' : undefined }}
          >
            <LibraryPage
              browseSelection={browseSelection}
              onBrowseSelectionChange={setBrowseSelection}
              query={headerQuery}
              onQueryChange={setHeaderQuery}
              hideSearch
              onOpenGallery={openGallery}
            />
          </section>
          <section
            className={active || mode !== 'acquire' ? 'view' : 'view active'}
            hidden={Boolean(active) || mode !== 'acquire'}
            aria-label="获取"
            style={{ display: active || mode !== 'acquire' ? 'none' : undefined }}
          >
            <DownloadPage />
          </section>
          <section
            className={active || mode !== 'settings' ? 'view' : 'view active'}
            hidden={Boolean(active) || mode !== 'settings'}
            aria-label="设置"
            style={{ display: active || mode !== 'settings' ? 'none' : undefined }}
          >
            <SettingsPage />
          </section>

          <DownloadDock tasks={tasks} />
        </main>
      </div>

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
        <ConfirmProvider>
          <AppShell />
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
