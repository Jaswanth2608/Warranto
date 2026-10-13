'use strict'

const mongoose = require('mongoose')
const { sendReminder, prepareReminder, getMailMode, isSmtpConfigured, makeTransporter, env } = require('../lib/reminderScheduler')
const Reminder = require('../models/Reminder')
const { ApiError } = require('../middleware/errorMiddleware')

/**
 * POST /api/reminders/email/send-test/:id
 *
 * Sends a single reminder outside the scheduled job. Useful for verifying the
 * email provider is wired up correctly. It is still subject to the same
 * idempotency rules as the scheduler: a reminder that has already been notified
 * or that fails eligibility checks is not sent again.
 *
 * Requires authentication (see reminderEmailRoutes.js) and only ever looks at
 * the current user's reminders — a foreign or unknown id answers 404, so ids
 * cannot be probed and no one can send mail from another account.
 *
 * This endpoint is intentionally separate from the scheduled path so it cannot
 * be mistaken for production sends.
 */
exports.sendTestReminder = async (req, res, next) => {
  try {
    if (getMailMode() !== 'smtp' || !isSmtpConfigured()) {
      throw new ApiError(
        501,
        'Email reminders are not configured. Set MAIL_MODE=smtp and the SMTP_* variables in backend/.env, then restart the server.',
      )
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Invalid reminder id.')
    }

    const reminder = await Reminder.findOne({ _id: req.params.id, userId: req.user._id })
    if (!reminder) {
      throw new ApiError(404, 'Reminder not found.')
    }

    const outcome = await sendReminder(reminder, {
      transporter: makeTransporter(),
      testRecipient: env('MAIL_TEST_TO') || null,
    })

    return res.json({
      success: true,
      reminderId: outcome.reminderId,
      sent: outcome.ok,
      messageId: outcome.messageId || null,
      accepted: outcome.accepted || null,
      rejected: outcome.rejected || null,
      error: outcome.error || outcome.reason || null,
    })
  } catch (error) {
    next(error)
  }
}
