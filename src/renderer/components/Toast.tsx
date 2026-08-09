import type { JSX } from 'react'
import { useToastState } from '../lib/toast'

export default function ToastHost(): JSX.Element {
  const { toasts, dismiss } = useToastState()

  return (
    <div className="toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind}`}
          role="status"
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
