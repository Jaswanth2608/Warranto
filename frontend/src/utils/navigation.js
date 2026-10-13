import { Calendar, Clock, FileText, LayoutDashboard, Package, Settings, User } from 'lucide-react'

/** Primary navigation, grouped the way the product is organised. */
export const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { to: '/products', label: 'My Products', icon: Package },
      { to: '/products/scan', label: 'Scan Bill', icon: FileText },
      { to: '/calendar', label: 'Calendar', icon: Calendar },
      { to: '/expiring-soon', label: 'Expiring Soon', icon: Clock, highlight: true },
      { to: '/bills', label: 'Bills', icon: FileText },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/profile', label: 'Profile', icon: User },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

/** Flat list used by the mobile drawer and header logic. */
export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items)

/** Resolves the header title / breadcrumb for a given path. */
export function getPageMeta(pathname) {
  if (pathname === '/dashboard') return { title: 'Overview', parent: null }
  if (pathname === '/products') return { title: 'My Products', parent: null }
  if (pathname === '/calendar') return { title: 'Calendar', parent: null }
  if (pathname === '/products/new') {
    return { title: 'Add Product', parent: { label: 'My Products', to: '/products' } }
  }
  if (/^\/products\/[^/]+\/edit$/.test(pathname)) {
    return { title: 'Edit Product', parent: { label: 'My Products', to: '/products' } }
  }
  if (/^\/products\/[^/]+$/.test(pathname)) {
    return { title: 'Product Details', parent: { label: 'My Products', to: '/products' } }
  }
  if (pathname === '/expiring-soon') return { title: 'Expiring Soon', parent: null }
  if (pathname === '/bills') return { title: 'Bills', parent: null }
  if (pathname === '/products/scan') return { title: 'Scan Bill', parent: { label: 'My Products', to: '/products' } }
  if (pathname === '/profile') return {
    title: 'Profile',
    parent: { label: 'Overview', to: '/dashboard' },
  }
  if (pathname === '/settings') return { title: 'Settings', parent: null }
  return { title: 'Warranto', parent: null }
}

/** Extracts the product id from a product route, if the path matches one. */
export function getProductIdFromPath(pathname) {
  const match = pathname.match(/^\/products\/([^/]+)(\/edit)?$/)
  return match ? match[1] : null
}
