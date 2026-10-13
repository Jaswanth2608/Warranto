import { getWarrantyInfo, STATUS_META } from './warranty'
import { STATUS } from './constants'

/** Total of everything the user has spent, from the mock catalogue. */
export function getTotalPurchaseValue(productList) {
  return productList.reduce((sum, product) => sum + (product.purchasePrice || 0), 0)
}

/** Counts for the dashboard stat cards. Statuses are exclusive and sum to total. */
export function getWarrantyStats(productList) {
  const stats = {
    total: productList.length,
    active: 0,
    expiring: 0,
    expired: 0,
    withBill: 0,
    totalValue: getTotalPurchaseValue(productList),
  }

  productList.forEach((product) => {
    const { status, hasBill } = getWarrantyInfo(product)
    if (status === STATUS.ACTIVE) stats.active += 1
    if (status === STATUS.EXPIRING_SOON) stats.expiring += 1
    if (status === STATUS.EXPIRED) stats.expired += 1
    if (hasBill) stats.withBill += 1
  })

  return stats
}

/** Products with the nearest warranty expiry first (expired items sink to the bottom). */
export function getUpcomingExpirations(productList, limit) {
  const withInfo = productList.map((product) => ({ product, info: getWarrantyInfo(product) }))
  withInfo.sort((a, b) => {
    const aExpired = a.info.daysRemaining < 0 ? 1 : 0
    const bExpired = b.info.daysRemaining < 0 ? 1 : 0
    if (aExpired !== bExpired) return aExpired - bExpired
    return a.info.daysRemaining - b.info.daysRemaining
  })
  return (limit ? withInfo.slice(0, limit) : withInfo)
}

/** Most recently added products first. */
export function getRecentlyAdded(productList, limit) {
  const sorted = [...productList].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  )
  return limit ? sorted.slice(0, limit) : sorted
}

/**
 * Warranties that are approaching expiry (not yet expired), grouped into
 * the 7 / 30 / 60 day buckets used by the Expiring Soon page.
 */
export function getExpiringGroups(productList) {
  const upcoming = productList
    .map((product) => ({ product, info: getWarrantyInfo(product) }))
    .filter(({ info }) => info.daysRemaining >= 0 && info.daysRemaining <= 60)

  return [
    { label: 'Within 7 days', days: 7, items: upcoming.filter(({ info }) => info.daysRemaining <= 7) },
    { label: 'Within 30 days', days: 30, items: upcoming.filter(({ info }) => info.daysRemaining > 7 && info.daysRemaining <= 30) },
    { label: 'Within 60 days', days: 60, items: upcoming.filter(({ info }) => info.daysRemaining > 30 && info.daysRemaining <= 60) },
  ]
}

/** Flattened list of every bill in the catalogue, newest upload first. */
export function getBills(productList) {
  return productList
    .filter((product) => product.bill)
    .map((product) => ({ product, bill: product.bill }))
    .sort((a, b) => new Date(b.bill.uploadedAt) - new Date(a.bill.uploadedAt))
}

/** Search + filter + sort pipeline for the My Products page. */
export function filterAndSortProducts(
  productList,
  { query = '', status = 'all', category = 'all', sortBy = 'recent' } = {},
) {
  const normalizedQuery = query.trim().toLowerCase()

  const filtered = productList.filter((product) => {
    const haystack = [product.name, product.brand, product.modelNumber, product.serialNumber, product.seller]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery)
    const matchesStatus = status === 'all' || getWarrantyInfo(product).status === status
    const matchesCategory = category === 'all' || product.category === category

    return matchesQuery && matchesStatus && matchesCategory
  })

  const sorted = [...filtered]
  switch (sortBy) {
    case 'oldest':
      sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      break
    case 'purchaseDate':
      sorted.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate))
      break
    case 'expiry':
    case 'warrantyExpiry':
      sorted.sort((a, b) => getWarrantyInfo(a).daysRemaining - getWarrantyInfo(b).daysRemaining)
      break
    case 'price':
      sorted.sort((a, b) => b.purchasePrice - a.purchasePrice)
      break
    default:
      sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }

  return sorted
}

/** Compact legend data for the dashboard warranty overview. */
export function getStatusBreakdown(productList) {
  const stats = getWarrantyStats(productList)
  return [
    { key: STATUS.ACTIVE, label: STATUS_META[STATUS.ACTIVE].label, count: stats.active, className: 'bg-success-500' },
    { key: STATUS.EXPIRING_SOON, label: STATUS_META[STATUS.EXPIRING_SOON].label, count: stats.expiring, className: 'bg-warning-500' },
    { key: STATUS.EXPIRED, label: STATUS_META[STATUS.EXPIRED].label, count: stats.expired, className: 'bg-danger-500' },
  ]
}
