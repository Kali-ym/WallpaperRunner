import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmRequest = ConfirmOptions & {
  resolve: (value: boolean) => void
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

function ConfirmDialog({
  request,
  onAnswer,
}: {
  request: ConfirmRequest
  onAnswer: (value: boolean) => void
}): JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const title = request.title ?? '确认'
  const confirmLabel = request.confirmLabel ?? '确定'
  const cancelLabel = request.cancelLabel ?? '取消'

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        onAnswer(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAnswer])

  return (
    <div className="modal-root confirm-root" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="关闭"
        onClick={() => onAnswer(false)}
      />
      <div className="modal-panel confirm-panel">
        <h3 className="drawer-title" id="confirm-title">
          {title}
        </h3>
        <p className="confirm-message">{request.message}</p>
        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={() => onAnswer(false)}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={request.danger ? 'btn btn-primary confirm-danger' : 'btn btn-primary'}
            onClick={() => onAnswer(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === 'string' ? { message: options } : options
    return new Promise<boolean>((resolve) => {
      setRequest({
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel,
        cancelLabel: opts.cancelLabel,
        danger: opts.danger,
        resolve,
      })
    })
  }, [])

  const answer = useCallback((value: boolean) => {
    setRequest((current) => {
      current?.resolve(value)
      return null
    })
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request ? <ConfirmDialog request={request} onAnswer={answer} /> : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return ctx
}
