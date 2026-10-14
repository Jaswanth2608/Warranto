'use strict'

const mongoose = require('mongoose')
const {
  sendReminder,
  prepareReminder,
  getMailMode,
  isSmtpConfigured,
  makeTransporter,
  maskEmails,
  env,
} = require('../lib/reminderScheduler')
const Reminder = require('../models/Reminder')
const { ApiError } = require('../middleware/errorMiddleware')

/**
 * POST /api/reminders/email/send-test/:id
 *
 * Sends a single reminder outside the scheduled job. Useful for verifying the
 * email provider is wired up correctly. It is still subject to the same
 * eligibility rules as the scheduler (prepareReminder): a reminder that has
 * already been notified, whose product is gone, whose warranty has expired, or
 * whose owner has no valid e-mail address is refused with a reason rather than
 * being sent.
 *
 * A manual test send never marks the reminder as notified, so it cannot swallow
 * the real scheduled reminder.
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

    // Same eligibility gate as the scheduled path: never send for a deleted
    // product, an expired warranty, an already-notified reminder, or a user
    // without a valid address.
    const prepared = await prepareReminder(reminder)
    if (!prepared.ok) {
      console.warn(
        `[reminder] Manual send refused for reminder ${reminder._id}: ${maskEmails(prepared.reason)}`,
      )
      return res.json({
        success: true,
        reminderId: prepared.reminderId,
        sent: false,
        messageId: null,
        accepted: null,
        rejected: null,
        error: prepared.reason,
      })
    }

    const recipient = env('MAIL_TEST_TO') || prepared.reminder.userEmail
    const outcome = await sendReminder(prepared.reminder, {
      transporter: makeTransporter(),
      testRecipient: env('MAIL_TEST_TO') || null,
    })

    if (outcome.ok) {
      console.log(
        `[reminder] Manual test e-mail accepted for reminder ${reminder._id} → ${maskEmails(recipient)}`,
      )
    } else {
      console.error(
        `[reminder] Manual test e-mail failed for reminder ${reminder._id}: ${maskEmails(
          outcome.error || outcome.reason || 'unknown error',
        )}`,
      )
    }

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
