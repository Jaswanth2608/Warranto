import { NavLink } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'

import Logo from './Logo'
import { NAV_GROUPS } from '../utils/navigation'
import { useProductStore } from '../context/ProductStore'
import { useAuth } from '../context/AuthContext'
import { getInitials } from '../utils/format'
import { getWarrantyInfo } from '../utils/warranty'
import { STATUS } from '../utils/constants'

function NavItem({ item, expiringCount, onNavigate }) {
  const badge =
    item.highlight && expiringCount > 0 ? (
      <span className="ml-auto rounded-[5px] bg-warning-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-warning-700 ring-1 ring-inset ring-warning-500/25">
        {expiringCount}
      </span>
    ) : null

  return (
    <li>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) =>
          `group relative flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[13.5px] transition-colors ${
            isActive
              ? 'bg-brand-500/12 font-medium text-brand-400'
              : 'font-medium text-muted hover:bg-surface-2 hover:text-ink'
          }`
        }
      >
        {({ isActive }) => (
          <>
            {isActive ? (
              <span
                className="absolute -left-3 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-brand-500"
                aria-hidden="true"
              />
            ) : null}
            <item.icon
              size={16}
              className={isActive ? 'text-brand-400' : 'text-muted group-hover:text-ink-soft'}
              aria-hidden="true"
            />
            {item.label}
            {badge}
          </>
        )}
      </NavLink>
    </li>
  )
}

export function Sidebar({ onNavigate }) {
  const { products } = useProductStore()
  const { user, logout } = useAuth()

  const expiringCount = products.filter(
    (product) => getWarrantyInfo(product).status === STATUS.EXPIRING_SOON,
  ).length

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-14 shrink-0 items-center border-b border-line px-4">
        <Logo to="/dashboard" size="md" label="Warranto dashboard" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p className="px-2.5 pb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted/70">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  item={item}
                  expiringCount={expiringCount}
                  onNavigate={onNavigate}
                />
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
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex flex-1 items-center gap-2 rounded-[7px] px-2 py-1.5 text-[12.5px] font-medium transition ${
                isActive ? 'bg-brand-500/12 text-brand-400' : 'text-muted hover:bg-surface-2 hover:text-ink'
              }`
            }
          >
            <User size={14} aria-hidden="true" />
            Profile
          </NavLink>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-[12.5px] font-medium text-muted transition hover:bg-danger-500/12 hover:text-danger-700"
          >
            <LogOut size={14} aria-hidden="true" />
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
