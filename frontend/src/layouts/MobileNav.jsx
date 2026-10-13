import { NavLink } from 'react-router-dom'
import { LogOut, Settings, User, X } from 'lucide-react'

import Logo from './Logo'
import { NAV_GROUPS } from '../utils/navigation'
import { useProductStore } from '../context/ProductStore'
import { useAuth } from '../context/AuthContext'
import { getInitials } from '../utils/format'
import { getWarrantyInfo } from '../utils/warranty'
import { STATUS } from '../utils/constants'
import { useBodyScrollLock } from '../hooks/useUi'

/**
 * Mobile navigation: a clean slide-in drawer with its own layout —
 * the desktop sidebar is never squeezed into small screens.
 */
export function MobileNav({ open, onClose }) {
  const { products } = useProductStore()
  const { user, logout } = useAuth()
  useBodyScrollLock(open)

  const expiringCount = products.filter(
    (product) => getWarrantyInfo(product).status === STATUS.EXPIRING_SOON,
  ).length

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="anim-fade-in absolute inset-0 bg-black/65" onClick={onClose} />
      <div className="anim-slide-in-right absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-line bg-surface">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="rounded-[7px] p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label="Close menu"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Mobile navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <p className="px-2.5 pb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted/70">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-[8px] px-2.5 py-2.5 text-[14px] transition ${
                          isActive
                            ? 'bg-brand-500/12 font-medium text-brand-400'
                            : 'font-medium text-muted hover:bg-surface-2 hover:text-ink'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon
                            size={17}
                            className={isActive ? 'text-brand-400' : 'text-muted'}
                            aria-hidden="true"
                          />
                          {item.label}
                          {item.highlight && expiringCount > 0 ? (
                            <span className="ml-auto rounded-[5px] bg-warning-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-warning-700 ring-1 ring-inset ring-warning-500/25">
                              {expiringCount}
                            </span>
                          ) : null}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-[10px] bg-surface-2 p-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[12px] font-semibold text-brand-400 ring-1 ring-inset ring-brand-500/25">
              {getInitials(user?.fullName ?? '')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">{user?.fullName}</p>
              <p className="truncate text-[11.5px] text-muted">{user?.email}</p>
            </div>
          </div>
          <div className="mt-1.5 flex gap-1">
            <NavLink
              to="/profile"
              onClick={onClose}
              className="flex flex-1 items-center gap-2 rounded-[7px] px-2 py-2 text-[12.5px] font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <User size={15} aria-hidden="true" />
              Profile
            </NavLink>
            <NavLink
              to="/settings"
              onClick={onClose}
              className="flex flex-1 items-center gap-2 rounded-[7px] px-2 py-2 text-[12.5px] font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <Settings size={15} aria-hidden="true" />
              Settings
            </NavLink>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2 rounded-[7px] px-2 py-2 text-[12.5px] font-medium text-muted transition hover:bg-danger-500/12 hover:text-danger-700"
            >
              <LogOut size={15} aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MobileNav
