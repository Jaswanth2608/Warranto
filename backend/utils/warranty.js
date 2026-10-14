/**
 * Warranty date helpers for the Warranto API.
 *
 * These mirror frontend/src/utils/dates.js and frontend/src/utils/warranty.js
 * so the server and the browser always agree on expiry dates and statuses.
 *
 * Dates are handled as local calendar dates in YYYY-MM-DD format.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Same thresholds as frontend/src/utils/constants.js */
const EXPIRING_SOON_DAYS = 30

const STATUS = {
  ACTIVE: 'active',
  EXPIRING_SOON: 'expiring',
  EXPIRED: 'expired',
}

/** Parses "YYYY-MM-DD" as a local calendar date. Returns null when invalid. */
function parseYMD(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  // Rejects impossible dates such as 2026-02-30 (they would roll over).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/** True when the value is a real calendar date in YYYY-MM-DD format. */
function isYMD(value) {
  return parseYMD(value) !== null
}

/** Formats a Date as "YYYY-MM-DD" (local time), matching the frontend's toISODate. */
function toYMD(value) {
  const date = value instanceof Date ? value : new Date(value)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Adds whole days to a date. */
function addDays(value, days) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseYMD(value)
  if (!date) return null
  date.setDate(date.getDate() + days)
  return date
}

/**
 * Adds months and clamps to the last day of the target month.
 * Same rule as the frontend: 31 Jan + 1 month = 28/29 Feb.
 */
function addMonths(value, months) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseYMD(value)
  if (!date) return null
  const targetDay = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(targetDay, lastDayOfTargetMonth))
  return date
}

/** The warranty end date "purchaseDate + warrantyMonths" as YYYY-MM-DD. */
function getWarrantyExpiryDate(purchaseDate, warrantyMonths) {
  const expiry = addMonths(purchaseDate, warrantyMonths)
  return expiry ? toYMD(expiry) : null
}

function startOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseYMD(value) || new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

/** Signed difference in whole calendar days between two dates (b - a). */
function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / MS_PER_DAY)
}

/**
 * Derives the warranty status from the expiry date — never from client input.
 * Matches frontend getWarrantyInfo(): <0 expired, <=30 expiring, else active.
 */
function deriveWarrantyStatus(expiryDate, today = new Date()) {
  const expiry = parseYMD(expiryDate) || startOfDay(expiryDate)
  const daysRemaining = daysBetween(today, expiry)

  let status = STATUS.ACTIVE
  if (daysRemaining < 0) status = STATUS.EXPIRED
  else if (daysRemaining <= EXPIRING_SOON_DAYS) status = STATUS.EXPIRING_SOON

  return { status, daysRemaining }
}

/**
 * Mongo query fragments for the ?status= list filter.
 * Comparisons on the stored YYYY-MM-DD string are safe because the format
 * sorts chronologically.
 */
function statusQuery(status, today = new Date()) {
  const todayStr = toYMD(startOfDay(today))
  const soonStr = toYMD(addDays(startOfDay(today), EXPIRING_SOON_DAYS))

  if (status === STATUS.EXPIRED) return { warrantyExpiryDate: { $lt: todayStr } }
  if (status === STATUS.EXPIRING_SOON) {
    return { warrantyExpiryDate: { $gte: todayStr, $lte: soonStr } }
  }
  if (status === STATUS.ACTIVE) return { warrantyExpiryDate: { $gt: soonStr } }
  return null
}

module.exports = {
  EXPIRING_SOON_DAYS,
  STATUS,
  parseYMD,
  isYMD,
  toYMD,
  addDays,
  addMonths,
  getWarrantyExpiryDate,
  startOfDay,
  daysBetween,
  deriveWarrantyStatus,
  statusQuery,
}
