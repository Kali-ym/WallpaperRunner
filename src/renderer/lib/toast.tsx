import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react'

export type ToastKind = 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  kind: ToastKind
  message: string
}

type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

type ToastContextValue = ToastApi & {
  toasts: ToastItem[]
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = `toast-${++toastId}`
      setToasts((prev) => [...prev, { id, kind, message }])
      window.setTimeout(() => dismiss(id), 3000)
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      dismiss,
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [toasts, dismiss, push],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return {
    success: ctx.success,
    error: ctx.error,
    info: ctx.info,
  }
}

export function useToastState(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToastState must be used within ToastProvider')
  }
  return ctx
}
