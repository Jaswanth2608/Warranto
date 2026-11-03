import { Suspense, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileNav from './MobileNav'
import CommandPalette from '../components/common/CommandPalette'

/**
 * Shown while a route's code chunk downloads. The shell (sidebar, header and
 * live status) stays painted, so switching screens never flashes a blank page.
 */
function RouteFallback() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only">Loading page</span>
      <div>
        <span className="skeleton block h-7 w-48" />
        <span className="skeleton mt-2.5 block h-4 w-72" />
      </div>
      <span className="skeleton block h-28 w-full rounded-[12px]" />
      <span className="skeleton block h-64 w-full rounded-[12px]" />
    </div>
  )
}

/** Desktop sidebar + sticky header + responsive content canvas. */
export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line lg:block">
        <Sidebar />
      </aside>

      <div className="lg:pl-64">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />

        <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<RouteFallback />}>
            <div key={location.pathname} className="anim-fade-in">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>

      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
      <CommandPalette />
    </div>
  )
}

export default AppLayout
