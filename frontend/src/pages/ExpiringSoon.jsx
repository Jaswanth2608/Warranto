import { Link } from 'react-router-dom'
import { CalendarDays, Clock, Eye, FileText, FileX, ShieldCheck } from 'lucide-react'

import {
  Card,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  buttonClasses,
} from '../components/ui'
import ProductIcon from '../components/common/ProductIcon'

import { useProductStore } from '../context/ProductStore'
import { useDocumentTitle } from '../hooks/useUi'
import { getExpiringGroups } from '../utils/selectors'
import { formatDate } from '../utils/dates'

function ExpiryItem({ product, info }) {
  return (
    <Card className="flex flex-col gap-4 p-5 transition hover:border-line-strong sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <ProductIcon product={product} />
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink">{product.name}</h3>
          <p className="mt-0.5 truncate text-[13px] text-muted">{product.brand}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <span className="inline-flex items-center gap-1.5 text-muted">
              <CalendarDays size={13} aria-hidden="true" />
              Expires <span className="font-medium text-ink-soft">{formatDate(info.expiryDate)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-warning-50 px-2 py-0.5 font-medium text-warning-700 ring-1 ring-inset ring-warning-500/20">
              <Clock size={13} aria-hidden="true" />
              {info.dayLabel}
            </span>
            {product.bill ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <FileText size={13} aria-hidden="true" />
                Bill available
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <FileX size={13} aria-hidden="true" />
                No bill
              </span>
            )}
          </div>
        </div>
      </div>

      <Link
        to={`/products/${product.id}`}
        className={buttonClasses({ variant: 'secondary', icon: Eye, className: 'shrink-0' })}
      >
        View Product
      </Link>
    </Card>
  )
}

export function ExpiringSoon() {
  useDocumentTitle('Expiring Soon')
  const { products, loading, error, retry } = useProductStore()

  const groups = getExpiringGroups(products)
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <span className="skeleton block h-7 w-52" />
          <span className="skeleton mt-2.5 block h-4 w-72" />
        </div>
        <ListSkeleton rows={5} columns={3} />
      </div>
    )
  }

  if (error) return <ErrorState onRetry={retry} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expiring Soon"
        subtitle="Keep an eye on warranties that need your attention."
      />

      <div className="flex items-start gap-3 rounded-[12px] border border-warning-500/20 bg-warning-500/8 p-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-warning-500/15 text-warning-700">
          <Clock size={15} aria-hidden="true" />
        </span>
        <div>
          <p className="text-[14px] font-semibold text-ink">
            {total === 0
              ? 'Nothing needs attention right now'
              : `${total} ${total === 1 ? 'warranty ends' : 'warranties end'} within the next 60 days`}
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            Keep the bill handy for these products — you can still make a claim while they are
            covered.
          </p>
        </div>
      </div>

      {total === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No warranties expiring soon"
          description="Nothing ends within the next 60 days. Warranto will remind you before anything changes."
          action={
            <Link to="/products" className={buttonClasses({ variant: 'secondary' })}>
              View all products
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section key={group.days} aria-labelledby={`group-${group.days}`}>
                <div className="mb-4 flex items-center gap-2.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      group.days <= 7 ? 'bg-danger-500' : 'bg-warning-500'
                    }`}
                    aria-hidden="true"
                  />
                  <h2 id={`group-${group.days}`} className="text-[16px] font-semibold text-ink">
                    {group.label}
                  </h2>
                  <span className="rounded-md bg-canvas px-2 py-0.5 text-[12px] font-medium text-muted ring-1 ring-line">
                    {group.items.length} {group.items.length === 1 ? 'product' : 'products'}
                  </span>
                </div>

                <div className="grid gap-4">
                  {group.items.map(({ product, info }) => (
                    <ExpiryItem key={product.id} product={product} info={info} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  )
}

export default ExpiringSoon
