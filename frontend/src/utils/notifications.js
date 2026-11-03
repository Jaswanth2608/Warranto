import { getWarrantyInfo } from './warranty'
import { addDays, daysBetween, formatDate, toISODate } from './dates'
import { EXPIRING_SOON_DAYS } from './constants'
import { pluralize } from './format'

/**
 * The in-app notification feed, derived from the real catalogue.
 *
 * There is no notifications table and no mock data: every entry is a fact that
 * is true right now, recomputed from the product's dates. That is why an entry
 * disappears on its own once the situation is resolved (bill attached, product
 * deleted) and why nothing can go stale while a tab stays open.
 *
 * Ids are stable for a given situation, so "read" state survives reloads but
 * resets when the underlying fact changes (a renewed warranty is news again).
 */

const MAX_ITEMS = 12
const BILL_NUDGE_WINDOW_DAYS = 21
const EXPIRED_WINDOW_DAYS = 45

function daysAgoIso(days) {
  return toISODate(addDays(new Date(), -days))
}

function expiryNotification(product, info) {
  const expiry = info.expiryDate ? toISODate(info.expiryDate) : null

  if (info.daysRemaining < 0) {
    if (Math.abs(info.daysRemaining) > EXPIRED_WINDOW_DAYS) return null
    return {
      id: `expired:${product.id}:${expiry}`,
      type: 'expired',
      title: `${product.name} warranty has expired`,
      description: `Coverage ended ${pluralize(Math.abs(info.daysRemaining), 'day')} ago.`,
      createdAt: expiry,
      to: `/products/${product.id}`,
      productId: product.id,
    }
  }

  if (info.daysRemaining > EXPIRING_SOON_DAYS) return null

  const title =
    info.daysRemaining === 0
      ? `${product.name} expires today`
      : `${product.name} expires in ${pluralize(info.daysRemaining, 'day')}`

  return {
    id: `expiry:${product.id}:${expiry}`,
    type: 'expiry',
    title,
    description: 'Keep the bill handy in case you need to raise a claim.',
    // The warning became true EXPIRING_SOON_DAYS before the expiry date.
    createdAt: daysAgoIso(EXPIRING_SOON_DAYS - info.daysRemaining),
    to: `/products/${product.id}`,
    productId: product.id,
  }
}

function billNotification(product, today) {
  if (product.bill) return null

  const addedAt = product.createdAt
  if (!addedAt) return null

  const ageDays = Math.max(0, daysBetween(addedAt, today))
  if (ageDays > BILL_NUDGE_WINDOW_DAYS) return null

  return {
    id: `bill:${product.id}`,
    type: 'bill',
    title: `Add the bill for ${product.name}`,
    description: 'A stored bill makes a claim, a resale or a service visit much easier.',
    createdAt: toISODate(addedAt),
    to: `/products/${product.id}`,
    productId: product.id,
  }
}

/**
 * @param {Array<object>} products
 * @param {{ limit?: number, today?: string }} [options]
 *   `today` is the calendar day the caller is rendering (see useToday), so the
 *   feed recomputes when the day changes rather than when the tab reloads.
 */
export function buildNotifications(
  products = [],
  { limit = MAX_ITEMS, today = toISODate(new Date()) } = {},
) {
  const items = []

  for (const product of products) {
    const info = getWarrantyInfo(product)
    const expiry = expiryNotification(product, info)
    if (expiry) items.push(expiry)

    const bill = billNotification(product, today)
    if (bill) items.push(bill)
  }

  items.sort((a, b) => {
    // Newest fact first; ties fall back to the expiry/added date.
    const byDate = String(b.createdAt).localeCompare(String(a.createdAt))
    if (byDate !== 0) return byDate
    return a.title.localeCompare(b.title)
  })

  return items.slice(0, limit)
}

/** Human summary used by the notification menu footer. */
export function summarizeNotifications(items = []) {
  const expiring = items.filter((item) => item.type === 'expiry').length
  const expired = items.filter((item) => item.type === 'expired').length

  if (!items.length) return 'Nothing needs your attention right now.'
  if (expiring && expired) {
    return `${pluralize(expiring, 'warranty', 'warranties')} ending soon · ${expired} expired`
  }
  if (expiring) return `${pluralize(expiring, 'warranty', 'warranties')} ending soon`
  if (expired) return `${pluralize(expired, 'expired warranty', 'expired warranties')}`
  return 'A few records could use a closer look.'
}

/** "Expires 10 Feb 2027" helper for the menu's secondary line. */
export function notificationDateLabel(item) {
  return item.createdAt ? formatDate(item.createdAt) : ''
}

export default buildNotifications
