import { useEffect, useState, type JSX } from 'react'
import { api } from '../lib/api'

export default function WindowControls(): JSX.Element | null {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void api.windowIsMaximized().then(setMaximized)
    return api.onWindowMaximized(setMaximized)
  }, [])

  if (!api.windowIsFrameless()) return null

  return (
    <div className="window-controls" aria-label="窗口控制">
      <button
        type="button"
        className="window-control"
        aria-label="最小化"
        onClick={() => void api.windowMinimize()}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="window-control"
        aria-label={maximized ? '还原' : '最大化'}
        onClick={() => void api.windowToggleMaximize()}
      >
        {maximized ? (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="8" y="8" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.9" />
            <path d="M5.5 5.5h10v10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.9" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="window-control close"
        aria-label="关闭"
        onClick={() => void api.windowClose()}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M7.5 7.5l9 9M16.5 7.5l-9 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
