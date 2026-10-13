import { formatCompactCurrency, formatCurrency } from '../../utils/format'

const TONES = {
  ink: 'text-ink',
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger: 'text-danger-700',
}

/**
 * Compact statistic strip — one bordered panel divided into cells,
 * deliberately free of oversized colourful cards.
 */
export function OverviewStats({ stats }) {
  const cells = [
    { label: 'Total Products', value: stats.total, tone: 'ink', caption: 'in your account' },
    { label: 'Protected', value: stats.active, tone: 'success', caption: 'warranty active' },
    { label: 'Expiring Soon', value: stats.expiring, tone: 'warning', caption: 'within 30 days' },
    { label: 'Expired', value: stats.expired, tone: 'danger', caption: 'coverage ended' },
  ]

  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-line">
      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="bg-surface px-4 py-4 sm:px-5">
            <p className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">
              {cell.label}
            </p>
            <p className={`mt-1.5 text-[24px] font-semibold leading-none tracking-tight ${TONES[cell.tone]}`}>
              {cell.value}
            </p>
            <p className="mt-1.5 text-[12px] text-muted">{cell.caption}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2/70 px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] text-muted">
          Total purchase value{' '}
          <span className="font-medium text-ink-soft">{formatCurrency(stats.totalValue)}</span>
        </p>
        <p className="text-[12.5px] text-muted">
          {stats.withBill} of {stats.total} bills stored ·{' '}
          {formatCompactCurrency(stats.totalValue)} tracked
        </p>
      </div>
    </div>
  )
}

export default OverviewStats
