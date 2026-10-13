import { addMonths, daysUntil, parseDate } from './dates'
import { EXPIRING_SOON_DAYS, STATUS } from './constants'
import { pluralize } from './format'

/** The calendar date on which the warranty ends. */
export function getWarrantyExpiryDate(product) {
  return addMonths(product.purchaseDate, product.warrantyMonths)
}

export function getWarrantyStartDate(product) {
  return parseDate(product.purchaseDate)
}

/**
 * Derives warranty status from dates instead of hardcoding it.
 * Returns everything the UI needs to render a warranty at a glance.
 */
export function getWarrantyInfo(product) {
  const expiryDate = getWarrantyExpiryDate(product)
  const daysRemaining = daysUntil(expiryDate)

  let status = STATUS.ACTIVE
  if (daysRemaining < 0) status = STATUS.EXPIRED
  else if (daysRemaining <= EXPIRING_SOON_DAYS) status = STATUS.EXPIRING_SOON

  return {
    status,
    expiryDate,
    daysRemaining,
    hasBill: Boolean(product.bill),
    dayLabel: formatDayLabel(daysRemaining),
  }
}

/** "182 days remaining" | "Expires in 12 days" | "Expires today" | "Expired 34 days ago" */
export function formatDayLabel(daysRemaining) {
  if (daysRemaining < 0) {
    return `Expired ${pluralize(Math.abs(daysRemaining), 'day')} ago`
  }
  if (daysRemaining === 0) return 'Expires today'
  if (daysRemaining <= EXPIRING_SOON_DAYS) return `Expires in ${pluralize(daysRemaining, 'day')}`
  return `${pluralize(daysRemaining, 'day')} remaining`
}

/** Visual treatment shared by every status badge / status dot in the app. */
export const STATUS_META = {
  [STATUS.ACTIVE]: {
    label: 'Active',
    badgeClass: 'bg-success-500/12 text-success-700 ring-success-500/25',
    dotClass: 'bg-success-500',
    textClass: 'text-success-700',
  },
  [STATUS.EXPIRING_SOON]: {
    label: 'Expiring Soon',
    badgeClass: 'bg-warning-500/12 text-warning-700 ring-warning-500/30',
    dotClass: 'bg-warning-500',
    textClass: 'text-warning-700',
  },
  [STATUS.EXPIRED]: {
    label: 'Expired',
    badgeClass: 'bg-danger-500/12 text-danger-700 ring-danger-500/30',
    dotClass: 'bg-danger-500',
    textClass: 'text-danger-700',
  },
}

export function getStatusMeta(status) {
  return STATUS_META[status] ?? STATUS_META[STATUS.ACTIVE]
}
