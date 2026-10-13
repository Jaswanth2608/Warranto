import { Link } from 'react-router-dom'

import { formatDate } from '../../utils/dates'
import { getWarrantyInfo } from '../../utils/warranty'

const TONE = {
  active: 'bg-success-500',
  expiring: 'bg-warning-500',
  expired: 'bg-danger-500',
}

/**
 * Upcoming expirations in chronological order — a quiet vertical timeline
 * so deadlines can be read top to bottom.
 */
export function WarrantyTimeline({ products, maxItems = 6 }) {
  const items = products
    .map((product) => ({ product, info: getWarrantyInfo(product) }))
    .filter(({ info }) => info.daysRemaining >= 0)
    .sort((a, b) => a.info.daysRemaining - b.info.daysRemaining)
    .slice(0, maxItems)

  if (items.length === 0) return null

  return (
    <ol className="relative space-y-4 pl-1">
      <span className="absolute left-[7px] top-2 h-[calc(100%-16px)] w-px bg-line" aria-hidden="true" />
      {items.map(({ product, info }) => (
        <li key={product.id} className="relative flex items-start gap-4">
          <span
            className={`relative z-10 mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full ring-4 ring-surface ${TONE[info.status]}`}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Link
                to={`/products/${product.id}`}
                className="truncate text-[13.5px] font-medium text-ink transition hover:text-brand-400"
              >
                {product.name}
              </Link>
              <span className="whitespace-nowrap text-[12.5px] text-muted">
                {formatDate(info.expiryDate)}
              </span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {product.brand} ·{' '}
              <span
                className={
                  info.status === 'expiring' ? 'text-warning-700' : 'text-ink-soft'
                }
              >
                {info.dayLabel}
              </span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export default WarrantyTimeline
