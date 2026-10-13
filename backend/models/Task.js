'use strict'

const mongoose = require('mongoose')

const STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
}

const PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
}

const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    dueDate: {
      type: Date,
      required: true,
    },
    priority: {
      type: String,
      enum: Object.values(PRIORITY),
      default: PRIORITY.MEDIUM,
    },
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.PENDING,
    },
    source: {
      type: String,
      trim: true,
      maxlength: 50,
      default: 'custom',
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
)

taskSchema.index({ userId: 1, status: 1 })
taskSchema.index({ userId: 1, dueDate: 1 })
taskSchema.index({ userId: 1, priority: 1 })
taskSchema.index({ userId: 1, product: 1, dueDate: 1 })
taskSchema.index(
  { userId: 1, product: 1, targetMilestone: 1, status: 1 },
  { unique: true, partialFilterExpression: { targetMilestone: { $exists: true } } }
)

taskSchema.statics = {
  async findByUser(userId, filters = {}) {
    const { status, priority, product, dueBefore, dueAfter, page = 1, limit = 50 } = filters
    const query = { userId }
    if (status) query.status = status
    if (priority) query.priority = priority
    if (product) query.product = product
    if (dueBefore) query.dueDate = { ...query.dueDate, $lte: dueBefore }
    if (dueAfter) query.dueDate = { ...query.dueDate, $gte: dueAfter }

    const sortBy = filters.sortBy || '-dueDate'
    const skip = (page - 1) * limit

    const [tasks, total] = await Promise.all([
      this.find(query)
        .populate('product', 'name serialNumber category')
        .sort(sortBy)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.countDocuments(query),
    ])

    return { tasks, total, page, limit }
  },

  async getByDueWindow(userId, beforeDays, afterDays = 0) {
    const now = new Date()
    const before = new Date(now.getTime() + beforeDays * 24 * 60 * 60 * 1000)
    const after = new Date(now.getTime() + afterDays * 24 * 60 * 60 * 1000)

    return this.find({
      userId,
      dueDate: { $gte: after, $lte: before },
    })
      .populate('product', 'name serialNumber category warrantyExpiry')
      .lean()
  },

  async getOverdue(userId) {
    return this.findByUser(userId, { status: ['pending', 'in_progress'], dueBefore: new Date() })
  },

  async getUpcoming(userId, days = 30) {
    return this.getByDueWindow(userId, days, 0)
  },

  async getCompleted(userId, days = 30) {
    const before = new Date()
    const after = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    return this.find({
      userId,
      status: STATUS.COMPLETED,
      completedAt: { $gte: after, $lte: before },
    })
      .populate('product', 'name serialNumber category')
      .lean()
  },

  async getStats(userId) {
    const now = new Date()
    const [overdue, upcoming, completed, total] = await Promise.all([
      this.countDocuments({
        userId,
        status: { $in: [STATUS.PENDING, STATUS.IN_PROGRESS] },
        dueDate: { $lt: now },
      }),
      this.countDocuments({
        userId,
        status: { $in: [STATUS.PENDING, STATUS.IN_PROGRESS] },
        dueDate: { $gte: now },
      }),
      this.countDocuments({
        userId,
        status: STATUS.COMPLETED,
        completedAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      }),
      this.countDocuments({ userId }),
    ])
    return { overdue, upcoming, completed, total }
  },
}

taskSchema.methods.toJSON = function () {
  const toDateStr = (d) => (d ? d.toISOString().slice(0, 10) : null)
  return {
    id: this._id,
    userId: this.userId,
    product: this.product,
    title: this.title,
    description: this.description,
    dueDate: toDateStr(this.dueDate),
    priority: this.priority,
    status: this.status,
    source: this.source,
    completedAt: toDateStr(this.completedAt),
    createdAt: toDateStr(this.createdAt),
    updatedAt: toDateStr(this.updatedAt),
  }
}

taskSchema.methods.complete = function () {
  if (this.status === STATUS.COMPLETED) {
    throw new Error('Task is already completed.')
  }
  this.status = STATUS.COMPLETED
  this.completedAt = new Date()
}

taskSchema.methods.reopen = function () {
  if (this.status !== STATUS.COMPLETED) {
    throw new Error('Only completed tasks can be reopened.')
  }
  this.status = STATUS.PENDING
  this.completedAt = null
}

const Task = mongoose.model('Task', taskSchema)

module.exports = Task
module.exports.STATUS = STATUS
module.exports.PRIORITY = PRIORITY
