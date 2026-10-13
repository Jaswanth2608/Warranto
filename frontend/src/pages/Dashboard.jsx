import { Link } from 'react-router-dom'
import { Package, Plus, ShieldCheck } from 'lucide-react'

import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  ProductCardSkeleton,
  ListSkeleton,
  buttonClasses,
} from '../components/ui'
import OverviewStats from '../components/dashboard/OverviewStats'
import ExpiringTable from '../components/dashboard/ExpiringTable'
import RecentPurchases from '../components/dashboard/RecentPurchases'
import WarrantyTimeline from '../components/dashboard/TimelineList'

import { useAuth } from '../context/AuthContext'
import { useProductStore } from '../context/ProductStore'
import { useDeleteProduct } from '../hooks/useDeleteProduct'
import { useDocumentTitle } from '../hooks/useUi'
import { getRecentlyAdded, getUpcomingExpirations, getWarrantyStats } from '../utils/selectors'

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="skeleton block h-7 w-56" />
          <span className="skeleton mt-2.5 block h-4 w-44" />
        </div>
        <span className="skeleton block h-9 w-32" />
      </div>
      <span className="skeleton block h-28 w-full rounded-[12px]" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ListSkeleton rows={5} columns={4} />
        </div>
        <span className="skeleton block h-64 rounded-[12px]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </div>
  )
}

export function Dashboard() {
  useDocumentTitle('Overview')
  const { user } = useAuth()
  const { products, loading, error, retry } = useProductStore()
  const { dialog } = useDeleteProduct()

  if (loading) return <DashboardSkeleton />
  if (error) return <ErrorState onRetry={retry} />

  if (products.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No products yet"
        description="Start by adding your first purchase to begin tracking its warranty."
        action={
          <Link to="/products/new" className={buttonClasses({ icon: Plus })}>
            Add Product
          </Link>
        }
      />
    )
  }

  const stats = getWarrantyStats(products)
  const expiring = getUpcomingExpirations(products).filter(
    ({ info }) => info.daysRemaining >= 0 && info.daysRemaining <= 60,
  )
  const recent = getRecentlyAdded(products)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (user?.fullName ?? 'there').split(' ')[0]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-[13.5px] text-muted">Your warranty overview</p>
        </div>
        <Link
          to="/products/new"
          className={buttonClasses({ icon: Plus, className: 'self-start sm:self-auto' })}
        >
          Add Product
        </Link>
      </div>

      <OverviewStats stats={stats} />

      <Card className="overflow-hidden">
        <CardHeader
          title="Warranty expiring soon"
          description="Nearest deadlines, in order of urgency"
          action={
            <Link
              to="/expiring-soon"
              className="text-[12.5px] font-medium text-brand-400 transition hover:text-brand-300"
            >
              View all
            </Link>
          }
        />
        <ExpiringTable items={expiring} maxRows={6} />
        {expiring.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              icon={ShieldCheck}
              title="Nothing expiring soon"
              description="Every warranty you own still has plenty of coverage left."
            />
          </div>
        ) : null}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Recent purchases"
            description="The latest records in your account"
            action={
              <Link
                to="/products"
                className="text-[12.5px] font-medium text-brand-400 transition hover:text-brand-300"
              >
                View all
              </Link>
            }
          />
          <RecentPurchases products={recent} maxRows={6} />
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Warranty timeline" description="Upcoming expirations, chronologically" />
          <div className="p-4 sm:p-5">
            <WarrantyTimeline products={products} maxItems={6} />
          </div>
        </Card>
      </div>

      {dialog}
    </div>
  )
}

export default Dashboard
