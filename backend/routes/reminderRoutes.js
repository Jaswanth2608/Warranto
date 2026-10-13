'use strict'

const { Router } = require('express')
const { body, param } = require('express-validator')

const validate = require('../middleware/validate')
const { protect, requireDb } = require('../middleware/authMiddleware')
const reminderController = require('../controllers/reminderController')
const Reminder = require('../models/Reminder')

const router = Router()

const milestoneValues = Reminder.MILESTONES.map((m) => m.days)

const milestoneRules = body('milestoneDays', 'milestoneDays is required')
  .notEmpty().withMessage('milestoneDays is required.')
  .custom((value) => {
    const num = Number(value)
    if (isNaN(num)) {
      throw new Error('milestoneDays must be a number.')
    }
    if (!milestoneValues.includes(num)) {
      throw new Error(`milestoneDays must be one of: ${milestoneValues.join(', ')}.`)
    }
    return true
  })

const idRule = param('id').isMongoId().withMessage('Invalid reminder id.')

router.get('/', protect, requireDb, reminderController.listReminders)

router.get('/milestones', protect, requireDb, reminderController.getMilestones)

router.get('/:id', [idRule], validate, protect, requireDb, reminderController.getReminder)

router.post(
  '/',
  [body('product').isMongoId().withMessage('Invalid product id.'), milestoneRules],
  validate,
  protect,
  requireDb,
  reminderController.createReminder,
)

router.delete('/:id', [idRule], validate, protect, requireDb, reminderController.deleteReminder)

module.exports = router
