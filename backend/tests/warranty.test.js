/**
 * Unit tests for the warranty date helpers.
 * These verify the server reproduces the frontend rules exactly
 * (frontend/src/utils/dates.js and frontend/src/utils/warranty.js).
 */

const { describe, test } = require('node:test')
const assert = require('node:assert/strict')

const {
  addMonths,
  deriveWarrantyStatus,
  getWarrantyExpiryDate,
  isYMD,
  statusQuery,
  toYMD,
  STATUS,
} = require('../utils/warranty')

describe('warranty date helpers', () => {
  test('expiry date = purchase date + warranty months', () => {
    assert.equal(getWarrantyExpiryDate('2025-01-15', 12), '2026-01-15')
    assert.equal(getWarrantyExpiryDate('2025-06-30', 3), '2025-09-30')
    assert.equal(getWarrantyExpiryDate('2025-03-01', 24), '2027-03-01')
  })

  test('expiry clamps to the last day of the target month', () => {
    assert.equal(getWarrantyExpiryDate('2025-01-31', 1), '2025-02-28')
    assert.equal(getWarrantyExpiryDate('2024-01-31', 1), '2024-02-29') // leap year
    assert.equal(getWarrantyExpiryDate('2025-03-31', 1), '2025-04-30')
    assert.equal(getWarrantyExpiryDate('2024-02-29', 12), '2025-02-28')
  })

  test('addMonths does not mutate impossible inputs silently', () => {
    assert.equal(toYMD(addMonths('2025-05-15', 0)), '2025-05-15')
    assert.equal(toYMD(addMonths('2025-05-15', 13)), '2026-06-15')
  })

  test('date validation accepts only real YYYY-MM-DD dates', () => {
    assert.equal(isYMD('2026-01-05'), true)
    assert.equal(isYMD('2026-02-30'), false) // rolls over in plain Date parsing
    assert.equal(isYMD('2026-13-01'), false)
    assert.equal(isYMD('15/01/2026'), false)
    assert.equal(isYMD('2026-1-5'), false) // must be zero-padded
    assert.equal(isYMD('2026-01-05T00:00:00.000Z'), false)
    assert.equal(isYMD(20260105), false)
  })

  test('status is derived from the expiry date', () => {
    const today = new Date(2026, 9, 9) // 9 Oct 2026, local time

    assert.equal(deriveWarrantyStatus('2027-01-15', today).status, STATUS.ACTIVE)
    assert.equal(deriveWarrantyStatus('2026-11-09', today).status, STATUS.ACTIVE) // 31 days
    assert.equal(deriveWarrantyStatus('2026-11-08', today).status, STATUS.EXPIRING_SOON) // 30 days
    assert.equal(deriveWarrantyStatus('2026-10-09', today).status, STATUS.EXPIRING_SOON) // today
    assert.equal(deriveWarrantyStatus('2026-10-08', today).status, STATUS.EXPIRED) // yesterday
    assert.equal(deriveWarrantyStatus('2026-01-15', today).status, STATUS.EXPIRED)
  })

  test('daysRemaining is a signed whole-day count', () => {
    const today = new Date(2026, 9, 9)
    assert.equal(deriveWarrantyStatus('2026-11-08', today).daysRemaining, 30)
    assert.equal(deriveWarrantyStatus('2026-10-09', today).daysRemaining, 0)
    assert.equal(deriveWarrantyStatus('2026-10-06', today).daysRemaining, -3)
  })

  test('status query ranges match the derivation boundaries', () => {
    const today = new Date(2026, 9, 9)
    assert.deepEqual(statusQuery('expired', today), { warrantyExpiryDate: { $lt: '2026-10-09' } })
    assert.deepEqual(statusQuery('expiring', today), {
      warrantyExpiryDate: { $gte: '2026-10-09', $lte: '2026-11-08' },
    })
    assert.deepEqual(statusQuery('active', today), { warrantyExpiryDate: { $gt: '2026-11-08' } })
    assert.equal(statusQuery('bogus', today), null)
  })
})
