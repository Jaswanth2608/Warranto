import { getStatusMeta } from '../../utils/warranty'

/** Compact, quiet status pill — no oversized colourful badges. */
const BASE =
  'inline-flex items-center gap-1.5 rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.05em] whitespace-nowrap ring-1 ring-inset'

const VARIANTS = {
  neutral: 'bg-surface-2 text-muted ring-line',
  brand: 'bg-brand-500/12 text-brand-400 ring-brand-500/25',
  success: 'bg-success-500/12 text-success-700 ring-success-500/25',
  warning: 'bg-warning-500/12 text-warning-700 ring-warning-500/30',
  danger: 'bg-danger-500/12 text-danger-700 ring-danger-500/30',
}

export function Badge({ variant = 'neutral', className = '', children }) {
  return (
    <span className={`${BASE} ${VARIANTS[variant] ?? VARIANTS.neutral} ${className}`}>{children}</span>
  )
}

/** The single source of truth for warranty status presentation. */
export function StatusBadge({ status, showDot = true, className = '' }) {
  const meta = getStatusMeta(status)
  return (
    <span className={`${BASE} ${meta.badgeClass} ${className}`}>
      {showDot ? (
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} aria-hidden="true" />
      ) : null}
      {meta.label}
    </span>
  )
}

export default Badge
