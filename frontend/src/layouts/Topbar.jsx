import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, ChevronRight, LogOut, Menu, Settings, User } from 'lucide-react'

import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '../components/ui'
import { LogoMark } from './Logo'
import { NAV_ITEMS, getPageMeta, getProductIdFromPath } from '../utils/navigation'
import { notifications as initialNotifications } from '../data/notifications'
import { useAuth } from '../context/AuthContext'
import { useProductStore } from '../context/ProductStore'
import { daysBetween, parseDate } from '../utils/dates'
import { getInitials } from '../utils/format'

function relativeTime(dateValue) {
  const days = Math.abs(daysBetween(new Date(), parseDate(dateValue)))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function Topbar({ onOpenMenu }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { getProduct } = useProductStore()

  const [items, setItems] = useState(initialNotifications)
  const unreadCount = items.filter((item) => !item.read).length

  const meta = getPageMeta(location.pathname)
  const productId = getProductIdFromPath(location.pathname)
  const product = productId ? getProduct(productId) : null

  const title = useMemo(() => {
    if (product && meta.title === 'Product Details') return product.name
    if (product && meta.title === 'Edit Product') return `Edit ${product.name}`
    return meta.title
  }, [product, meta.title])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          className="-ml-1 rounded-[7px] p-2 text-ink-soft transition hover:bg-surface-2 lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu size={18} aria-hidden="true" />
        </button>

        {/* The sidebar (and its lockup) is hidden below lg — keep the brand
            visible in the header on those widths. */}
        <Link to="/dashboard" className="lg:hidden" aria-label="Warranto dashboard">
          <LogoMark size="xs" />
        </Link>

        <nav className="min-w-0 flex-1" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 text-[13.5px]">
            {meta.parent ? (
              <>
                <li>
                  <Link to={meta.parent.to} className="text-muted transition hover:text-brand-400">
                    {meta.parent.label}
                  </Link>
                </li>
                <li aria-hidden="true" className="text-muted/60">
                  <ChevronRight size={13} />
                </li>
              </>
            ) : null}
            <li
              className="truncate font-medium text-ink"
              aria-current={meta.parent ? undefined : 'page'}
            >
              {title}
            </li>
          </ol>
        </nav>

        <div className="flex items-center gap-1">
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
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-500 ring-2 ring-canvas">
                    <span className="sr-only">{unreadCount} unread notifications</span>
                  </span>
                ) : null}
              </button>
            }
          >
            <div className="flex items-center justify-between px-2.5 py-2">
              <p className="text-[13px] font-semibold text-ink">Notifications</p>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setItems((current) => current.map((item) => ({ ...item, read: true })))
                  }
                  className="text-[12.5px] font-medium text-brand-400 hover:text-brand-300"
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <DropdownSeparator />
            <ul className="max-h-[340px] overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((current) =>
                        current.map((entry) =>
                          entry.id === item.id ? { ...entry, read: true } : entry,
                        ),
                      )
                    }
                    className={`flex w-full gap-3 rounded-[7px] px-2.5 py-2.5 text-left transition hover:bg-line/60 ${
                      item.read ? '' : 'bg-brand-500/8'
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        item.read ? 'bg-line-strong' : 'bg-brand-500'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium leading-snug text-ink">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                        {item.description}
                      </span>
                      <span className="mt-1 block text-[11.5px] text-muted/70">
                        {relativeTime(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <DropdownSeparator />
            <DropdownLabel>Email reminders are enabled in Settings</DropdownLabel>
          </Dropdown>

          <Dropdown
            width="w-60"
            trigger={
              <button
                type="button"
                className="flex items-center gap-2 rounded-[7px] py-1 pl-1 pr-1.5 transition hover:bg-surface-2"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/15 text-[11.5px] font-semibold text-brand-400 ring-1 ring-inset ring-brand-500/25">
                  {getInitials(user?.fullName ?? '')}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[160px] truncate text-[13px] font-medium leading-tight text-ink">
                    {user?.fullName}
                  </span>
                  <span className="block max-w-[160px] truncate text-[11px] leading-tight text-muted">
                    {user?.email}
                  </span>
                </span>
                <ChevronDown size={14} className="hidden text-muted sm:block" aria-hidden="true" />
              </button>
            }
          >
            <div className="px-2.5 py-2">
              <p className="truncate text-[13px] font-semibold text-ink">{user?.fullName}</p>
              <p className="truncate text-[12px] text-muted">{user?.email}</p>
            </div>
            <DropdownSeparator />
            <DropdownItem icon={User} onClick={() => navigate('/profile')}>
              Profile
            </DropdownItem>
            <DropdownItem icon={Settings} onClick={() => navigate('/settings')}>
              Settings
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={LogOut} danger onClick={handleLogout}>
              Log out
            </DropdownItem>
          </Dropdown>
        </div>
      </div>
      <span className="sr-only">
        {NAV_ITEMS.length} navigation destinations available in the main menu
      </span>
    </header>
  )
}

export default Topbar
