/** Display formatters used across the UI. */

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const compactCurrencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return currencyFormatter.format(Number(value))
}

export function formatCompactCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return compactCurrencyFormatter.format(Number(value))
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
