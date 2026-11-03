import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ReceiptText, ShieldAlert, ShieldX, Sparkles } from 'lucide-react'

import { Dropdown, DropdownSeparator } from '../ui'
import { useProductStore } from '../../context/ProductStore'
import { useAuth } from '../../context/AuthContext'
import { useToday } from '../../hooks/useClock'
import { daysBetween, toISODate } from '../../utils/dates'
import { buildNotifications, summarizeNotifications } from '../../utils/notifications'

/**
 * Notification menu backed by real records.
 *
 * Items are derived from the product catalogue (see utils/notifications.js), so
 * the badge can never show a notification about a product that no longer
 * exists. Read state lives in localStorage per account; ids are pruned on every
 * write so the list cannot grow without bound.
 */

const READ_KEY_PREFIX = 'warranto.notifications.read'

const TYPE_STYLES = {
  expiry: { icon: ShieldAlert, className: 'bg-warning-500/12 text-warning-700' },
  expired: { icon: ShieldX, className: 'bg-danger-500/12 text-danger-700' },
  bill: { icon: ReceiptText, className: 'bg-brand-500/12 text-brand-400' },
}

function readStoredIds(key) {
  if (!key) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function relativeTime(dateValue, today) {
  if (!dateValue) return ''
  const days = daysBetween(dateValue, today)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function NotificationMenu() {
  const navigate = useNavigate()
  const { products } = useProductStore()
  const { user } = useAuth()
  const today = useToday()

  const storageKey = user?.id ? `${READ_KEY_PREFIX}:${user.id}` : null

  const items = useMemo(() => buildNotifications(products, { today }), [products, today])

  const [readIds, setReadIds] = useState(() => new Set(readStoredIds(storageKey)))

  // Re-read when the account changes so one user's read state never leaks.
  useEffect(() => {
    setReadIds(new Set(readStoredIds(storageKey)))
  }, [storageKey])

  // Persist, dropping ids for notifications that no longer apply.
  useEffect(() => {
    if (!storageKey) return
    const live = new Set(items.map((item) => item.id))
    const kept = [...readIds].filter((id) => live.has(id))
    try {
      localStorage.setItem(storageKey, JSON.stringify(kept))
    } catch {
      // Storage full or blocked — read state is a convenience, never required.
    }
  }, [readIds, items, storageKey])

  const unreadCount = items.filter((item) => !readIds.has(item.id)).length

  const markRead = useCallback((id) => {
    setReadIds((current) => {
      if (current.has(id)) return current
      const next = new Set(current)
      next.add(id)
      return next
    })
  }, [])

  const markAllRead = useCallback(() => {
    setReadIds((current) => {
      const next = new Set(current)
      for (const item of items) next.add(item.id)
      return next
    })
  }, [items])

  const openItem = (item) => {
    markRead(item.id)
    if (item.to) navigate(item.to)
  }

  return (
    <Dropdown
      width="w-[320px] sm:w-96"
      trigger={
        <button
          type="button"
          className="relative rounded-[7px] p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        >
          <Bell size={17} aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white ring-2 ring-canvas">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </button>
      }
    >
      <div className="flex items-center justify-between px-2.5 py-2">
        <div>
          <p className="text-[13px] font-semibold text-ink">Notifications</p>
          <p className="text-[11.5px] text-muted">
            {items.length ? `${items.length} live from your records` : 'Derived from your records'}
          </p>
        </div>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-400 hover:text-brand-300"
          >
            <CheckCheck size={13} aria-hidden="true" />
            Mark all read
          </button>
        ) : null}
      </div>

      <DropdownSeparator />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-surface text-success-700 ring-1 ring-line">
            <Sparkles size={16} aria-hidden="true" />
          </span>
          <p className="text-[13px] font-medium text-ink">You are all caught up</p>
          <p className="text-[12.5px] leading-relaxed text-muted">
            Add a product and its warranty milestones will show up here automatically.
          </p>
        </div>
      ) : (
        <ul className="max-h-[340px] overflow-y-auto">
          {items.map((item) => {
            const unread = !readIds.has(item.id)
            const style = TYPE_STYLES[item.type] ?? TYPE_STYLES.bill
            const Icon = style.icon

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className={`flex w-full items-start gap-3 rounded-[7px] px-2.5 py-2.5 text-left transition hover:bg-line/60 ${
                    unread ? 'bg-brand-500/6' : ''
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] ${style.className}`}
                  >
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-ink">
                        {item.title}
                      </span>
                      {unread ? (
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"
                          aria-label="Unread"
                        />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                      {item.description}
                    </span>
                    <span className="mt-1 block text-[11.5px] text-muted/70">
                      {relativeTime(item.createdAt, today)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <DropdownSeparator />
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <p className="text-[11.5px] leading-snug text-muted">
          {summarizeNotifications(items)}
        </p>
        <button
          type="button"
          onClick={() => navigate('/expiring-soon')}
          className="shrink-0 text-[12px] font-medium text-brand-400 hover:text-brand-300"
        >
          Review
        </button>
      </div>
    </Dropdown>
  )
}

export default NotificationMenu
