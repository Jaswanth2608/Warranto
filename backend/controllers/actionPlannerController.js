'use strict'

const Task = require('../models/Task')
const Reminder = require('../models/Reminder')
const Product = require('../models/Product')
const { MILESTONES } = Reminder
const { STATUS: TASK_STATUS, PRIORITY } = Task

const VALID_STATUSES = Object.values(TASK_STATUS)
const VALID_PRIORITIES = Object.values(PRIORITY)

function validateStatus(value) {
  if (!VALID_STATUSES.includes(value)) {
    throw new Error(`Invalid status "${value}". Allowed: ${VALID_STATUSES.join(', ')}`)
  }
}

function validatePriority(value) {
  if (!VALID_PRIORITIES.includes(value)) {
    throw new Error(`Invalid priority "${value}". Allowed: ${VALID_PRIORITIES.join(', ')}`)
  }
}

function parseDate(value, fieldName = 'date') {
  if (value == null || value === '') {
    throw new Error(`${fieldName} is required.`)
  }
  const date = new Date(value)
  if (isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date (ISO 8601).`)
  }
  return date
}

function toApiTask(doc) {
  if (!doc) return null
  return {
    id: doc._id,
    productId: doc.product && (typeof doc.product === 'object' ? doc.product._id : doc.product),
    product: doc.product
      ? {
          id: typeof doc.product === 'object' ? doc.product._id : doc.product,
          name: doc.product && doc.product.name,
          serialNumber: doc.product && doc.product.serialNumber,
          category: doc.product && doc.product.category,
          warrantyExpiry: doc.product && doc.product.warrantyExpiry,
        }
      : null,
    title: doc.title,
    description: doc.description,
    dueDate: doc.dueDate,
    priority: doc.priority,
    status: doc.status,
    completedAt: doc.completedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

async function resolveProduct(userId, productInput) {
  if (typeof productInput === 'object' && productInput._id) {
    productInput = productInput._id
  }
  if (!productInput) {
    throw new Error('product is required.')
  }

  const product = await Product.findOne({
    _id: productInput,
    userId: userId,
  })

  if (!product) {
    throw new Error('Product not found.')
  }

  return product
}

async function canCreateReminderForProduct(product) {
  if (!product.warrantyExpiry || isNaN(new Date(product.warrantyExpiry).getTime())) {
    return false
  }
  const expiry = new Date(product.warrantyExpiry)
  const now = new Date()
  return expiry > now
}

function computeReminderTarget(expiryDate, milestoneDays) {
  const expiry = new Date(expiryDate)
  return new Date(expiry.getTime() - milestoneDays * 24 * 60 * 60 * 1000)
}

async function computeAndCreateReminders(userId, product, createdTask) {
  const expiry = new Date(product.warrantyExpiry)
  const now = new Date()

  for (const milestone of MILESTONES) {
    const targetDate = computeReminderTarget(expiry, milestone.days)

    if (targetDate <= now) {
      continue
    }

    const title = `${product.name}: ${milestone.label}`
    const description = `Warranty for "${product.name}" expires on ${expiry.toISOString().split('T')[0]}. Action reminder: ${milestone.label}.`

    await Reminder.findOrCreate(
      userId,
      product._id,
      milestone.days,
      targetDate.toISOString(),
      title,
      description,
      createdTask._id,
      'task'
    )
  }
}

async function updateRemindersForTask(userId, product, action) {
  if (!product || !canCreateReminderForProduct(product)) return

  const expiry = new Date(product.warrantyExpiry)
  const now = new Date()

  for (const milestone of MILESTONES) {
    const targetDate = computeReminderTarget(expiry, milestone.days)
    if (targetDate <= now) continue

    await Reminder.findOrCreate(
      userId,
      product._id,
      milestone.days,
      targetDate.toISOString(),
      `${product.name}: ${milestone.label}`,
      `Warranty for "${product.name}" expires on ${expiry.toISOString().split('T')[0]}. Action reminder: ${milestone.label}.`
    )
  }
}

exports.createTask = async (req, res, next) => {
  try {
    const userId = req.user._id

    if (!req.body.title || typeof req.body.title !== 'string' || req.body.title.trim().length === 0) {
      return res.status(400).json({ message: 'title is required.' })
    }
    if (!req.body.dueDate) {
      return res.status(400).json({ message: 'dueDate is required.' })
    }

    const product = await resolveProduct(userId, req.body.product)
    const dueDate = parseDate(req.body.dueDate, 'dueDate')
    const priority = (req.body.priority || PRIORITY.MEDIUM).toLowerCase()

    validatePriority(priority)

    const existing = await Task.findOne({
      userId,
      product: product._id,
      title: { $regex: new RegExp(`^${req.body.title.trim()}$`, 'i') },
      status: { $in: [TASK_STATUS.PENDING, TASK_STATUS.IN_PROGRESS] },
    })

    if (existing) {
      return res.status(409).json({
        message: 'A pending or in-progress task with this title already exists for this product.',
        conflictId: existing._id,
      })
    }

    const task = new Task({
      userId,
      product: product._id,
      title: req.body.title.trim(),
      description: (req.body.description || '').trim(),
      dueDate,
      priority,
      status: TASK_STATUS.PENDING,
    })

    await task.save()
    await task.populate('product', 'name serialNumber category warrantyExpiry')

    await updateRemindersForTask(userId, product, 'create')

    return res.status(201).json({ task: toApiTask(task) })
  } catch (error) {
    if (error.message === 'Product not found.' || error.message === 'product is required.') {
      return res.status(404).json({ message: 'Product not found.' })
    }
    return next(error)
  }
}

exports.getTasks = async (req, res, next) => {
  try {
    const userId = req.user._id
    const status = (req.query.status || '').split(',').filter(Boolean)
    const priority = (req.query.priority || '').split(',').filter(Boolean)
    const product = req.query.product || ''
    const dueBefore = req.query.dueBefore ? parseDate(req.query.dueBefore, 'dueBefore') : null
    const dueAfter = req.query.dueAfter ? parseDate(req.query.dueAfter, 'dueAfter') : null
    const sortBy = req.query.sortBy || '-dueDate'
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50))

    let statusFilter = null
    if (status.length === 1 && status[0] === 'all') {
      statusFilter = null
    } else if (status.length > 0) {
      const validStatuses = status.filter((s) => VALID_STATUSES.includes(s.toLowerCase()))
      if (validStatuses.length === 0) {
        return res.status(400).json({ message: 'Invalid status filter.' })
      }
      statusFilter = { $in: validStatuses.map((s) => s.toLowerCase()) }
    }

    let priorityFilter = null
    if (priority.length > 0) {
      const validPriorities = priority.filter((p) => VALID_PRIORITIES.includes(p.toLowerCase()))
      if (validPriorities.length === 0) {
        return res.status(400).json({ message: 'Invalid priority filter.' })
      }
      priorityFilter = { $in: validPriorities.map((p) => p.toLowerCase()) }
    }

    const result = await Task.findByUser(userId, {
      status: statusFilter,
      priority: priorityFilter,
      product: product || undefined,
      dueBefore,
      dueAfter,
      sortBy,
      page,
      limit,
    })

    const tasks = result.tasks.map(toApiTask)
    const hasMore = result.page * result.limit < result.total

    return res.json({
      tasks,
      total: result.total,
      page: result.page,
      limit: result.limit,
      hasMore,
    })
  } catch (error) {
    return next(error)
  }
}

exports.getTask = async (req, res, next) => {
  try {
    const userId = req.user._id
    const taskId = req.params.id

    const task = await Task.findOne({
      _id: taskId,
      userId,
    }).populate('product', 'name serialNumber category warrantyExpiry')

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' })
    }

    return res.json({ task: toApiTask(task) })
  } catch (error) {
    return next(error)
  }
}

exports.updateTask = async (req, res, next) => {
  try {
    const userId = req.user._id
    const taskId = req.params.id
    const body = req.body || {}

    const task = await Task.findOne({
      _id: taskId,
      userId,
    }).populate('product', 'name serialNumber category warrantyExpiry')

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' })
    }

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ message: 'No fields to update.' })
    }

    if (body.title != null) {
      if (typeof body.title !== 'string' || body.title.trim().length === 0) {
        return res.status(400).json({ message: 'title must be a non-empty string.' })
      }
      const trimmed = body.title.trim()
      const duplicate = await Task.findOne({
        _id: { $ne: task._id },
        userId,
        product: task.product._id,
        title: { $regex: new RegExp(`^${trimmed}$`, 'i') },
        status: { $in: [TASK_STATUS.PENDING, TASK_STATUS.IN_PROGRESS] },
      })
      if (duplicate) {
        return res.status(409).json({
          message: 'A pending or in-progress task with this title already exists for this product.',
          conflictId: duplicate._id,
        })
      }
      task.title = trimmed
    }

    if (body.description != null) {
      if (typeof body.description !== 'string') {
        return res.status(400).json({ message: 'description must be a string.' })
      }
      task.description = body.description.trim()
    }

    if (body.dueDate != null) {
      const dueDate = parseDate(body.dueDate, 'dueDate')
      if (dueDate <= new Date()) {
        return res.status(400).json({ message: 'dueDate cannot be in the past.' })
      }
      task.dueDate = dueDate
    }

    if (body.priority != null) {
      const priority = body.priority.toLowerCase()
      validatePriority(priority)
      task.priority = priority
    }

    if (body.status != null) {
      const status = body.status.toLowerCase()
      validateStatus(status)
      if (status !== TASK_STATUS.PENDING && status !== TASK_STATUS.IN_PROGRESS && status !== TASK_STATUS.COMPLETED) {
        return res.status(400).json({ message: 'Invalid status.' })
      }
      if (status === TASK_STATUS.COMPLETED) {
        if (task.status === TASK_STATUS.COMPLETED) {
          return res.status(400).json({ message: 'Task is already completed.', task: toApiTask(task) })
        }
        task.status = TASK_STATUS.COMPLETED
        task.completedAt = new Date()
      } else if (status === TASK_STATUS.PENDING) {
        if (task.status !== TASK_STATUS.COMPLETED) {
          return res.status(400).json({ message: 'Only completed tasks can be set to pending.', task: toApiTask(task) })
        }
        task.status = TASK_STATUS.PENDING
        task.completedAt = null
      } else {
        task.status = TASK_STATUS.IN_PROGRESS
      }
    }

    await task.save()
    await task.populate('product', 'name serialNumber category warrantyExpiry')

    return res.json({ task: toApiTask(task) })
  } catch (error) {
    return next(error)
  }
}

exports.completeTask = async (req, res, next) => {
  try {
    const userId = req.user._id
    const taskId = req.params.id

    const task = await Task.findOne({
      _id: taskId,
      userId,
    }).populate('product', 'name serialNumber category warrantyExpiry')

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' })
    }

    if (task.status === TASK_STATUS.COMPLETED) {
      return res.status(400).json({ message: 'Task is already completed.', task: toApiTask(task) })
    }

    task.status = TASK_STATUS.COMPLETED
    task.completedAt = new Date()
    await task.save()
    await task.populate('product', 'name serialNumber category warrantyExpiry')

    await Reminder.markFulfilledByTask(userId, task._id)

    return res.json({ task: toApiTask(task), message: 'Task completed.' })
  } catch (error) {
    return next(error)
  }
}

exports.reopenTask = async (req, res, next) => {
  try {
    const userId = req.user._id
    const taskId = req.params.id

    const task = await Task.findOne({
      _id: taskId,
      userId,
    }).populate('product', 'name serialNumber category warrantyExpiry')

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' })
    }

    if (task.status !== TASK_STATUS.COMPLETED) {
      return res.status(400).json({
        message: 'Only completed tasks can be reopened.',
        task: toApiTask(task),
      })
    }

    task.status = TASK_STATUS.PENDING
    task.completedAt = null
    await task.save()
    await task.populate('product', 'name serialNumber category warrantyExpiry')

    return res.json({ task: toApiTask(task), message: 'Task reopened.' })
  } catch (error) {
    return next(error)
  }
}

exports.deleteTask = async (req, res, next) => {
  try {
    const userId = req.user._id
    const taskId = req.params.id

    const task = await Task.findOne({
      _id: taskId,
      userId,
    })

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' })
    }

    await Reminder.cancelForProduct(userId, task.product, task.priority)
    await Task.deleteOne({ _id: taskId, userId })

    return res.json({ message: 'Task deleted.' })
  } catch (error) {
    return next(error)
  }
}

exports.getStats = async (req, res, next) => {
  try {
    const userId = req.user._id
    const stats = await Task.getStats(userId)
    return res.json({ stats })
  } catch (error) {
    return next(error)
  }
}

exports.getReminders = async (req, res, next) => {
  try {
    const userId = req.user._id

    const pending = await Reminder.pendingForUser(userId)
    const upcoming = await Reminder.upcomingForUser(userId, 30)

    return res.json({
      reminders: {
        pending: pending.map((r) => ({
          id: r._id,
          productId: typeof r.product === 'object' ? r.product._id : r.product,
          product: r.product && typeof r.product === 'object'
            ? { id: r.product._id, name: r.product.name, serialNumber: r.product.serialNumber }
            : null,
          milestone: r.targetMilestone,
          targetDate: r.targetDate,
          title: r.title,
          description: r.description,
          status: r.status,
          notifiedAt: r.notifiedAt,
          createdAt: r.createdAt,
        })),
        upcoming: upcoming.map((r) => ({
          id: r._id,
          productId: typeof r.product === 'object' ? r.product._id : r.product,
          product: r.product && typeof r.product === 'object'
            ? { id: r.product._id, name: r.product.name, serialNumber: r.product.serialNumber }
            : null,
          milestone: r.targetMilestone,
          targetDate: r.targetDate,
          title: r.title,
          description: r.description,
          status: r.status,
          notifiedAt: r.notifiedAt,
          createdAt: r.createdAt,
        })),
      },
    })
  } catch (error) {
    return next(error)
  }
}

exports.expireOrDeleteReminders = async (req, res, next) => {
  try {
    const userId = req.user._id

    await Reminder.updateMany(
      {
        userId,
        status: 'pending',
        targetDate: { $lte: new Date() },
      },
      { status: 'fulfilled', notifiedAt: new Date() }
    )

    const stats = await Reminder.getStats(userId)

    return res.json({ stats })
  } catch (error) {
    return next(error)
  }
}

exports.computeRemindersForUser = async (req, res, next) => {
  try {
    const userId = req.user._id

    const products = await Product.find({
      userId,
      warrantyExpiry: { $exists: true, $ne: null },
    }).lean()

    const now = new Date()
    const eligible = products.filter((p) => {
      const expiry = new Date(p.warrantyExpiry)
      return expiry instanceof Date && !isNaN(expiry.getTime()) && expiry > now
    })

    let created = 0
    for (const product of eligible) {
      const expiry = new Date(product.warrantyExpiry)
      for (const milestone of MILESTONES) {
        const targetDate = computeReminderTarget(expiry, milestone.days)
        if (targetDate <= now) continue

        const title = `${product.name}: ${milestone.label}`
        const description = `Warranty for "${product.name}" expires on ${expiry.toISOString().split('T')[0]}. Action reminder: ${milestone.label}.`

        const reminder = await Reminder.findOrCreate(
          userId,
          product._id,
          milestone.days,
          targetDate.toISOString(),
          title,
          description
        )
        if (reminder) created++
      }
    }

    const stats = await Reminder.getStats(userId)

    return res.json({ remindersCreated: created, stats })
  } catch (error) {
    return next(error)
  }
}
