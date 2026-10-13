import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react'

/** Lightweight toast system used for form and action feedback. */

const ToastContext = createContext(null)

const ICONS = {
  success: { icon: CheckCircle2, className: 'text-success-700' },
  error: { icon: XCircle, className: 'text-danger-700' },
  warning: { icon: AlertTriangle, className: 'text-warning-700' },
  info: { icon: Info, className: 'text-brand-400' },
}

let toastSeq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (message, { type = 'info', duration = 4000, title } = {}) => {
      const id = `toast-${++toastSeq}`
      setToasts((current) => [...current.slice(-3), { id, message, type, title }])
      if (duration) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
      return id
    },
    [dismiss],
  )

  const toast = useMemo(
    () => ({
      show: push,
      success: (message, options) => push(message, { ...options, type: 'success' }),
      error: (message, options) => push(message, { ...options, type: 'error' }),
      warning: (message, options) => push(message, { ...options, type: 'warning' }),
      info: (message, options) => push(message, { ...options, type: 'info' }),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
        role="status"
        aria-live="polite"
      >
        {toasts.map((item) => {
          const { icon: Icon, className } = ICONS[item.type] ?? ICONS.info
          return (
            <div
              key={item.id}
              className="anim-slide-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-raised"
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${className}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {item.title ? (
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                ) : null}
                <p className="text-sm text-muted">{item.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-md p-1 text-muted transition hover:bg-canvas hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}

export default ToastContext
