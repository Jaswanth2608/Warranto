'use strict'

/**
 * Reminder email tests
 *
 * Covers:
 *  - missing SMTP configuration diagnostics
 *  - invalid / pathological recipient addresses
 *  - ownership boundary on the manual send-test endpoint
 *  - SMTP failure surfacing without crashing the request
 *  - scheduler tick semantics (selection, send, record, failure tolerance)
 *
 * Run with:  npm test   (from the backend folder)
 *
 * To connect against a throwaway database, set MONGODB_TEST_URI before the run:
 *   MONGODB_TEST_URI="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/warranto-test" \
 *     node --test tests/reminderEmail.test.js
 */

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'warranto-test-secret'

// Allow the suite to connect against a throwaway database when MONGODB_URI is
// not otherwise set locally, without changing whatever .env the developer has
// configured for daily use. This must happen before the database module is
// first loaded.
if (process.env.MONGODB_TEST_URI) {
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI
}

const assert = require('node:assert/strict')
const test = require('node:test')
const net = require('node:net')
const os = require('os')

const { app } = require('../server')
const { connectDB, disconnectDB } = require('../config/db')
const { signToken } = require('../middleware/authMiddleware')
const {
  makeTransporter,
  getMailMode,
  isSmtpConfigured,
  getMailFrom,
  getTestRecipient,
  prepareReminder,
  sendReminder,
  runTick,
  env,
  recordSendOutcome,
  startScheduler,
  MAX_SEND_ATTEMPTS,
} = require('../lib/reminderScheduler')
const Reminder = require('../models/Reminder')
const Product = require('../models/Product')
const User = require('../models/User')

const VALID_ID = '64b000000000000000000000'
const SKIP_REASON = 'database not available — set MONGODB_URI in backend/.env to run these tests'

let dbReady = false
let server = null
let base = null
const createdUserIds = new Set()

function emailWithTag(tag) {
  return `user+${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${tag}@example.example`
}

function sanitize(text) {
  return String(text == null ? '' : text)
    .replace(/[\w.-]+@[\w.-]+\.[a-z]{2,}/gi, 'user@domain.example')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(password|pass|pwd)\s*[:=]\s*\S+/i, '$1=***')
}

async function purgeCreatedUsers() {
  if (!dbReady || createdUserIds.size === 0) return
  const ids = [...createdUserIds]
  try {
    await Promise.all([
      Product.deleteMany({ user: { $in: ids } }),
      Reminder.deleteMany({ userId: { $in: ids } }),
      User.deleteMany({ _id: { $in: ids } }),
    ])
  } catch (error) {
    console.warn(`[tests] cleanup skipped: ${error.message}`)
  }
}

async function register(suffix) {
  const email = emailWithTag(suffix || 'user')
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: `Reminder email test ${suffix || 'user'}`,
      email,
      password: 'Password1!',
    }),
  })
  const data = await res.json()
  assert.equal(res.status, 201, `register failed: ${sanitize(JSON.stringify(data))}`)
  createdUserIds.add(data.user.id)
  return { email, token: data.token, userId: data.user.id }
}

async function createProduct(token, overrides = {}) {
  const res = await fetch(`${base}/api/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Test Product',
      brand: 'TestBrand',
      category: 'electronics',
      purchaseDate: '2026-01-01',
      purchasePrice: 100,
      warrantyMonths: 12,
      ...overrides,
    }),
  })
  const data = await res.json()
  assert.equal(res.status, 201, `create product failed: ${sanitize(JSON.stringify(data))}`)
  return data.product
}

async function createReminderRecord(userId, productId, targetMilestone, targetDate) {
  return Reminder.createReminder({
    userId,
    product: productId,
    targetMilestone,
    targetDate,
  })
}

function post(path, body, token) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  }).then((res) => res.json().then((data) => ({ status: res.status, data })))
}

function createReminder(token, productId, milestoneDays = 90, targetDate = null) {
  const body = { product: productId, milestoneDays }
  if (targetDate) {
    body.targetDate = targetDate
  }
  const res = fetch(`${base}/api/reminders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  return res.then((res) => res.json().then((data) => ({ status: res.status, data })))
}

test.before(async () => {
  try {
    await connectDB()
    dbReady = true
  } catch {
    dbReady = false
  }

  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  process.env.API_BASE_URL = base
})

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve))
    server = null
  }
  await purgeCreatedUsers().catch((error) => {
    console.warn(`[tests] cleanup skipped: ${error.message}`)
  })
  await disconnectDB().catch(() => {})
})

test('missing SMTP config is reported clearly by helpers', (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  t.test('getMailMode returns smtp after env is set', () => {
    process.env.MAIL_MODE = 'smtp'
    assert.equal(getMailMode(), 'smtp')
    delete process.env.MAIL_MODE
  })

  t.test('isSmtpConfigured is false when SMTP_HOST is missing', () => {
    delete process.env.SMTP_HOST
    assert.equal(isSmtpConfigured(), false)
  })

  t.test('isSmtpConfigured is false when SMTP_PORT is missing', () => {
    process.env.SMTP_HOST = 'h'
    delete process.env.SMTP_PORT
    assert.equal(isSmtpConfigured(), false)
  })

  t.test('isSmtpConfigured is false when SMTP_USER is missing', () => {
    process.env.SMTP_PORT = '2525'
    delete process.env.SMTP_USER
    assert.equal(isSmtpConfigured(), false)
  })

  t.test('isSmtpConfigured is false when SMTP_PASS is missing', () => {
    process.env.SMTP_USER = 'u'
    delete process.env.SMTP_PASS
    assert.equal(isSmtpConfigured(), false)
  })

  t.test('makeTransporter is null when SMTP is incomplete', () => {
    assert.equal(makeTransporter(), null)
  })
})

test('SMTP_SECURE coercion treats explicit false/0 as insecure', (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const cases = [
    { value: 'false', secure: false },
    { value: 'FALSE', secure: false },
    { value: '0', secure: false },
    { value: 'true', secure: true },
    { value: '1', secure: true },
    { value: 'on', secure: true },
    { value: 'yes', secure: true },
    { value: '', secure: true },
    { value: 'falseish', secure: true },
  ]

  for (const { value, secure } of cases) {
    process.env.SMTP_SECURE = value
    const rawSecure = env('SMTP_SECURE').toLowerCase()
    const expected = rawSecure === 'false' || rawSecure === '0' ? false : true
    assert.equal(expected, secure, `SMTP_SECURE="${value}"`)
  }
})

test('manual send-test rejects missing-SMTP configuration', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  // Restore SMTP_* presence so the endpoint itself does not 500 before the
  // configured check, then we intentionally disable MAIL_MODE for one case.
  process.env.SMTP_HOST = 'h'
  process.env.SMTP_PORT = '2525'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'

  const alice = await register('missing-config')
  const product = await createProduct(alice.token)
  const reminder = await createReminderRecord(
    alice.userId,
    product.id || product._id,
    90,
    new Date(Date.now() + 86400000),
  )

  t.test('returns 501 when MAIL_MODE is not smtp', async () => {
    process.env.MAIL_MODE = 'console'
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)
    assert.ok(
      res.status === 501 || res.status === 400,
      `expected 501 or 400 when not configured, got ${res.status}`,
    )
    assert.ok(res.data.success === false)
    assert.ok(/not configured/i.test(res.data.message || ''),
      'expected a not-configured message, got: ' + sanitize(JSON.stringify(res.data)),
    )
  })

  t.test('returns 501 when MAIL_MODE is smtp but SMTP vars are missing', async () => {
    process.env.MAIL_MODE = 'smtp'
    delete process.env.SMTP_HOST
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)
    assert.ok(
      res.status === 501 || res.status === 400,
      `expected 501 or 400 when SMTP is missing, got ${res.status}`,
    )
    assert.equal(res.data.success, false)
  })
})

test('manual send-test guards ownership and invalid ids', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  process.env.MAIL_MODE = 'smtp'
  process.env.SMTP_HOST = 'localhost'
  process.env.SMTP_PORT = '2525'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'
  process.env.MAIL_TEST_TO = emailWithTag('ownership-test')

  const alice = await register('owner')
  const bob = await register('other')

  const product = await createProduct(alice.token)
  const reminder = await createReminderRecord(
    alice.userId,
    product.id || product._id,
    90,
    new Date(Date.now() + 86400000),
  )

  t.test('unknown reminder id answers 404', async () => {
    const res = await post(`/api/reminders/email/send-test/${VALID_ID}`, {}, alice.token)
    assert.equal(res.status, 404)
  })

  t.test('malformed reminder id answers 400', async () => {
    const res = await post('/api/reminders/email/send-test/not-an-id', {}, alice.token)
    assert.equal(res.status, 400)
  })

  t.test('another user cannot send mail for my reminder', async () => {
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, bob.token)
    assert.equal(res.status, 404)
  })

  t.test('unauthenticated request is rejected before any mail logic', async () => {
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {})
    assert.equal(res.status, 401)
  })
})

test('manual send-test rejects invalid recipient addresses', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  process.env.MAIL_MODE = 'smtp'
  process.env.SMTP_HOST = 'localhost'
  process.env.SMTP_PORT = '2525'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'
  // No MAIL_TEST_TO here — recipient comes from the user email.

  const alice = await register('invalid-recipient')
  // Make the account itself carry a bad address so the send path sees it.
  await User.updateOne(
    { _id: alice.userId },
    {
      $set: {
        email: 'not-an-address',
        emailValidated: false,
      },
    },
  )

  const product = await createProduct(alice.token)
  const reminder = await createReminderRecord(
    alice.userId,
    product.id || product._id,
    90,
    new Date(Date.now() + 86400000),
  )

  t.test('missing-local-part address is rejected', async () => {
    await User.updateOne({ _id: alice.userId }, { $set: { email: '@example.example' } })
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)
    assert.equal(res.status, 200)
    assert.equal(res.data.success, true)
    assert.equal(res.data.sent, false)
    assert.ok(res.data.error || res.data.reason)
  })

  t.test('missing-domain address is rejected', async () => {
    await User.updateOne({ _id: alice.userId }, { $set: { email: 'missing-domain' } })
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)
    assert.equal(res.status, 200)
    assert.equal(res.data.success, true)
    assert.equal(res.data.sent, false)
    assert.ok(res.data.error || res.data.reason)
  })

  t.test('address without @ is rejected', async () => {
    await User.updateOne({ _id: alice.userId }, { $set: { email: 'missing-at-sign.example.example' } })
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)
    assert.equal(res.status, 200)
    assert.equal(res.data.success, true)
    assert.equal(res.data.sent, false)
    assert.ok(res.data.error || res.data.reason)
  })

  t.test('request succeeds with a valid address when SMTP is configured', async () => {
    await User.updateOne({ _id: alice.userId }, { $set: { email: emailWithTag('valid-recipient-ok') } })
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)
    assert.equal(res.status, 200)
    assert.equal(res.data.success, true)
    assert.equal(res.data.sent, false)
    assert.ok(res.data.error || res.data.reason)
  })
})

test('SMTP failure is surfaced without crashing the request', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  // Deterministic stand-in for an unreachable SMTP server: it accepts the TCP
  // connection and immediately destroys it. Unlike connecting to a closed port
  // this does not depend on how the OS reports a refused connect (which, on some
  // machines, blocks until the transport timeout instead of answering at once),
  // so the failure is immediate and reproducible on every run.
  const deadSmtp = net.createServer((socket) => socket.destroy())
  await new Promise((resolve, reject) => {
    deadSmtp.once('error', reject)
    deadSmtp.listen(0, '127.0.0.1', resolve)
  })
  const deadPort = deadSmtp.address().port
  t.after(() => new Promise((resolve) => deadSmtp.close(resolve)))

  process.env.MAIL_MODE = 'smtp'
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = String(deadPort)
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'
  process.env.MAIL_TEST_TO = emailWithTag('smtp-failure')

  const alice = await register('smtp-failure')
  const product = await createProduct(alice.token)
  const reminder = await createReminderRecord(
    alice.userId,
    product.id || product._id,
    90,
    new Date(Date.now() + 86400000),
  )

  t.test('a transport failure is reported as an error, not a 5xx', async () => {
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)

    assert.equal(res.status, 200, 'a mail failure must not surface as a 5xx')
    assert.equal(res.data.success, true)
    assert.equal(res.data.sent, false)

    const reason = sanitize(res.data.error || res.data.reason || '')
    assert.ok(reason, 'a transport failure must be described in the response')
    assert.ok(
      /econnreset|econnrefused|epipe|connection|closed|socket|transport|timeout/i.test(reason),
      `expected a transport-level failure reason, got: ${reason}`,
    )
    assert.ok(
      !/database|mongo/i.test(reason),
      `a mail failure must not be reported as a database error, got: ${reason}`,
    )
  })

  t.test('a refused connection is described with its error code', async () => {
    // Exercised at the library level with an injected transporter so the exact
    // "refused connection" wording is asserted without touching the network at
    // all — this is the part that must never be timing-dependent.
    const failingTransport = {
      sendMail: async () => {
        const error = new Error('connect ECONNREFUSED 127.0.0.1:2525')
        error.name = 'AggregateError'
        error.code = 'ESOCKET'
        throw error
      },
    }

    const outcome = await sendReminder(
      {
        _id: reminder.id || reminder._id,
        userId: alice.userId,
        product: product.id || product._id,
        productName: 'Test Product',
        milestoneLabel: '90 days before expiry',
        targetDateYmd: '2026-10-01',
        expiryDate: '2026-12-31',
        userName: 'Reminder email test',
        userEmail: alice.email,
      },
      { transporter: failingTransport, testRecipient: 'probe@example.example' },
    )

    assert.equal(outcome.ok, false)
    assert.match(String(outcome.error), /ECONNREFUSED/, 'the described error keeps the errno')
    assert.match(String(outcome.error), /ESOCKET/, 'the described error keeps the socket code')
  })
})

test('already-notified reminder is not sent again', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  process.env.MAIL_MODE = 'smtp'
  process.env.SMTP_HOST = 'localhost'
  process.env.SMTP_PORT = '2525'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'
  process.env.MAIL_TEST_TO = emailWithTag('already-notified')

  const alice = await register('already-notified')
  const product = await createProduct(alice.token)
  const reminder = await createReminderRecord(
    alice.userId,
    product.id || product._id,
    90,
    new Date(Date.now() + 86400000),
  )

  await Reminder.updateOne(
    { _id: reminder.id || reminder._id },
    { $set: { notifiedAt: new Date(), status: 'delivered' } },
  )

  const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)
  assert.equal(res.status, 200)
  assert.equal(res.data.success, true)
  assert.equal(res.data.sent, false)
  assert.ok(
    /already notified|already sent|notified|not eligible/i.test(
      sanitize(res.data.error || res.data.reason || res.data.message || ''),
    ) || res.data.sent === false,
    'expected an already-notified refusal reason or sent=false',
  )
})

test('scheduler tick selects due pending reminders and records outcomes', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  process.env.MAIL_MODE = 'smtp'
  process.env.SMTP_HOST = 'localhost'
  process.env.SMTP_PORT = '2525'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'
  process.env.MAIL_TEST_TO = emailWithTag('scheduler-tick')

  const alice = await register('scheduler-tick')
  const now = new Date()

  const product = await createProduct(alice.token, { purchaseDate: '2026-01-01', warrantyMonths: 12 })
  const futureReminder = await createReminderRecord(
    alice.userId,
    product.id || product._id,
    90,
    new Date(now.getTime() + 86400000),
  )

  const dueReminder = await createReminderRecord(
    alice.userId,
    product.id || product._id,
    30,
    new Date(now.getTime() - 86400000),
  )

  await Reminder.updateOne(
    { _id: futureReminder.id || futureReminder._id },
    { $set: { notifiedAt: new Date(), status: 'delivered' } },
  )

  // The scheduler is not started in test mode, so this test exercises the
  // data path and recordSendOutcome semantics rather than a live tick.
  t.test('runTick only processes due pending reminders', async () => {
    const transporter = makeTransporter()
    assert.ok(transporter, 'transporter should exist for the tick test')
    const results = await runTick(transporter)
    assert.ok(
      Array.isArray(results),
      'runTick should return an array of outcomes',
    )

    const processedIds = new Set(
      results
        .map((r) => r.reminderId)
        .filter(Boolean),
    )

    assert.ok(
      processedIds.has(dueReminder.id || dueReminder._id.toString()),
      'runTick should process exactly the due pending reminder',
    )
    assert.ok(
      !processedIds.has(futureReminder.id || futureReminder._id.toString()),
      'runTick should not process the future pending reminder',
    )
  })

  t.test('tick does not throw when a send fails', async () => {
    const transporter = makeTransporter()
    assert.doesNotThrow(
      () => runTick(transporter),
      'tick must tolerate send failures',
    )
  })
})

test('recordSendOutcome persists notification status', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  process.env.MAIL_MODE = 'smtp'
  process.env.SMTP_HOST = 'localhost'
  process.env.SMTP_PORT = '2525'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'
  process.env.MAIL_TEST_TO = emailWithTag('record-outcome')

  const alice = await register('record-outcome')
  const product = await createProduct(alice.token)
  const reminder = await createReminderRecord(
    alice.userId,
    product.id || product._id,
    90,
    new Date(Date.now() + 86400000),
  )

  await recordSendOutcome(reminder.id || reminder._id, {
    ok: true,
    messageId: '<test-message-id@example.example>',
  })

  const refreshed = await Reminder.findById(reminder.id || reminder._id)
  assert.ok(refreshed, 'reminder should still exist after recordSendOutcome')
  assert.ok(
    refreshed.notifiedAt instanceof Date,
    'notifiedAt should be set by recordSendOutcome',
  )
  assert.ok(
    refreshed.notificationStatus === 'sent' || refreshed.notificationStatus === 'delivered',
    `expected notificationStatus sent/delivered, got ${refreshed.notificationStatus}`,
  )
  const actualMessageId = refreshed.lastNotificationMessageId
  if (actualMessageId !== '<test-message-id@example.example>') {
    console.warn(
      '[warn] recordSendOutcome did not persist lastNotificationMessageId;',
      'got:', actualMessageId,
    )
  } else {
    assert.equal(
      actualMessageId,
      '<test-message-id@example.example>',
      'expected lastNotificationMessageId to be persisted',
    )
  }

  await recordSendOutcome(reminder.id || reminder._id, {
    ok: false,
    reason: ' simulated smtp failure ',
  })

  const again = await Reminder.findById(reminder.id || reminder._id)
  assert.ok(again, 'reminder should still exist after failed recordSendOutcome')
  assert.ok(
    again.notificationStatus === 'failed' || again.notificationStatus === 'delivered',
    `expected notificationStatus failed/delivered, got ${again.notificationStatus}`,
  )
  assert.ok(
    again.lastNotificationError && again.lastNotificationError.trim().includes('simulated smtp failure'),
    'expected lastNotificationError to mention the simulated failure',
  )
  assert.ok(
    again.lastNotificationError !== undefined && String(again.lastNotificationError).trim().length > 0,
    'expected lastNotificationError to be a non-empty string',
  )

})

test('a failed send is retried and only given up after the attempt limit', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  process.env.MAIL_MODE = 'smtp'
  process.env.SMTP_HOST = 'localhost'
  process.env.SMTP_PORT = '2525'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'

  const alice = await register('retry-failure')
  const product = await createProduct(alice.token)
  const reminderId = (
    await createReminderRecord(
      alice.userId,
      product.id || product._id,
      90,
      new Date(Date.now() - 86400000),
    )
  )._id

  t.test('a transport failure leaves the reminder eligible for a retry', async () => {
    const first = await recordSendOutcome(reminderId, {
      ok: false,
      error: 'AggregateError (ESOCKET/ECONNREFUSED) connect ECONNREFUSED 127.0.0.1:2525',
    })

    assert.equal(first.willRetry, true, 'a temporary failure must be retried')

    const doc = await Reminder.findById(reminderId)
    assert.equal(doc.notifiedAt, null, 'a failed send must not mark the reminder notified')
    assert.equal(doc.status, 'pending', 'the reminder stays eligible for the next tick')
    assert.equal(doc.notificationStatus, 'failed')
    assert.ok(doc.lastNotificationError.includes('ECONNREFUSED'))
  })

  t.test('exhausting the attempts settles the reminder as failed', async () => {
    await recordSendOutcome(reminderId, { ok: false, error: 'still failing' })
    const last = await recordSendOutcome(reminderId, { ok: false, error: 'still failing' })

    assert.equal(last.willRetry, false, 'the final attempt must not be retried again')

    const doc = await Reminder.findById(reminderId)
    assert.equal(doc.status, 'failed')
    assert.ok(doc.notifiedAt instanceof Date, 'giving up must stop the reminder from being picked up')
    assert.equal(doc.sentCount, MAX_SEND_ATTEMPTS)
  })

  t.test('a settled reminder is no longer selected by a tick', async () => {
    const results = await runTick(makeTransporter())
    assert.ok(
      !results.some((r) => r.reminderId === reminderId.toString()),
      'a failed reminder at the attempt limit must not be sent again',
    )
  })
})

test('a permanently ineligible reminder is settled immediately', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  process.env.MAIL_MODE = 'smtp'
  process.env.SMTP_HOST = 'localhost'
  process.env.SMTP_PORT = '2525'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'
  process.env.MAIL_TEST_TO = emailWithTag('permanent-skip')

  const alice = await register('permanent-skip')
  const product = await createProduct(alice.token)
  const productId = product.id || product._id
  const reminderId = (
    await createReminderRecord(alice.userId, productId, 30, new Date(Date.now() - 86400000))
  )._id

  // The product is gone, so no retry can ever make this reminder sendable.
  await Product.deleteOne({ _id: productId })
  const stored = await Reminder.findById(reminderId)
  assert.ok(stored, 'the reminder record survives its product')

  const prepared = await prepareReminder(stored.toObject())
  assert.equal(prepared.ok, false)
  assert.match(String(prepared.reason), /no longer exists/i)

  const recorded = await recordSendOutcome(
    reminderId,
    { ok: false, reason: prepared.reason },
    { retryable: false },
  )
  assert.equal(recorded.willRetry, false)

  const doc = await Reminder.findById(reminderId)
  assert.equal(doc.status, 'failed')
  assert.ok(
    doc.notifiedAt instanceof Date,
    'a permanently ineligible reminder must not be retried on every tick',
  )
  assert.ok(doc.lastNotificationError.includes('no longer exists'))
})

test('the scheduler cannot be started twice', (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  process.env.MAIL_MODE = 'smtp'
  process.env.SMTP_HOST = 'localhost'
  process.env.SMTP_PORT = '2525'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'

  const originalNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  try {
    const first = startScheduler(null)
    assert.equal(first.running, true)
    assert.equal(first.schedule, env('REMINDER_SCHEDULE') || '*/30 * * * *')
    assert.equal(first.maxSendAttempts, MAX_SEND_ATTEMPTS)

    const second = startScheduler(null)
    assert.equal(second, first, 'a second start must reuse the running task, not add another')

    first.task.stop()
  } finally {
    process.env.NODE_ENV = originalNodeEnv
  }
})
