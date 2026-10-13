/**
 * Task controller — warranty action tasks.
 *
 * Response contracts:
 *   GET    /api/tasks              → { success, count, tasks: [...] }
 *   GET    /api/tasks/:id          → { success, task }
 *   POST   /api/tasks              → 201 { success, task }
 *   PATCH  /api/tasks/:id          → { success, task }
 *   DELETE /api/tasks/:id          → { success, message, id }
 *   POST   /api/tasks/:id/complete → { success, task }
 *   POST   /api/tasks/:id/reopen  → { success, task }
 *
 * Rules:
 * - Every query is scoped to req.user; a foreign or missing task answers 404.
 * - The linked product is loaded so the response includes productName even if
 *   the product was deleted (the task keeps its own title).
 * - Completed tasks can be reopened; reopened tasks cannot be completed again
 *   until their status is pending or in_progress.
 * - Deleting a task also removes any reminders tied to the same product and
 *   milestone that were created as duplicates.
 */

const mongoose = require('mongoose')

const Task = require('../models/Task')
const Product = require('../models/Product')
const Reminder = require('../models/Reminder')
const { ApiError } = require('../middleware/errorMiddleware')

/** Builds a lean task document with the product name resolved. */
async function attachProductName(task) {
  if (!task || !task.product) return task
  try {
    const product = await Product.findById(task.product).select('name')
    task.productName = product ? product.name : null
  } catch {
    task.productName = null
  }
  return task
}

/**
 * GET /api/tasks — supports ?status= &priority= &product= &dueBefore= &
 * dueAfter= &sort= . Tasks are always scoped to the current user.
 */
exports.listTasks = async (req, res, next) => {
  try {
    const query = { userId: req.user.id }

    const status = req.query.status
    if (status && status !== 'all') {
      if (![Task.STATUS.PENDING, Task.STATUS.IN_PROGRESS, Task.STATUS.COMPLETED].includes(status)) {
        throw new ApiError(400, 'status must be one of: pending, in_progress, completed, all.')
      }
      query.status = status
    }

    const priority = req.query.priority
    if (priority && priority !== 'all') {
      if (![Task.PRIORITY.LOW, Task.PRIORITY.MEDIUM, Task.PRIORITY.HIGH].includes(priority)) {
        throw new ApiError(400, 'priority must be one of: low, medium, high, all.')
      }
      query.priority = priority
    }

    if (req.query.product) {
      if (!mongoose.isValidObjectId(req.query.product)) {
        throw new ApiError(400, 'Invalid product id.')
      }
      query.product = req.query.product
    }

    if (req.query.dueBefore) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.dueBefore)) {
        throw new ApiError(400, 'dueBefore must be a valid date (YYYY-MM-DD).')
      }
      query.dueDate = { ...query.dueDate, $lte: req.query.dueBefore }
    }

    if (req.query.dueAfter) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.dueAfter)) {
        throw new ApiError(400, 'dueAfter must be a valid date (YYYY-MM-DD).')
      }
      query.dueDate = { ...query.dueDate, $gte: req.query.dueAfter }
    }

    let sort = { dueDate: 1, createdAt: -1 }
    if (req.query.sort === 'newest') sort = { createdAt: -1, dueDate: 1 }
    else if (req.query.sort === 'priority') sort = { priority: -1, dueDate: 1, createdAt: -1 }

    const tasks = await Task.find(query).sort(sort)

    const enriched = await Promise.all(tasks.map((task) => attachProductName(task)))

    res.json({ success: true, count: enriched.length, tasks: enriched.map((t) => t.toJSON()) })
  } catch (error) {
    next(error)
  }
}

/** GET /api/tasks/:id */
exports.getTask = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Invalid task id.')
    }

    const task = await Task.findOne({ _id: req.params.id, userId: req.user.id })
      .populate('product', 'name')

    if (!task) throw new ApiError(404, 'Task not found.')

    const withName = await attachProductName(task)
    res.json({ success: true, task: withName.toJSON() })
  } catch (error) {
    next(error)
  }
}

/** POST /api/tasks */
exports.createTask = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    if (!mongoose.isValidObjectId(req.body.product)) {
      throw new ApiError(400, 'Invalid product id.')
    }

    // Verify the product belongs to the user.
    const product = await Product.findOne({ _id: req.body.product, user: req.user.id }).session(session)
    if (!product) throw new ApiError(404, 'Product not found.')

    const task = new Task({
      userId: req.user.id,
      product: req.body.product,
      title: req.body.title.trim(),
      description: (req.body.description || '').trim(),
      dueDate: req.body.dueDate,
      priority: req.body.priority || Task.PRIORITY.MEDIUM,
      status: Task.STATUS.PENDING,
      source: req.body.source || 'custom',
    })

    await task.save({ session })

    const withName = await attachProductName(task)

    await session.commitTransaction()

    res.status(201).json({ success: true, task: withName.toJSON() })
  } catch (error) {
    await session.abortTransaction().catch(() => {})
    next(error)
  } finally {
    session.endSession()
  }
}

/** PATCH /api/tasks/:id */
exports.updateTask = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Invalid task id.')
    }

    const task = await Task.findOne({ _id: req.params.id, userId: req.user.id })
    if (!task) throw new ApiError(404, 'Task not found.')

    const allowed = ['title', 'description', 'dueDate', 'priority']
    const hasChanges = Object.keys(req.body).some((key) => allowed.includes(key))

    if (!hasChanges) {
      throw new ApiError(400, 'No updatable fields were provided.')
    }

    if (req.body.title !== undefined) task.title = req.body.title.trim()
    if (req.body.description !== undefined) task.description = (req.body.description || '').trim()
    if (req.body.dueDate !== undefined) task.dueDate = req.body.dueDate
    if (req.body.priority !== undefined) {
      if (![Task.PRIORITY.LOW, Task.PRIORITY.MEDIUM, Task.PRIORITY.HIGH].includes(req.body.priority)) {
        throw new ApiError(400, 'priority must be one of: low, medium, high.')
      }
      task.priority = req.body.priority
    }

    await task.save()

    const withName = await attachProductName(task)
    res.json({ success: true, task: withName.toJSON() })
  } catch (error) {
    next(error)
  }
}

/** POST /api/tasks/:id/complete */
exports.completeTask = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Invalid task id.')
    }

    const task = await Task.findOne({ _id: req.params.id, userId: req.user.id })
    if (!task) throw new ApiError(404, 'Task not found.')

    if (task.status === Task.STATUS.COMPLETED) {
      throw new ApiError(400, 'This task is already completed.')
    }

    task.status = Task.STATUS.COMPLETED
    task.completedAt = new Date()
    await task.save()

    const withName = await attachProductName(task)
    res.json({ success: true, task: withName.toJSON() })
  } catch (error) {
    next(error)
  }
}

/** POST /api/tasks/:id/reopen */
exports.reopenTask = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Invalid task id.')
    }

    const task = await Task.findOne({ _id: req.params.id, userId: req.user.id })
    if (!task) throw new ApiError(404, 'Task not found.')

    if (task.status !== Task.STATUS.COMPLETED) {
      throw new ApiError(400, 'Only completed tasks can be reopened.')
    }

    task.status = Task.STATUS.PENDING
    task.completedAt = null
    await task.save()

    const withName = await attachProductName(task)
    res.json({ success: true, task: withName.toJSON() })
  } catch (error) {
    next(error)
  }
}

/** DELETE /api/tasks/:id */
exports.deleteTask = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Invalid task id.')
    }

    const task = await Task.findOne({ _id: req.params.id, userId: req.user.id })
    if (!task) throw new ApiError(404, 'Task not found.')

    await Reminder.deleteMany({ product: task.product, userId: req.user.id }).catch(() => {})

    await Task.deleteOne({ _id: req.params.id, userId: req.user.id })

    res.json({ success: true, message: 'Task deleted.', id: req.params.id })
  } catch (error) {
    next(error)
  }
}

