/** Display formatters used across the UI. */

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return currencyFormatter.format(Number(value))
}

/** Drops a trailing ".0" so values read as ₹30K, not ₹30.0K. */
function trimUnit(value) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/**
 * Indian compact currency: ₹950, ₹30K, ₹3L, ₹1.2Cr.
 *
 * Built explicitly instead of using Intl's compact notation, because en-IN
 * compact renders thousands as "T" (30,000 → ₹30T), which reads like trillions
 * to anyone outside that locale dataset.
 */
export function formatCompactCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'

  const amount = Number(value)
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''

  if (abs >= 1e7) return `${sign}₹${trimUnit(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${sign}₹${trimUnit(abs / 1e5)}L`
  if (abs >= 1e3) return `${sign}₹${trimUnit(abs / 1e3)}K`
  return `${sign}₹${Math.round(abs)}`
}

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${Math.abs(count) === 1 ? singular : plural}`
}

export function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function formatDuration(months) {
  if (!months) return '—'
  if (months < 12) return pluralize(months, 'Month')
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  const yearsLabel = pluralize(years, 'Year')
  if (remainingMonths === 0) return yearsLabel
  return `${yearsLabel} ${pluralize(remainingMonths, 'Month')}`
}
