import { cloneElement, useEffect, useState } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'

/**
 * Contextual menu. The trigger receives the open state automatically, so any
 * element (button, icon button) can be used as the trigger.
 */
export function Dropdown({ trigger, children, align = 'end', width = 'w-52' }) {
  const [open, setOpen] = useState(false)
  const containerRef = useClickOutside(() => setOpen(false), open)

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const triggerElement = cloneElement(trigger, {
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    onClick: (event) => {
      trigger.props.onClick?.(event)
      setOpen((value) => !value)
    },
  })

  return (
    <div className="relative" ref={containerRef}>
      {triggerElement}
      {open ? (
        <div
          role="menu"
          className={`anim-pop-in absolute z-40 mt-1.5 ${width} overflow-hidden rounded-[10px] border border-line bg-surface-2 p-1 shadow-raised ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

const ITEM_CLASS =
  'flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-left text-[13px] text-ink-soft transition hover:bg-line/70 hover:text-ink focus-visible:bg-line/70'

export function DropdownItem({ icon: Icon, children, danger = false, ...props }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`${ITEM_CLASS} ${danger ? 'text-danger-700 hover:bg-danger-500/12 hover:text-danger-700' : ''}`}
      {...props}
    >
      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-line" role="separator" />
}

export function DropdownLabel({ children }) {
  return (
    <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
      {children}
    </p>
  )
}

export default Dropdown
