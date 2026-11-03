import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, FilePlus2, FileSearch, Package, Search } from 'lucide-react'

import { NAV_ITEMS } from '../../utils/navigation'
import { useProductStore } from '../../context/ProductStore'
import { useBodyScrollLock } from '../../hooks/useUi'
import { getStatusMeta, getWarrantyInfo } from '../../utils/warranty'

/**
 * Global command palette (Ctrl/⌘ K).
 *
 * One keyboard-first way to reach any page or product without hunting through
 * the sidebar or the products table. Everything it lists is already loaded
 * (navigation + the product store), so results appear as you type with no
 * network round-trip, and they stay correct when the catalogue changes live.
 */

export const OPEN_COMMAND_PALETTE_EVENT = 'warranto:command-palette'

const MAX_RESULTS = 9

function matches(haystack, query) {
  return String(haystack || '').toLowerCase().includes(query)
}

export function CommandPalette() {
  const navigate = useNavigate()
  const { products } = useProductStore()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useBodyScrollLock(open)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }, [])

  // Ctrl/⌘ K opens from anywhere; Escape closes.
  useEffect(() => {
    const onKeyDown = (event) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (isShortcut) {
        event.preventDefault()
        setOpen((current) => !current)
        return
      }

      if (event.key === 'Escape' && open) {
        event.preventDefault()
        close()
      }
    }

    const onOpenEvent = () => setOpen(true)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent)
    }
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => inputRef.current?.focus(), 10)
    return () => clearTimeout(timer)
  }, [open])

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    const pages = NAV_ITEMS.map((item) => ({
      id: `page:${item.to}`,
      group: 'Pages',
      label: item.label,
      hint: item.to,
      icon: item.icon,
      to: item.to,
    }))

    const actions = [
      {
        id: 'action:add-product',
        group: 'Actions',
        label: 'Add a product',
        hint: 'Record a purchase and its warranty',
        icon: FilePlus2,
        to: '/products/new',
      },
      {
        id: 'action:scan-bill',
        group: 'Actions',
        label: 'Scan a bill',
        hint: 'Read a photo or PDF into a product',
        icon: FileSearch,
        to: '/products/scan',
      },
    ]

    const productItems = products.map((product) => {
      const info = getWarrantyInfo(product)
      const status = getStatusMeta(info.status).label
      return {
        id: `product:${product.id}`,
        group: 'Products',
        label: product.name,
        hint: `${product.brand}${product.brand ? ' · ' : ''}${status}`,
        icon: Package,
        to: `/products/${product.id}`,
      }
    })

    const all = [...actions, ...pages, ...productItems]

    if (!normalized) return all.slice(0, MAX_RESULTS)

    return all
      .filter(
        (item) =>
          matches(item.label, normalized) ||
          matches(item.hint, normalized) ||
          matches(item.group, normalized),
      )
      .slice(0, MAX_RESULTS)
  }, [products, query])

  useEffect(() => {
    setActiveIndex((current) => (current >= items.length ? 0 : current))
  }, [items.length])

  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector('[data-active="true"]')
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  if (!open) return null

  const run = (item) => {
    if (!item) return
    close()
    navigate(item.to)
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (items.length ? (current + 1) % items.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (items.length ? (current - 1 + items.length) % items.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(items[activeIndex])
    }
  }

  let lastGroup = null

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center p-4 pt-[12vh]">
      <div className="anim-fade-in absolute inset-0 bg-black/65 backdrop-blur-[2px]" onClick={close} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Warranto"
        className="anim-pop-in relative w-full max-w-lg overflow-hidden rounded-[12px] border border-line bg-surface shadow-raised"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search pages, products and actions…"
            className="h-12 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
            aria-label="Search pages, products and actions"
            autoComplete="off"
            spellCheck="false"
          />
          <kbd className="hidden shrink-0 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-muted sm:block">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            items.map((item, index) => {
              const showGroup = item.group !== lastGroup
              lastGroup = item.group
              const active = index === activeIndex

              return (
                <div key={item.id}>
                  {showGroup ? (
                    <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted/70">
                      {item.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => run(item)}
                    className={`flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left transition ${
                      active ? 'bg-brand-500/12 text-ink' : 'text-ink-soft hover:bg-surface-2'
                    }`}
                  >
                    <item.icon
                      size={15}
                      className={active ? 'text-brand-400' : 'text-muted'}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{item.label}</span>
                      {item.hint ? (
                        <span className="block truncate text-[11.5px] text-muted">{item.hint}</span>
                      ) : null}
                    </span>
                    {active ? (
                      <CornerDownLeft size={13} className="shrink-0 text-muted" aria-hidden="true" />
                    ) : null}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line bg-surface-2/50 px-3 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-2">
            <kbd className="rounded border border-line bg-surface px-1 py-0.5">↑</kbd>
            <kbd className="rounded border border-line bg-surface px-1 py-0.5">↓</kbd>
            to move
            <kbd className="rounded border border-line bg-surface px-1 py-0.5">↵</kbd>
            to open
          </span>
          <span>{products.length} products indexed</span>
        </div>
      </div>
    </div>
  )
}

export default CommandPalette
