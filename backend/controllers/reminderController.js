'use strict'

const mongoose = require('mongoose')

const { toYMD, parseYMD } = require('../utils/warranty')
const { ApiError } = require('../middleware/errorMiddleware')
const Reminder = require('../models/Reminder')

const { MILESTONES, MILESTONE_LABELS } = Reminder

const _MILESTONE_LABELS = MILESTONE_LABELS || { 90: '90 days before expiry', 30: '30 days before expiry', 7: '7 days before expiry' }
const Product = require('../models/Product')
const Task = require('../models/Task')

/**
 * Reminder controller — automated warranty milestone reminders.
 *
 * Response contracts:
 *   GET    /api/reminders              → { success, count, reminders: [...] }
 *   GET    /api/reminders/:id          → { success, reminder }
 *   POST   /api/reminders              → 201 { success, reminder }
 *   DELETE /api/reminders/:id          → { success, message, id }
 *   GET    /api/reminders/milestones   → { success, milestones }
 *
 * Rules:
 * - Reminders are created from the backend's warranty expiry calculation, never
 *   from a client-supplied date that could be wrong.
 * - Duplicate records for the same user, product, and milestone are prevented
 *   by a unique compound index.
 * - Reminders for already-expired warranties or products without a valid expiry
 *   date are never created.
 * - The product reference is verified so a deleted product never surfaces.
 *
 * Field mapping:
 *   API uses milestoneDays/dueDate/expiryDate/isNotified.
 *   Model stores targetMilestone/targetDate/notifiedAt/status.
 */

/** GET /api/reminders */
exports.listReminders = async (req, res, next) => {
  try {
    const reminders = await Reminder.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean()

    const enriched = await Promise.all(
      reminders.map(async (r) => {
        let productName = null
        let productSerialNumber = null

        if (r.product) {
          const product = await Product.findById(r.product).select('name serialNumber').lean().catch(() => null)
          productName = product ? product.name : null
          productSerialNumber = product ? (product.serialNumber || null) : null
        }

        return {
          _id: r._id.toString(),
          userId: r.userId.toString(),
          product: r.product ? r.product.toString() : null,
          productName,
          productSerialNumber,
          title: r.title || null,
          targetMilestone: r.targetMilestone,
          targetDate: r.targetDate ? r.targetDate.toISOString().slice(0, 10) : null,
          notifiedAt: r.notifiedAt ? r.notifiedAt.toISOString().slice(0, 10) : null,
          isNotified: r.notifiedAt != null,
          status: r.status || null,
          createdAt: r.createdAt.toISOString().slice(0, 10),
          updatedAt: r.updatedAt.toISOString().slice(0, 10),
        }
      }),
    )

    res.json({ success: true, count: enriched.length, reminders: enriched })
  } catch (error) {
    next(error)
  }
}

/** GET /api/reminders/:id */
exports.getReminder = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Invalid reminder id.')
    }

    const reminder = await Reminder.findOne({ _id: req.params.id, userId: req.user.id }).lean().catch(() => null)
    if (!reminder) throw new ApiError(404, 'Reminder not found.')

    let productName = null
    let productSerialNumber = null

    if (reminder.product) {
      const product = await Product.findById(reminder.product).select('name serialNumber').lean().catch(() => null)
      productName = product ? product.name : null
      productSerialNumber = product ? (product.serialNumber || null) : null
    }

    res.json({
      success: true,
      reminder: {
        _id: reminder._id.toString(),
        userId: reminder.userId.toString(),
        product: reminder.product ? reminder.product.toString() : null,
        productName,
        productSerialNumber,
        title: reminder.title || null,
        targetMilestone: reminder.targetMilestone,
        targetDate: reminder.targetDate ? reminder.targetDate.toISOString().slice(0, 10) : null,
        notifiedAt: reminder.notifiedAt ? reminder.notifiedAt.toISOString().slice(0, 10) : null,
        isNotified: reminder.notifiedAt != null,
        status: reminder.status || null,
        createdAt: reminder.createdAt.toISOString().slice(0, 10),
        updatedAt: reminder.updatedAt.toISOString().slice(0, 10),
      },
    })
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/reminders — create a reminder for a specific product and milestone.
 * The due date is calculated from the product's actual warranty expiry date on the
 * server. Fails if the warranty has already expired or the product has no valid
 * expiry date.
 */
exports.createReminder = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.body.product)) {
      throw new ApiError(400, 'Invalid product id.')
    }

    const milestoneDays = req.body.milestoneDays
    if (!milestoneDays || !Reminder.MILESTONES.some((m) => m.days === milestoneDays)) {
      throw new ApiError(400, `Invalid milestone days. Must be one of: 90, 30, 7.`)
    }

    const product = await Product.findOne({ _id: req.body.product, user: req.user.id })
    if (!product) throw new ApiError(404, 'Product not found.')

    if (!product.warrantyExpiryDate) {
      throw new ApiError(400, 'This product has no warranty expiry date.')
    }

    const expiry = parseYMD(product.warrantyExpiryDate)
    if (!expiry) throw new ApiError(400, 'This product has no valid warranty expiry date.')

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (expiry <= today) {
      throw new ApiError(400, `This product's warranty has already expired.`)
    }

    const targetDate = new Date(expiry.getTime() - milestoneDays * 24 * 60 * 60 * 1000)
    if (targetDate < today) {
      throw new ApiError(400, 'This reminder milestone has already passed.')
    }

    const created = await Reminder.createReminder({
      userId: req.user.id,
      product: req.body.product,
      targetMilestone: milestoneDays,
      targetDate,
    })

    res.status(201).json({
      success: true,
      reminder: {
        id: created._id.toString(),
        userId: created.userId.toString(),
        product: created.product.toString(),
        productName: product.name,
        milestoneDays: created.targetMilestone,
        dueDate: created.targetDate.toISOString().slice(0, 10),
        expiryDate: product.warrantyExpiryDate,
        isNotified: created.notifiedAt != null,
        createdAt: created.createdAt.toISOString().slice(0, 10),
      },
    })
  } catch (error) {
    next(error)
  }
}

/** DELETE /api/reminders/:id */
exports.deleteReminder = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Invalid reminder id.')
    }

    const reminder = await Reminder.findOneAndDelete({ _id: req.params.id, userId: req.user.id })
    if (!reminder) throw new ApiError(404, 'Reminder not found.')

    res.json({ success: true, message: 'Reminder deleted.', id: req.params.id })
  } catch (error) {
    next(error)
  }
}

/** GET /api/reminders/milestones */
exports.getMilestones = async (req, res, next) => {
  try {
    res.json({ success: true, milestones: MILESTONES ? MILESTONES.reduce((acc, m) => { acc[m.days] = m.label; return acc }, {}) : _MILESTONE_LABELS })
  } catch (error) {
    next(error)
  }
}

/**
 * Ensure at least one reminder task exists for a product + milestone.
 * Creates a task if one does not already exist for the same product and
 * milestone, preventing duplicates.
 */
exports.ensureReminderTask = async (reminder) => {
  const existingTask = await Task.findOne({
    userId: reminder.userId,
    product: reminder.product,
    title: `Warranty expires in ${reminder.targetMilestone} days`,
    dueDate: reminder.targetDate,
  })

  if (!existingTask) {
    const task = new Task({
      userId: reminder.userId,
      product: reminder.product,
      title: `Warranty expires in ${reminder.targetMilestone} days`,
      description: `Your warranty for this product expires in ${reminder.targetMilestone} days. Take action before it expires.`,
      dueDate: reminder.targetDate,
      priority: reminder.targetMilestone === 7
        ? 'high'
        : reminder.targetMilestone === 30
          ? 'medium'
          : 'low',
      status: 'pending',
      source: 'reminder',
    })
    await task.save()
  }
}
