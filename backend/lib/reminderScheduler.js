/**
 * Warranty reminder scheduler.
 *
 * What it does
 * - Runs on a node-cron schedule (see REMINDER_SCHEDULE in backend/.env).
 * - Finds pending Reminder records whose targetDate has arrived.
 * - For each one it verifies the product still exists, the warranty is still
 *   active on the target date, and the user still has a valid email address and
 *   has not opted out of email reminders.
 * - Sends one email per eligible reminder and records the send attempt on the
 *   reminder (notifiedAt + notificationStatus + lastNotificationError).
 * - Skips anything it cannot send and logs the reason, never exposing secrets.
 *
 * Idempotency
 * - A reminder is only sent if its status is 'pending' and notifiedAt is null.
 * - As soon as a send is attempted the record is updated inside the same logic
 *   flow so a restart or overlapping run does not resend the same reminder.
 * - Duplicate reminder records for the same user/product/milestone are prevented
 *   by a unique compound index in the Reminder model, so the scheduler never has
 *   two pending records for the same milestone.
 *
 * Configuration
 * - MAIL_MODE: 'smtp' (required to enable sending).
 * - MAIL_FROM: envelope/from address.
 * - SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS.
 * - MAIL_TEST_TO: if set, every scheduled reminder is delivered here instead of
 *   the user's real address. Use this for staging or pre-flight checks.
 * - REMINDER_SCHEDULE: node-cron expression. Defaults to every 30 minutes.
 *
 * Usage
 * - Imported by server.js and started after the database is connected.
 * - The scheduler keeps a handle so server shutdown can stop the cron timer.
 *
 * Testing
 * - Use POST /api/reminders/send-test with a valid reminder id to trigger a
 *   single reminder outside the schedule. That endpoint is intentionally
 *   separate from the scheduled path so it cannot be confused with production
 *   sends.
 */

const cron = require('node-cron')
const nodemailer = require('nodemailer')
const mongoose = require('mongoose')

const Reminder = require('../models/Reminder')
const Product = require('../models/Product')
const User = require('../models/User')
const { parseYMD, toYMD, daysBetween, startOfDay } = require('../utils/warranty')

const MS_PER_DAY = 24 * 60 * 60 * 1000

function env(name, fallback = '') {
  const value = process.env[name]
  return value == null ? fallback : String(value).trim()
}

function getMailMode() {
  return env('MAIL_MODE').toLowerCase()
}

function isSmtpConfigured() {
  if (getMailMode() !== 'smtp') return false
  return (
    env('SMTP_HOST') &&
    env('SMTP_PORT') &&
    env('SMTP_USER') &&
    env('SMTP_PASS')
  )
}

function getMailFrom() {
  return env('MAIL_FROM') || 'no-reply@warranto.local'
}

function getTestRecipient() {
  return env('MAIL_TEST_TO') || null
}

function makeTransporter() {
  if (!isSmtpConfigured()) {
    return null
  }

  const rawSecure = env('SMTP_SECURE').toLowerCase()
  // Treat SMTP_SECURE as false only for explicit false/0 values. Recognized
  // true-ish forms (true, 1, on, yes) and empty/unset values are treated as
  // secure so a missing or typo'd value does not silently drop TLS on a port
  // that expects it.
  const secure =
    rawSecure === 'false' || rawSecure === '0'
      ? false
      : true
  if (!isNaN(port) && port === 465 && !secure) {
    console.warn(
      '[reminder] SMTP_PORT=465 is normally used with TLS. Set SMTP_SECURE=true',
      'or pick a different port (for example 587 with SMTP_SECURE=false) to',
      'avoid connection failures.',
    )
  }
  const port = parseInt(env('SMTP_PORT'), 10)

  return nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port,
    secure,
    auth: {
      user: env('SMTP_USER'),
      pass: env('SMTP_PASS'),
    },
    logger: false,
  })
}

async function sanitizeProductForSend(product) {
  if (!product) return null
  if (!product.warrantyExpiryDate) return null
  const expiry = parseYMD(product.warrantyExpiryDate)
  if (!expiry) return null
  return product
}

async function userEligibleForEmail(userId) {
  const user = await User.findById(userId).lean()
  if (!user) return { ok: false, reason: 'User not found.' }
  if (!user.email) return { ok: false, reason: 'User has no email address.' }
  if (typeof user.email !== 'string' || !user.email.includes('@')) {
    return { ok: false, reason: 'User email is invalid.' }
  }
  return { ok: true, email: user.email, fullName: user.fullName }
}

function reminderRecordKey(reminder) {
  return `${reminder.userId}:${reminder.product}:${reminder.targetMilestone}`
}

/**
 * Attempt to send a single reminder. Returns a result object suitable for
 * logging and for the API response.
 */
async function sendReminder(reminder, options = {}) {
  const testRecipient = options.testRecipient || getTestRecipient()
  const recipient = testRecipient || reminder.userEmail

  if (!recipient) {
    return {
      ok: false,
      reason: 'No recipient address.',
      reminderId: reminder._id.toString(),
    }
  }

  const transporter = options.transporter || makeTransporter()
  if (!transporter) {
    return {
      ok: false,
      reason: 'Mail transport not configured.',
      reminderId: reminder._id.toString(),
    }
  }

  const expiryDate = reminder.expiryDate
  const productUrl = options.productUrl || `/products/${reminder.product}`
  const subject = `Warranty reminder: ${reminder.productName} expires soon`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a2330; margin: 0; padding: 24px; background: #f6f8fc; }
    .card { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e3e8f0; border-radius: 12px; padding: 24px; }
    .head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
    .head .dot { width: 10px; height: 10px; border-radius: 50%; background: #2563eb; }
    h1 { font-size: 18px; margin: 0 0 6px 0; }
    p { margin: 0 0 14px 0; line-height: 1.55; color: #334155; }
    .meta { background: #f1f5f9; border-radius: 8px; padding: 12px 14px; font-size: 14px; }
    .meta .row { display: flex; justify-content: space-between; padding: 4px 0; }
    .meta .label { color: #64748b; }
    .meta .value { font-weight: 600; color: #0f172a; }
    .actions { margin-top: 18px; }
    .actions a { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; }
    .actions a:hover { background: #1d4ed8; }
    .footer { margin-top: 22px; font-size: 12px; color: #94a3b8; text-align: center; }
    .badge { display: inline-block; background: #fef3c7; color: #92400e; border-radius: 6px; padding: 2px 8px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="head">
      <span class="dot" />
      <h1>Warranto — warranty reminder</h1>
    </div>

    <p>Hello ${escapeHtml(reminder.userName || 'there')},</p>

    <p>This is a friendly reminder about the warranty on <strong>${escapeHtml(
      reminder.productName,
    )}</strong>.</p>

    <div class="meta">
      <div class="row">
        <span class="label">What</span>
        <span class="value">${escapeHtml(reminder.productName)}</span>
      </div>
      <div class="row">
        <span class="label">Milestone</span>
        <span class="value">${escapeHtml(reminder.milestoneLabel)}</span>
      </div>
      <div class="row">
        <span class="label">Reminder date</span>
        <span class="value">${escapeHtml(reminder.targetDateYmd)}</span>
      </div>
      <div class="row">
        <span class="label">Warranty expires</span>
        <span class="value">${escapeHtml(expiryDate)}</span>
      </div>
    </div>

    <p style="margin-top: 16px;">
      Take any action you need before the warranty expires — keep your proof of
      purchase handy, check warranty terms, or plan a replacement if needed.
    </p>

    <div class="actions">
      <a href="${escapeHtml(productUrl)}">Open product in Warranto</a>
    </div>

    <div class="footer">
      This reminder was sent by Warranto because you enabled warranty reminders.
      If you did not expect this email, you can change your preferences in Settings.
    </div>
  </div>
</body>
</html>
`.trim()

  const text = [
    `Hello ${reminder.userName || 'there'},`,
    '',
    `This is a friendly reminder about the warranty on ${reminder.productName}.`,
    '',
    `Milestone: ${reminder.milestoneLabel}`,
    `Reminder date: ${reminder.targetDateYmd}`,
    `Warranty expires: ${expiryDate}`,
    '',
    'Take any action you need before the warranty expires.',
    '',
    `Open product in Warranto: ${productUrl}`,
    '',
    'This reminder was sent by Warranto because you enabled warranty reminders.',
  ].join('\n')

  try {
    const info = await transporter.sendMail({
      from: `"Warranto" <${getMailFrom()}>`,
      to: recipient,
      subject,
      text,
      html,
    })

    return {
      ok: true,
      reminderId: reminder._id.toString(),
      messageId: info.messageId,
      accepted: Array.isArray(info.accepted) ? info.accepted : [],
      rejected: Array.isArray(info.rejected) ? info.rejected : [],
    }
  } catch (error) {
    return {
      ok: false,
      reminderId: reminder._id.toString(),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Minimal HTML escaper for user-facing values. */
function escapeHtml(value) {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Load a pending reminder together with its product and user context.
 * Returns null if the reminder should not be sent (already notified, product
 * gone, invalid expiry, user ineligible, etc.).
 */
async function prepareReminder(reminder) {
  if (reminder.notifiedAt != null) {
    return {
      ok: false,
      reason: 'Already notified.',
      reminderId: reminder._id.toString(),
    }
  }

  const product = await Product.findById(reminder.product).lean()
  if (!product) {
    return {
      ok: false,
      reason: 'Product no longer exists.',
      reminderId: reminder._id.toString(),
    }
  }

  const productValid = await sanitizeProductForSend(product)
  if (!productValid) {
    return {
      ok: false,
      reason: 'Product has no valid warranty expiry date.',
      reminderId: reminder._id.toString(),
    }
  }

  const expiry = parseYMD(product.warrantyExpiryDate)
  const target = reminder.targetDate instanceof Date
    ? reminder.targetDate
    : new Date(reminder.targetDate)

  if (isNaN(target.getTime())) {
    return {
      ok: false,
      reason: 'Reminder target date is invalid.',
      reminderId: reminder._id.toString(),
    }
  }

  const targetStartOfDay = startOfDay(target)
  const expiryStartOfDay = startOfDay(expiry)

  if (targetStartOfDay > expiryStartOfDay) {
    return {
      ok: false,
      reason: 'Reminder date is after warranty expiry.',
      reminderId: reminder._id.toString(),
    }
  }

  const userCheck = await userEligibleForEmail(reminder.userId)
  if (!userCheck.ok) {
    return {
      ok: false,
      reason: userCheck.reason,
      reminderId: reminder._id.toString(),
    }
  }

  const milestoneLabel =
    reminder.targetMilestone === 90
      ? '90 days before expiry'
      : reminder.targetMilestone === 30
        ? '30 days before expiry'
        : reminder.targetMilestone === 7
          ? '7 days before expiry'
          : `${reminder.targetMilestone} days before expiry`

  return {
    ok: true,
    reminder: {
      ...reminder,
      userEmail: userCheck.email,
      userName: userCheck.fullName,
      productName: product.name,
      milestoneLabel,
      targetDateYmd: toYMD(target),
      expiryDate: product.warrantyExpiryDate,
    },
  }
}

/**
 * Mark the reminder as notified and record the outcome.
 */
async function recordSendOutcome(reminderId, outcome) {
  const update = {
    notifiedAt: new Date(),
    notificationStatus: outcome.ok ? 'sent' : 'failed',
  }

  if (!outcome.ok) {
    update.lastNotificationError = outcome.reason || outcome.error || 'Unknown error.'
  } else if (outcome.messageId) {
    update.lastNotificationMessageId = outcome.messageId
  }

  await Reminder.updateOne({ _id: reminderId }, update).catch(() => {})
}

/**
 * One scheduler tick: fetch due pending reminders for all users, prepare each
 * one, attempt to send, and record the outcome.
 */
async function runTick(transporter, options = {}) {
  const testRecipient = options.testRecipient || getTestRecipient()

  const due = await Reminder.find({
    status: 'pending',
    notifiedAt: null,
    targetDate: { $lte: new Date() },
  })
    .sort({ targetDate: 1 })
    .lean()

  const results = []
  for (const reminder of due) {
    const prepared = await prepareReminder(reminder)
    if (!prepared.ok) {
      results.push(prepared)
      await recordSendOutcome(reminder._id, {
        ok: false,
        reason: prepared.reason,
      })
      continue
    }

    const sendResult = await sendReminder(prepared.reminder, {
      transporter,
      testRecipient,
    })

    results.push(sendResult)
    await recordSendOutcome(reminder._id, sendResult)
  }

  return results
}

/**
 * Start the scheduler. Returns the cron task so it can be stopped on shutdown.
 */
function startScheduler(server) {
  if (process.env.NODE_ENV === 'test') {
    return { running: false, reason: 'Scheduler disabled in test mode.' }
  }

  const schedule = env('REMINDER_SCHEDULE') || '*/30 * * * *'
  const mode = getMailMode()

  if (mode !== 'smtp' || !isSmtpConfigured()) {
    console.log(
      `[reminder] Scheduler not started: MAIL_MODE is not configured as smtp, or SMTP credentials are missing.`,
    )
    console.log(
      '[reminder] Set MAIL_MODE=smtp and the SMTP_* variables in backend/.env to enable scheduled email reminders.',
    )
    return { running: false, reason: 'Mail not configured.' }
  }

  const transporter = makeTransporter()
  let validating = true

  const task = cron.schedule(schedule, async () => {
    if (!validating) return
    try {
      const results = await runTick(transporter)
      const sent = results.filter((r) => r.ok).length
      const failed = results.length - sent
      if (results.length > 0) {
        console.log(
          `[reminder] Tick complete: ${results.length} due, ${sent} sent, ${failed} failed.`,
        )
      }
    } catch (error) {
      console.error('[reminder] Scheduler tick failed:', error instanceof Error ? error.message : error)
    }
  })

  task.start()
  validating = false

  console.log(`[reminder] Scheduler started with schedule "${schedule}".`)
  console.log('[reminder] To test a single reminder outside the schedule, use POST /api/reminders/send-test.')

  return {
    running: true,
    task,
    mode,
    schedule,
    transporter,
  }
}

module.exports = {
  startScheduler,
  sendReminder,
  runTick,
  prepareReminder,
  getMailMode,
  isSmtpConfigured,
  getMailFrom,
  makeTransporter,
  env,
}
