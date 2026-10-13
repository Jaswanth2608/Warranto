import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Flag } from 'lucide-react'

import { formatDate, daysBetween, startOfDay } from '../../utils/dates'
import { formatDuration } from '../../utils/format'
import { getWarrantyInfo } from '../../utils/warranty'

/**
 * Purchase → Warranty period → Today → Expiry.
 * Shows how much of the warranty is already used and what is left.
 */
export function WarrantyTimeline({ product }) {
  const info = getWarrantyInfo(product)
  const start = startOfDay(product.purchaseDate)
  const expiry = startOfDay(info.expiryDate)
  const today = startOfDay(new Date())

  const totalDays = Math.max(daysBetween(start, expiry), 1)
  const elapsedDays = Math.min(Math.max(daysBetween(start, today), 0), totalDays)
  const remainingDays = Math.max(info.daysRemaining, 0)
  const progress = Math.round((elapsedDays / totalDays) * 100)

  const steps = [
    {
      key: 'purchase',
      icon: CheckCircle2,
      iconClass: 'bg-success-50 text-success-700 ring-success-500/20',
      title: 'Purchase',
      value: formatDate(product.purchaseDate),
      note: `Bought from ${product.seller || 'seller not recorded'}`,
    },
    {
      key: 'period',
      icon: Clock,
      iconClass: 'bg-brand-50 text-brand-400 ring-brand-500/20',
      title: 'Warranty period',
      value: formatDuration(product.warrantyMonths),
      note: product.warrantyType || 'Manufacturer warranty',
    },
    {
      key: 'today',
      icon: CalendarDays,
      iconClass: 'bg-surface-2 text-muted ring-line',
      title: 'Today',
      value: formatDate(new Date()),
      note:
        info.daysRemaining < 0
          ? 'Warranty has ended'
          : `${info.daysRemaining} of ${totalDays} days left`,
    },
    {
      key: 'expiry',
      icon: info.daysRemaining < 0 ? AlertTriangle : Flag,
      iconClass:
        info.status === 'expired'
          ? 'bg-danger-50 text-danger-700 ring-danger-500/20'
          : info.status === 'expiring'
            ? 'bg-warning-50 text-warning-700 ring-warning-500/20'
            : 'bg-warning-50 text-warning-700 ring-warning-500/20',
      title: 'Expiry',
      value: formatDate(info.expiryDate),
      note: info.dayLabel,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="font-medium text-ink-soft">{progress}% of warranty used</span>
          <span className="text-muted">
            {info.daysRemaining < 0
              ? 'Coverage ended'
              : `${remainingDays} ${remainingDays === 1 ? 'day' : 'days'} remaining`}
          </span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-canvas ring-1 ring-line">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ${
              info.status === 'expired'
                ? 'bg-danger-500'
                : info.status === 'expiring'
                  ? 'bg-warning-500'
                  : 'bg-brand-500'
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Warranty elapsed"
          />
        </div>
      </div>

      <ol className="relative space-y-5">
        <span
          className="absolute left-[17px] top-3 h-[calc(100%-24px)] w-px bg-line"
          aria-hidden="true"
        />
        {steps.map((step) => {
          const Icon = step.icon
          const isToday = step.key === 'today'
          return (
            <li key={step.key} className="relative flex items-start gap-4">
              <span
                className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ${
                  step.iconClass
                } ${isToday ? 'shadow-[0_0_0_4px_rgba(79,70,229,0.08)]' : ''}`}
              >
                <Icon size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">
                    {step.title}
                  </p>
                  {isToday ? (
                    <span className="rounded-md bg-brand-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-brand-400 ring-1 ring-inset ring-brand-500/20">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[15px] font-semibold text-ink">{step.value}</p>
                <p className="mt-0.5 text-[13px] text-muted">{step.note}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default WarrantyTimeline
