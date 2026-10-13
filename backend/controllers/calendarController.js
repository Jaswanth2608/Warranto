'use strict'

const Product = require('../models/Product')
const Reminder = require('../models/Reminder')

function ymdKey(date) {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return null
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function utcSafeDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  return d
}

/**
 * GET /api/calendar/events
 *
 * Returns warranty expiry and reminder milestones that fall within the
 * requested month, for the authenticated user only.
 *
 * Query parameters:
 *   year   - integer, required
 *   month  - integer 1-12, required
 *
 * Response shape:
 *   { events: [{ date, year, month, day, items: [...] }] }
 */
async function getCalendarEvents(req, res, next) {
  try {
    const userId = req.user._id
    const year = parseInt(req.query.year, 10)
    const month = parseInt(req.query.month, 10)

    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      return res.status(400).json({ message: 'year and month are required.' })
    }
    if (month < 1 || month > 12) {
      return res.status(400).json({ message: 'month must be between 1 and 12.' })
    }

    // Calendar windows are inclusive of the full calendar month and are
    // computed with local date boundaries so year/month comparisons match the
    // frontend's date model (YYYY-MM-DD).
    const firstDay = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const lastDay = new Date(year, month, 0, 23, 59, 59, 999)

    const eventsMap = new Map()

    const products = await Product.find({
      user: userId,
      warrantyExpiryDate: { $exists: true, $ne: null },
    }).lean()

    for (const product of products) {
      const expiryLocal = new Date(product.warrantyExpiryDate + 'T00:00:00')
      if (isNaN(expiryLocal.getTime())) continue

      const y = expiryLocal.getFullYear()
      const m = expiryLocal.getMonth() + 1
      if (y !== year || m !== month) continue

      const key = ymdKey(expiryLocal)
      if (!key) continue

      const entry = eventsMap.get(key) || {
        date: key,
        year: y,
        month: m,
        day: expiryLocal.getDate(),
        items: [],
      }

      entry.items.push({
        type: 'warranty_expiry',
        product: {
          id: product._id.toString(),
          name: product.name,
          serialNumber: product.serialNumber || null,
          category: product.category || null,
        },
        title: `Warranty expires: ${product.name}`,
        subtitle: 'Warranty expiry',
        url: `/products/${product._id.toString()}`,
        daysRemaining: Math.round(
          (expiryLocal.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000,
        ),
        badge: 'danger',
      })

      eventsMap.set(ymdKey(expiryLocal), entry)
    }

    const reminders = await Reminder.find({
      userId,
      status: 'pending',
      targetDate: { $gte: firstDay, $lte: lastDay },
    }).lean()

    for (const reminder of reminders) {
      const targetLocal = new Date(reminder.targetDate + 'T00:00:00')
      if (isNaN(targetLocal.getTime())) continue
      const key = ymdKey(targetLocal)
      if (!key) continue

      const entry = eventsMap.get(key) || {
        date: key,
        year: targetLocal.getFullYear(),
        month: targetLocal.getMonth() + 1,
        day: targetLocal.getDate(),
        items: [],
      }

      const daysUntilTarget = Math.round(
        (targetLocal.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000,
      )

      let badge = 'neutral'
      if (reminder.targetMilestone === 7) badge = 'danger'
      else if (reminder.targetMilestone === 30) badge = 'warning'
      else if (reminder.targetMilestone === 90) badge = 'brand'

      entry.items.push({
        type: 'reminder_milestone',
        product: {
          id: reminder.product.toString(),
          name: reminder.title ? reminder.title.split(':')[0].trim() : null,
        },
        title: reminder.title || `Reminder: ${reminder.targetMilestone} days before expiry`,
        subtitle: `${reminder.targetMilestone} days before expiry`,
        url: `/products/${reminder.product.toString()}`,
        daysUntilTarget,
        targetMilestone: reminder.targetMilestone,
        badge,
      })

      eventsMap.set(key, entry)
    }

    const sorted = Array.from(eventsMap.values()).sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day
      return a.month - b.month
    })

    return res.json({ events: sorted })
  } catch (error) {
    next(error)
  }
}

module.exports = { getCalendarEvents }
