import { FileText, FileX } from 'lucide-react'

import { products as mockProducts } from '../../data/products'
import { getWarrantyInfo, STATUS_META } from '../../utils/warranty'
import { STATUS, CATEGORY_LABELS } from '../../utils/constants'
import { formatDate } from '../../utils/dates'

/** One active, one expiring and one expired record — a realistic status list. */
function showcaseRows() {
  const withInfo = mockProducts.map((product) => ({ product, info: getWarrantyInfo(product) }))
  const pick = (status) => withInfo.find((entry) => entry.info.status === status)
  return [pick(STATUS.ACTIVE), pick(STATUS.EXPIRING_SOON), pick(STATUS.EXPIRED)].filter(Boolean)
}

/** Section 2 — the real product list UI, showing what ownership looks like. */
export function StatusShowcase() {
  const rows = showcaseRows()

  return (
    <section className="border-b border-line bg-surface py-16 lg:py-20">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
          <div>
            <p className="text-brand-400 font-medium uppercase tracking-[0.16em] text-[11.5px]">
              Status at a glance
            </p>
            <h2 className="mt-4 text-ink text-[26px] font-semibold tracking-tight sm:text-[28px]">
              Know the status of everything you own.
            </h2>
            <p className="mt-3 text-muted text-[15px] leading-relaxed">
              Every product carries its purchase date, bill and warranty state. Open the list and
              the answer is already there — active, expiring soon, or expired.
            </p>
            <dl className="mt-7 grid max-w-sm grid-cols-3 gap-4 border-t border-line pt-6">
              <div>
                <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Active</dt>
                <dd className="mt-1 h-1 rounded-full bg-success-500" />
              </div>
              <div>
                <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Expiring</dt>
                <dd className="mt-1 h-1 rounded-full bg-warning-500" />
              </div>
              <div>
                <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Expired</dt>
                <dd className="mt-1 h-1 rounded-full bg-danger-500" />
              </div>
            </dl>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-line bg-canvas">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[13px] font-medium text-ink">My Products</p>
              <p className="text-[11.5px] text-muted">{mockProducts.length} records</p>
            </div>

            <ul className="divide-y divide-line">
              {rows.map(({ product, info }) => {
                const meta = STATUS_META[info.status]
                return (
                  <li key={product.id} className="flex items-center gap-4 px-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{product.name}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-muted">
                        {CATEGORY_LABELS[product.category]}
                      </p>
                    </div>

                    <span className={`hidden text-[12.5px] font-medium sm:block ${meta.textClass}`}>
                      {meta.label}
                    </span>

                    <span className="hidden w-[110px] text-right text-[12.5px] text-muted md:block">
                      {info.status === STATUS.EXPIRED ? 'Expired' : 'Expires'}{' '}
                      {formatDate(info.expiryDate)}
                    </span>

                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] ${
                        product.bill
                          ? 'bg-success-500/12 text-success-700 ring-1 ring-inset ring-success-500/25'
                          : 'bg-surface-2 text-muted/70 ring-1 ring-inset ring-line'
                      }`}
                      title={product.bill ? 'Bill available' : 'No bill'}
                    >
                      {product.bill ? (
                        <FileText size={14} aria-hidden="true" />
                      ) : (
                        <FileX size={14} aria-hidden="true" />
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="border-t border-line bg-surface-2/70 px-4 py-3 text-[12px] text-muted">
              Status is calculated from the purchase date and warranty duration — never entered by
              hand.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default StatusShowcase
