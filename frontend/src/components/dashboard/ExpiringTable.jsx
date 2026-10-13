import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { StatusBadge, Table, TableBody, TableHead, TH, TD, TableRow } from '../ui'
import ProductIcon from '../common/ProductIcon'
import { formatDate } from '../../utils/dates'
import { CATEGORY_LABELS } from '../../utils/constants'

/** Warranties ending soonest: product, category, expiry, days remaining, status. */
export function ExpiringTable({ items, maxRows = 6 }) {
  const rows = items.slice(0, maxRows)
  if (rows.length === 0) return null

  return (
    <Table minWidth="min-w-[620px]">
      <TableHead>
        <TH>Product</TH>
        <TH className="hidden sm:table-cell">Category</TH>
        <TH>Expiry date</TH>
        <TH>Days remaining</TH>
        <TH>Status</TH>
        <TH className="text-right">Action</TH>
      </TableHead>
      <TableBody>
        {rows.map(({ product, info }) => (
          <TableRow key={product.id}>
            <TD>
              <div className="flex items-center gap-3">
                <ProductIcon product={product} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-ink">{product.name}</p>
                  <p className="truncate text-[12px] text-muted sm:hidden">
                    {CATEGORY_LABELS[product.category]}
                  </p>
                </div>
              </div>
            </TD>
            <TD className="hidden text-muted sm:table-cell">
              {CATEGORY_LABELS[product.category]}
            </TD>
            <TD className="whitespace-nowrap">{formatDate(info.expiryDate)}</TD>
            <TD
              className={`whitespace-nowrap font-medium ${
                info.status === 'expired'
                  ? 'text-danger-700'
                  : info.status === 'expiring'
                    ? 'text-warning-700'
                    : 'text-ink-soft'
              }`}
            >
              {info.dayLabel}
            </TD>
            <TD>
              <StatusBadge status={info.status} />
            </TD>
            <TD className="text-right">
              <Link
                to={`/products/${product.id}`}
                className="inline-flex h-7 items-center gap-1 rounded-[7px] border border-line bg-surface-2 px-2.5 text-[12.5px] font-medium text-ink-soft transition hover:bg-line/80 hover:text-ink"
              >
                View
                <ChevronRight size={12} aria-hidden="true" />
              </Link>
            </TD>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default ExpiringTable
