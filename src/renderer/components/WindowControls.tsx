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
          <path d="M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="window-control"
        aria-label={maximized ? '还原' : '最大化'}
        onClick={() => void api.windowToggleMaximize().then(setMaximized)}
      >
        {maximized ? (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M8.5 4.5h9v9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <rect
              x="4.5"
              y="8.5"
              width="11"
              height="11"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect
              x="5"
              y="5"
              width="14"
              height="14"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.5"
            />
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
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
