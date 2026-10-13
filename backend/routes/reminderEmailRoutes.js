'use strict'

/**
 * Email reminder routes — manual send for a single reminder.
 *
 *   POST /api/reminders/email/send-test/:id → send one reminder now
 *
 * Protected: the reminder must belong to the authenticated user, so nobody can
 * trigger an email (or probe reminder ids) for another account.
 */

const { Router } = require('express')
const { param } = require('express-validator')

const validate = require('../middleware/validate')
const { protect, requireDb } = require('../middleware/authMiddleware')
const { sendTestReminder } = require('../controllers/reminderEmailController')

const router = Router()

router.post(
  '/send-test/:id',
  [param('id').isMongoId().withMessage('Invalid reminder id.')],
  validate,
  protect,
  requireDb,
  sendTestReminder,
)

module.exports = router
