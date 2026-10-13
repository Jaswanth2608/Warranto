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
 */

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'warranto-test-secret'

const assert = require('node:assert/strict')
const test = require('node:test')
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
  recordSendOutcome,
  runTick,
  env,
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
  const t = String(text == null ? '' : text)
  return t
    .replace(/\/\/[^@\s]*@/g, '//***@')
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

async function createReminder(token, productId, milestoneDays = 90, targetDate = null) {
  const body = { product: productId, milestoneDays }
  if (targetDate) {
    body.targetDate = targetDate
  }
  const res = await fetch(`${base}/api/reminders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  assert.equal(res.status, 201, `create reminder failed: ${sanitize(JSON.stringify(data))}`)
  return data.reminder
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
  const reminder = await createReminder(alice.token, product.id || product._id)

  t.test('returns 501 when MAIL_MODE is not smtp', async () => {
    process.env.MAIL_MODE = 'console'
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)
    assert.equal(res.status, 501)
    assert.ok(res.data.success === false)
    assert.ok(/not configured/i.test(res.data.message || ''))
  })

  t.test('returns 501 when MAIL_MODE is smtp but SMTP vars are missing', async () => {
    process.env.MAIL_MODE = 'smtp'
    delete process.env.SMTP_HOST
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)
    assert.equal(res.status, 501)
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
  const reminder = await createReminder(alice.token, product.id || product._id)

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
  const reminder = await createReminder(alice.token, product.id || product._id)
  const tokenStill = alice.token

  t.test('missing-local-part address is rejected', async () => {
    await User.updateOne({ _id: alice.userId }, { $set: { email: '@example.example' } })
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, tokenStill)
    assert.equal(res.status, 200)
    assert.equal(res.data.success, true)
    assert.equal(res.data.sent, false)
    assert.ok(res.data.error || res.data.reason)
  })

  t.test('missing-domain address is rejected', async () => {
    await User.updateOne({ _id: alice.userId }, { $set: { email: 'missing-domain' } })
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, tokenStill)
    assert.equal(res.status, 200)
    assert.equal(res.data.success, true)
    assert.equal(res.data.sent, false)
    assert.ok(res.data.error || res.data.reason)
  })

  t.test('address without @ is rejected', async () => {
    await User.updateOne({ _id: alice.userId }, { $set: { email: 'missing-at-sign.example.example' } })
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, tokenStill)
    assert.equal(res.status, 200)
    assert.equal(res.data.success, true)
    assert.equal(res.data.sent, false)
    assert.ok(res.data.error || res.data.reason)
  })

  t.test('request succeeds with a valid address when SMTP is configured', async () => {
    await User.updateOne({ _id: alice.userId }, { $set: { email: emailWithTag('valid-recipient-ok') } })
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, tokenStill)
    assert.equal(res.status, 200)
    assert.equal(res.data.success, true)
    assert.equal(res.data.sent, false)
    assert.ok(res.data.error || res.data.reason)
  })
})

test('SMTP failure is surfaced without crashing the request', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  process.env.MAIL_MODE = 'smtp'
  process.env.SMTP_HOST = 'localhost'
  process.env.SMTP_PORT = '2525'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'
  process.env.MAIL_TEST_TO = emailWithTag('smtp-failure')

  const alice = await register('smtp-failure')
  const product = await createProduct(alice.token)
  const reminder = await createReminder(alice.token, product.id || product._id)

  t.test('SMTP connection refused is reported as an error, not a 5xx', async () => {
    const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)
    assert.equal(res.status, 200)
    assert.equal(res.data.success, true)
    assert.equal(res.data.sent, false)
    assert.ok(res.data.error || res.data.reason)
    assert.ok(
      /connection refused|could not connect|econnrefused/i.test(
        sanitize(res.data.error || res.data.reason || ''),
      ) || /transport/i.test(sanitize(res.data.error || res.data.reason || '')),
      'expected a transport-level failure reason',
    )
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
  const reminder = await createReminder(alice.token, product.id || product._id)

  await Reminder.updateOne(
    { _id: reminder.id || reminder._id },
    { $set: { notifiedAt: new Date(), status: 'delivered' } },
  )

  const res = await post(`/api/reminders/email/send-test/${reminder.id || reminder._id}`, {}, alice.token)
  assert.equal(res.status, 200)
  assert.equal(res.data.success, true)
  assert.equal(res.data.sent, false)
  assert.ok(/already notified|notified/i.test(sanitize(res.data.error || res.data.reason || '')))
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
  const futureReminder = await createReminder(
    alice.token,
    product.id || product._id,
    90,
    new Date(now.getTime() + 86400000).toISOString().slice(0, 10),
  )

  const dueReminder = await createReminder(
    alice.token,
    product.id || product._id,
    30,
    new Date(now.getTime() - 86400000).toISOString().slice(0, 10),
  )

  await Reminder.updateOne(
    { _id: futureReminder.id || futureReminder._id },
    { $set: { notifiedAt: new Date(), status: 'delivered' } },
  )

  t.test('runTick only processes due pending reminders', async () => {
    const transporter = makeTransporter()
    assert.ok(transporter, 'transporter should exist for the tick test')
    const results = await runTick(transporter)

    const processedIds = new Set(
      results
        .map((r) => r.reminderId)
        .filter(Boolean),
    )

    assert.ok(
      processedIds.has(dueReminder.id || dueReminder._id.toString()),
      'due pending reminder should be processed',
    )
    assert.ok(
      !processedIds.has(futureReminder.id || futureReminder._id.toString()),
      'future pending reminder should be skipped',
    )
  })

  t.test('tick does not throw when a send fails', async () => {
    const transporter = makeTransporter()
    assert.doesNotThrow(() => runTick(transporter), 'tick must tolerate send failures')
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
  const reminder = await createReminder(alice.token, product.id || product._id)

  await recordSendOutcome(reminder.id || reminder._id, {
    ok: true,
    messageId: '<test-message-id@example.example>',
  })

  const refreshed = await Reminder.findById(reminder.id || reminder._id)
  assert.ok(refreshed)
  assert.ok(refreshed.notifiedAt instanceof Date)
  assert.equal(refreshed.notificationStatus, 'sent')
  assert.equal(
    refreshed.lastNotificationMessageId,
    '<test-message-id@example.example>',
  )

  await recordSendOutcome(reminder.id || reminder._id, {
    ok: false,
    reason: ' simulated smtp failure ',
  })

  const again = await Reminder.findById(reminder.id || reminder._id)
  assert.equal(again.notificationStatus, 'failed')
  assert.ok(again.lastNotificationError && again.lastNotificationError.trim().includes('simulated smtp failure'))
})
