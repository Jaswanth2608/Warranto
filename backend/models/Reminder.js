'use strict'

const mongoose = require('mongoose')
const { Schema, model } = mongoose

/**
 * Reminder model — warranty milestone reminder records.
 *
 * Duplicate prevention is enforced at the data layer via a unique compound
 * index on { userId, product, targetMilestone }. The controller should still
 * use a transactional check-and-create where possible for a clean API error.
 */
const MILESTONES = [
  { days: 90, label: '90 days before expiry', description: 'Remind 90 days before the warranty expires.' },
  { days: 30, label: '30 days before expiry', description: 'Remind 30 days before the warranty expires.' },
  { days: 7, label: '7 days before expiry', description: 'Remind 7 days before the warranty expires.' },
]

const MILESTONE_LABELS = MILESTONES.reduce((acc, m) => {
  acc[m.days] = m.label
  return acc
}, {})

const reminderSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    targetMilestone: {
      type: Number,
      required: true,
      enum: MILESTONES.map((m) => m.days),
    },
    targetDate: {
      type: Date,
      required: true,
      index: true,
    },
    notifiedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed', 'cancelled'],
      default: 'pending',
    },
    notificationStatus: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed'],
      default: 'pending',
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    lastErrorMessage: {
      type: String,
      default: null,
    },
    lastNotificationError: {
      type: String,
      default: null,
    },
    lastNotificationMessageId: {
      type: String,
      default: null,
    },
    metadata: {
      type: Object,
      default: Object,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

reminderSchema.index(
  { userId: 1, product: 1, targetMilestone: 1 },
  { unique: true, name: 'unique_user_product_milestone' },
)

reminderSchema.index({ userId: 1, status: 1, targetDate: 1 }, { name: 'status_due_index' })

reminderSchema.index({ userId: 1, notifiedAt: 1 }, { name: 'notified_index' })

reminderSchema.statics.MILESTONES = MILESTONES

reminderSchema.statics.createReminder = async function (params) {
  const { userId, product, targetMilestone, targetDate } = params
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const existing = await this.findOne({ userId, product, targetMilestone }).session(session)
    if (existing) {
      await session.abortTransaction()
      session.endSession()
      const dup = new Error('A reminder for this product and milestone already exists.')
      dup.statusCode = 409
      throw dup
    }

    const reminder = await this.create([{ userId, product, targetMilestone, targetDate }], { session })

    await session.commitTransaction()
    session.endSession()

    return reminder[0]
  } catch (error) {
    await session.abortTransaction().catch(() => {})
    session.endSession().catch(() => {})
    throw error
  }
}

reminderSchema.methods.getScheduledTime = function () {
  return this.targetDate
}

reminderSchema.methods.targetMilestoneLabel = function () {
  return MILESTONE_LABELS[this.targetMilestone] || 'Unknown'
}

reminderSchema.methods.markNotified = async function () {
  this.notifiedAt = new Date()
  this.status = 'delivered'
  await this.save()
}

reminderSchema.methods.markFailed = async function (errorMessage) {
  this.status = 'failed'
  this.lastErrorMessage = errorMessage
  this.sentCount += 1
  await this.save()
}

reminderSchema.methods.isOverdue = function () {
  return this.targetDate < new Date()
}

reminderSchema.methods.canRetry = function () {
  const maxRetries = 3
  return this.status === 'failed' && this.sentCount < maxRetries
}

reminderSchema.methods.getNextRetryDate = function () {
  const baseDate = this.targetDate
  if (!baseDate) return null
  return new Date(baseDate.getTime() + this.sentCount * 24 * 60 * 60 * 1000)
}

const Reminder = model('Reminder', reminderSchema)

module.exports = Reminder
