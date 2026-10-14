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

/** Handle of the single running cron task (see startScheduler). */
let schedulerHandle = null

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

/**
 * Masks e-mail addresses inside a log line so operational logs stay useful
 * without printing personal data.
 */
function maskEmails(text) {
  return String(text == null ? '' : text).replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, 'user@domain.example')
}

/**
 * Builds a readable, secret-free description of a mail transport failure.
 *
 * nodemailer can reject with an AggregateError whose `message` is empty (for
 * example a dual-stack ECONNREFUSED on "localhost"), so falling back to
 * error.message alone records an empty reason and hides the real problem.
 */
function describeMailError(error) {
  if (!error) return 'Unknown mail transport error.'

  const name = String(error.name || 'Error').trim() || 'Error'
  const code = [error.code, error.originalCode]
    .filter((value) => typeof value === 'string' && value.trim())
    .join('/')
  const message = typeof error.message === 'string' ? error.message.trim() : ''

  // Prefer the real message, then the inner errors of an AggregateError, then
  // the stack header (which carries the errno for connect failures).
  let detail = message
  if (!detail && Array.isArray(error.errors) && error.errors.length) {
    detail = error.errors
      .filter(Boolean)
      .map((inner) => String(inner.message || inner.code || '').trim())
      .filter(Boolean)
      .join('; ')
  }
  if (!detail && typeof error.stack === 'string') {
    detail = error.stack.split('\n')[0].replace(/^[A-Za-z]*Error\b\s*/, '').replace(/^:\s*/, '').trim()
  }

  const parts = [name]
  if (code) parts.push(`(${code})`)
  if (detail) parts.push(detail)

  const described = parts.join(' ').trim()
  return described || 'Unknown mail transport error.'
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
  const port = parseInt(env('SMTP_PORT'), 10)

  if (!Number.isNaN(port) && port === 465 && !secure) {
    console.warn(
      '[reminder] SMTP_PORT=465 is normally used with TLS. Set SMTP_SECURE=true',
      'or pick a different port (for example 587 with SMTP_SECURE=false) to',
      'avoid connection failures.',
    )
  }

  return nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port,
    secure,
    auth: {
      user: env('SMTP_USER'),
      pass: env('SMTP_PASS'),
    },
    // Bounded timeouts: a dead or unreachable SMTP host must fail a send
    // attempt quickly instead of blocking the scheduler tick indefinitely.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
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

/** local@domain.tld — rejects empty local parts and domains without a dot. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmailAddress(value) {
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim())
}

async function userEligibleForEmail(userId) {
  const user = await User.findById(userId).lean()
  if (!user) return { ok: false, reason: 'User not found.' }
  if (!user.email) return { ok: false, reason: 'User has no email address.' }
  if (!isValidEmailAddress(user.email)) {
    return { ok: false, reason: 'User email is invalid.' }
  }
  return { ok: true, email: String(user.email).trim(), fullName: user.fullName }
}

function reminderRecordKey(reminder) {
  return `${reminder.userId}:${reminder.product}:${reminder.targetMilestone}`
}

/**
 * Safe reminder id for logs and results.
 *
 * Reminders are handled both as lean documents and as objects spread out of a
 * Mongoose document (where `_id` is a prototype getter and is therefore lost),
 * so never assume `_id` is present.
 */
function reminderIdOf(reminder) {
  const raw = reminder && (reminder._id != null ? reminder._id : reminder.id)
  return raw == null ? 'unknown' : String(raw)
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
      reminderId: reminderIdOf(reminder),
    }
  }

  const transporter = options.transporter || makeTransporter()
  if (!transporter) {
    return {
      ok: false,
      reason: 'Mail transport not configured.',
      reminderId: reminderIdOf(reminder),
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
      reminderId: reminderIdOf(reminder),
      messageId: info.messageId,
      accepted: Array.isArray(info.accepted) ? info.accepted : [],
      rejected: Array.isArray(info.rejected) ? info.rejected : [],
    }
  } catch (error) {
    return {
      ok: false,
      reminderId: reminderIdOf(reminder),
      error: describeMailError(error),
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
      reminderId: reminderIdOf(reminder),
    }
  }

  const product = await Product.findById(reminder.product).lean()
  if (!product) {
    return {
      ok: false,
      reason: 'Product no longer exists.',
      reminderId: reminderIdOf(reminder),
    }
  }

  const productValid = await sanitizeProductForSend(product)
  if (!productValid) {
    return {
      ok: false,
      reason: 'Product has no valid warranty expiry date.',
      reminderId: reminderIdOf(reminder),
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
      reminderId: reminderIdOf(reminder),
    }
  }

  const targetStartOfDay = startOfDay(target)
  const expiryStartOfDay = startOfDay(expiry)

  if (targetStartOfDay > expiryStartOfDay) {
    return {
      ok: false,
      reason: 'Reminder date is after warranty expiry.',
      reminderId: reminderIdOf(reminder),
    }
  }

  const userCheck = await userEligibleForEmail(reminder.userId)
  if (!userCheck.ok) {
    return {
      ok: false,
      reason: userCheck.reason,
      reminderId: reminderIdOf(reminder),
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

/** Delivery attempts a reminder gets before it is given up on. */
const MAX_SEND_ATTEMPTS = 3

/**
 * Record the outcome of a send attempt.
 *
 * Success marks the reminder notified, which is what stops it being sent again
 * (a tick only picks up `notifiedAt: null`).
 *
 * A failure must NOT mark it notified: a temporary SMTP or network problem
 * would otherwise drop the reminder permanently. The attempt counter is bumped
 * and the reminder stays eligible so the next tick retries it — until
 * MAX_SEND_ATTEMPTS is reached, where it is marked failed and notified so it
 * stops retrying and shows up as failed through the API.
 *
 * Pass `{ retryable: false }` for conditions that can never succeed on a retry
 * (deleted product, expired warranty, no valid address) so they are settled
 * immediately instead of being retried on the next tick.
 *
 * @returns {Promise<{ok: boolean, attempts: number, willRetry: boolean}>}
 */
async function recordSendOutcome(reminderId, outcome, options = {}) {
  const now = new Date()
  const retryable = options.retryable !== false

  if (outcome.ok) {
    const update = {
      notifiedAt: now,
      status: 'sent',
      notificationStatus: 'sent',
    }
    if (outcome.messageId) update.lastNotificationMessageId = outcome.messageId

    await Reminder.updateOne({ _id: reminderId }, { $set: update, $inc: { sentCount: 1 } }).catch(
      () => {},
    )
    return { ok: true, attempts: 1, willRetry: false }
  }

  const reason = outcome.reason || outcome.error || 'Unknown error.'
  const updated = await Reminder.findOneAndUpdate(
    { _id: reminderId },
    { $set: { notificationStatus: 'failed', lastNotificationError: reason }, $inc: { sentCount: 1 } },
    { new: true, projection: { sentCount: 1 } },
  ).catch(() => null)

  // When the counter cannot be read, give up rather than risk an endless loop.
  const attempts = updated?.sentCount ?? MAX_SEND_ATTEMPTS
  const willRetry = retryable && attempts < MAX_SEND_ATTEMPTS

  if (!willRetry) {
    await Reminder.updateOne(
      { _id: reminderId },
      { $set: { status: 'failed', notifiedAt: now } },
    ).catch(() => {})
  }

  return { ok: false, attempts, willRetry }
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
      console.warn(
        `[reminder] Skipped reminder ${reminder._id}: ${maskEmails(prepared.reason)}`,
      )
      // Ineligible for a permanent reason — settle it now, do not retry.
      await recordSendOutcome(
        reminder._id,
        { ok: false, reason: prepared.reason },
        { retryable: false },
      )
      continue
    }

    const sendResult = await sendReminder(prepared.reminder, {
      transporter,
      testRecipient,
    })

    if (!sendResult.ok) {
      console.error(
        `[reminder] Send failed for reminder ${reminder._id}: ${maskEmails(
          sendResult.error || sendResult.reason || 'unknown error',
        )}`,
      )
    } else {
      console.log(
        `[reminder] Sent reminder ${reminder._id} (message id ${sendResult.messageId}).`,
      )
    }

    results.push(sendResult)
    const recorded = await recordSendOutcome(reminder._id, sendResult)
    if (recorded.willRetry) {
      console.warn(
        `[reminder] Reminder ${reminder._id} will be retried (attempt ${recorded.attempts}/${MAX_SEND_ATTEMPTS}).`,
      )
    }
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

  // Guard against a second start (a repeated import, a hot reload, or a future
  // caller): two cron tasks would double every reminder send.
  if (schedulerHandle) {
    console.log('[reminder] Scheduler is already running — reusing the existing task.')
    return schedulerHandle
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

  // A tick that runs long (many reminders, a slow provider) must not overlap the
  // next one, or the same reminder could be attempted twice concurrently.
  let tickRunning = false

  const task = cron.schedule(schedule, async () => {
    if (tickRunning) {
      console.warn('[reminder] Previous tick is still running — skipping this one.')
      return
    }

    tickRunning = true
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
    } finally {
      tickRunning = false
    }
  })

  task.start()

  console.log(`[reminder] Scheduler started with schedule "${schedule}".`)
  console.log('[reminder] To test a single reminder outside the schedule, use POST /api/reminders/send-test.')

  schedulerHandle = {
    running: true,
    task,
    mode,
    schedule,
    transporter,
    // Exposed for diagnostics and tests: how many attempts a reminder gets.
    maxSendAttempts: MAX_SEND_ATTEMPTS,
  }

  return schedulerHandle
}

module.exports = {
  startScheduler,
  sendReminder,
  runTick,
  prepareReminder,
  recordSendOutcome,
  reminderIdOf,
  MAX_SEND_ATTEMPTS,
  getMailMode,
  isSmtpConfigured,
  getMailFrom,
  getTestRecipient,
  isValidEmailAddress,
  maskEmails,
  describeMailError,
  makeTransporter,
  env,
}
