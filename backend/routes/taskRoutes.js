/**
 * Task routes — warranty action tasks, scoped to the authenticated user.
 *
 *   GET    /api/tasks              → list with optional filters
 *   GET    /api/tasks/:id          → single task
 *   POST   /api/tasks              → create a task
 *   PATCH  /api/tasks/:id          → update fields
 *   POST   /api/tasks/:id/complete → mark complete
 *   POST   /api/tasks/:id/reopen  → reopen a completed task
 *   DELETE /api/tasks/:id          → delete a task
 *
 * Validation → auth → database guard, so bad input answers 400 immediately
 * and unauthenticated requests answer 401.
 *
 * IMPORTANT: the legacy action-planner routes in routes/actionPlannerRoutes.js
 * use overlapping /api/tasks and /api/reminders paths on the root router.
 * They must stay mounted AFTER /api/tasks here so they can no-op or be removed
 * later without changing this file’s route order.
 */

const { Router } = require('express')
const { body, param } = require('express-validator')

const validate = require('../middleware/validate')
const { protect, requireDb } = require('../middleware/authMiddleware')
const taskController = require('../controllers/taskController')

const router = Router()

const idRule = param('id').isMongoId().withMessage('Invalid task id.')

const createRules = [
  body('product').isMongoId().withMessage('Invalid product id.'),
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Task title is required.')
    .bail()
    .isLength({ max: 200 })
    .withMessage('Task title must be 200 characters or fewer.'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Task description must be 2000 characters or fewer.'),
  body('dueDate')
    .notEmpty()
    .withMessage('Due date is required.')
    .bail()
    .isISO8601()
    .withMessage('Due date must be a valid date.')
    .bail()
    .custom((value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('Due date must be a valid calendar date (YYYY-MM-DD).')
      }
      return true
    }),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('priority must be one of: low, medium, high.'),
  body('source')
    .optional()
    .isIn(['custom', 'reminder'])
    .withMessage('Invalid source.'),
]

const updateRules = [
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Task title must be 200 characters or fewer.'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Task description must be 2000 characters or fewer.'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date.')
    .bail()
    .custom((value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('Due date must be a valid calendar date (YYYY-MM-DD).')
      }
      return true
    }),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('priority must be one of: low, medium, high.'),
]

router.get('/', protect, requireDb, taskController.listTasks)

router.get('/:id', [idRule], validate, protect, requireDb, taskController.getTask)

router.post('/', createRules, validate, protect, requireDb, taskController.createTask)

router.patch('/:id', [idRule, ...updateRules], validate, protect, requireDb, taskController.updateTask)

router.post('/:id/complete', [idRule], validate, protect, requireDb, taskController.completeTask)

router.post('/:id/reopen', [idRule], validate, protect, requireDb, taskController.reopenTask)

router.delete('/:id', [idRule], validate, protect, requireDb, taskController.deleteTask)

module.exports = router
