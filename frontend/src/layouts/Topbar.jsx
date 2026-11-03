import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, LogOut, Menu, Settings, User } from 'lucide-react'

import { Dropdown, DropdownItem, DropdownSeparator } from '../components/ui'
import NotificationMenu from '../components/notifications/NotificationMenu'
import { LogoMark } from './Logo'
import LiveIndicator from './LiveIndicator'
import { NAV_ITEMS, getPageMeta, getProductIdFromPath } from '../utils/navigation'
import { useAuth } from '../context/AuthContext'
import { useProductStore } from '../context/ProductStore'
import { getInitials } from '../utils/format'

export function Topbar({ onOpenMenu }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { getProduct } = useProductStore()

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
          <LiveIndicator />

          <NotificationMenu />

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
