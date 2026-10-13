import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useBodyScrollLock } from '../../hooks/useUi'

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

/**
 * Accessible dialog: portal rendered, Escape closes, focus moves into the
 * panel, background scroll is locked and the backdrop dims the page.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  hideCloseButton = false,
}) {
  const panelRef = useRef(null)
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    const previousFocus = document.activeElement
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="anim-fade-in fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-black/65 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`anim-pop-in relative w-full ${SIZES[size] ?? SIZES.md} max-h-[92vh] overflow-hidden rounded-t-[14px] border border-line bg-surface shadow-modal outline-none sm:rounded-[14px]`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            {description ? (
              <p className="mt-1 truncate text-[13px] text-muted">{description}</p>
            ) : null}
          </div>
          {!hideCloseButton ? (
            <button
              type="button"
              onClick={onClose}
              className="-mr-1.5 rounded-[7px] p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
              aria-label="Close dialog"
            >
              <X size={17} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {children ? <div className="max-h-[65vh] overflow-y-auto px-4 py-4 sm:px-5">{children}</div> : null}

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/70 px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export default Modal
