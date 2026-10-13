/** Date helpers – all values are handled as local calendar dates. */

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function parseDate(value) {
  if (value instanceof Date) return new Date(value.getTime())
  if (typeof value === 'string') {
    const [year, month, day] = value.split('-').map(Number)
    if (year && month && day) return new Date(year, month - 1, day)
  }
  return new Date(value)
}

export function startOfDay(value = new Date()) {
  const date = parseDate(value)
  date.setHours(0, 0, 0, 0)
  return date
}

export function toISODate(value) {
  const date = parseDate(value)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function addMonths(value, months) {
  const date = parseDate(value)
  const targetDay = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(targetDay, lastDayOfTargetMonth))
  return date
}

export function addDays(value, days) {
  const date = parseDate(value)
  date.setDate(date.getDate() + days)
  return date
}

/** Signed difference in whole calendar days between two dates (b - a). */
export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / MS_PER_DAY)
}

/** Days from today until the given date (negative when the date is in the past). */
export function daysUntil(value) {
  return daysBetween(new Date(), value)
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const longDateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const monthYearFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  year: 'numeric',
})

/** "10 Mar 2026" */
export function formatDate(value) {
  if (!value) return '—'
  return dateFormatter.format(parseDate(value))
}

/** "10 March 2026" */
export function formatDateLong(value) {
  if (!value) return '—'
  return longDateFormatter.format(parseDate(value))
}

/** "Mar 2026" */
export function formatMonthYear(value) {
  if (!value) return '—'
  return monthYearFormatter.format(parseDate(value))
}
