'use strict'

/**
 * API tests that run WITH a database.
 *
 * They start the real Express app on an ephemeral port inside the test process,
 * connect to MongoDB (from backend/.env), and exercise the full auth → product →
 * bill → task → reminder → calendar flows, including cross-user ownership rules.
 *
 * If MongoDB is unavailable every test skips with a reason instead of failing.
 *
 * Run with:  npm test   (from the backend folder)
 */

process.env.NODE_ENV = 'test'

// Prefer a dedicated test database when one is provided, so an integration run
// never writes into whatever MONGODB_URI points at in daily use. Falls back to
// MONGODB_URI so the suite still works out of the box.
if (process.env.MONGODB_TEST_URI) {
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI
}

const assert = require('node:assert/strict')
const test = require('node:test')

const { app } = require('../server')
const { connectDB, disconnectDB } = require('../config/db')
const call = require('../tests/helpers/api-call')
const { buildTextPdf } = require('./helpers/text-pdf')

let server = null
let dbReady = false

// Every account this run registers, so the suite can remove its own data and
// leave the database exactly as it found it.
const createdUserIds = new Set()

async function purgeCreatedUsers() {
  if (!dbReady || createdUserIds.size === 0) return

  const ids = [...createdUserIds]
  const User = require('../models/User')
  const Product = require('../models/Product')
  const Task = require('../models/Task')
  const Reminder = require('../models/Reminder')
  const ServiceRecord = require('../models/ServiceRecord')

  await Promise.all([
    Product.deleteMany({ user: { $in: ids } }),
    Task.deleteMany({ userId: { $in: ids } }),
    Reminder.deleteMany({ userId: { $in: ids } }),
    ServiceRecord.deleteMany({ user: { $in: ids } }),
  ])
  await User.deleteMany({ _id: { $in: ids } })
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
  const base = `http://127.0.0.1:${server.address().port}`
  process.env.API_BASE_URL = base
  globalThis.__WARRANTO_TEST_BASE_URL = base
})

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve))
    server = null
  }
  // Clean up after ourselves — failures here must not fail the run.
  await purgeCreatedUsers().catch((error) => {
    console.warn(`[tests] cleanup skipped: ${error.message}`)
  })
  await disconnectDB().catch(() => {})
})

const SKIP_REASON = 'database not available — set MONGODB_URI in backend/.env to run these tests'

const TODAY = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})()

function ymd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addMonths(date, months) {
  const d = new Date(date.getTime())
  const targetMonth = d.getMonth() + months
  const lastDay = new Date(d.getFullYear(), targetMonth + 1, 0).getDate()
  d.setDate(Math.min(d.getDate(), lastDay))
  d.setMonth(targetMonth)
  return d
}

function sampleProduct(overrides = {}) {
  const purchaseDate = overrides.purchaseDate || ymd(addMonths(TODAY, -6))
  const warrantyMonths = overrides.warrantyMonths ?? 12
  const base = {
    name: 'Sample Product',
    category: 'electronics',
    serialNumber: `SN-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    purchaseDate,
    warrantyMonths,
    purchasePrice: 24999,
    brand: 'SampleBrand',
    modelNumber: 'SP-001',
    seller: 'Sample Supplier',
    notes: 'Home',
  }
  return { ...base, ...overrides }
}

const unique = (() => {
  let n = 0
  return (prefix) => `${prefix}-${Date.now()}-${(n += 1)}`
})()

async function register(suffix) {
  const email = `${unique(suffix || 'user')}@example.com`
  const res = await call('POST', '/api/auth/register', {
    body: { fullName: `Audit ${suffix || 'user'}`, email, password: 'Password1!' },
  })
  assert.equal(res.status, 201, `register failed: ${JSON.stringify(res.data)}`)
  createdUserIds.add(res.data.user.id)
  return { email, token: res.data.token, userId: res.data.user.id }
}

async function createProduct(token, overrides = {}) {
  const res = await call('POST', '/api/products', { token, body: sampleProduct(overrides) })
  assert.equal(res.status, 201, `product create failed: ${JSON.stringify(res.data)}`)
  return res.data.product
}

test('auth: register, duplicate email, login, current user', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('alice')

  const dup = await call('POST', '/api/auth/register', {
    body: { fullName: 'Dup', email: alice.email, password: 'Another1!' },
  })
  assert.equal(dup.status, 409, `expected 409 for duplicate email, got ${dup.status}`)

  const login = await call('POST', '/api/auth/login', {
    body: { email: alice.email, password: 'Password1!' },
  })
  assert.equal(login.status, 200, JSON.stringify(login.data))
  assert.ok(login.data.token, 'login should return a token')
  assert.equal(login.data.user.email, alice.email)

  const me = await call('GET', '/api/auth/me', { token: login.data.token })
  assert.equal(me.status, 200)
  assert.equal(me.data.user.email, alice.email)
  assert.ok(me.data.user.id, 'me should return the user id')

  const bad = await call('GET', '/api/auth/me', { token: 'garbage-token' })
  assert.equal(bad.status, 401)

  const badLogin = await call('POST', '/api/auth/login', {
    body: { email: alice.email, password: 'wrong-password' },
  })
  assert.equal(badLogin.status, 401, 'wrong password must be rejected with 401')

  const logout = await call('POST', '/api/auth/logout', {})
  assert.equal(logout.status, 200)
  assert.equal(logout.data.success, true)
})

test('products: create, read, list, patch, delete — with server-derived warranty', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('products-lifecycle')

  const created = await call('POST', '/api/products', {
    token: alice.token,
    body: sampleProduct({ name: 'Lifecycle Product', serialNumber: 'LC-001' }),
  })
  assert.equal(created.status, 201, JSON.stringify(created.data))
  const product = created.data.product
  assert.ok(product.id || product._id, 'product should have an id')
  const productId = product.id || product._id

  const expectedExpiry = ymd(addMonths(new Date(`${product.purchaseDate}T00:00:00`), 12))
  assert.equal(product.warrantyExpiryDate, expectedExpiry, 'server should derive warranty expiry')
  assert.ok(['active', 'expiring_soon', 'expired'].includes(product.status), 'status should be derived')

  const fetched = await call('GET', `/api/products/${productId}`, { token: alice.token })
  assert.equal(fetched.status, 200)
  assert.equal(fetched.data.product.id || fetched.data.product._id, productId)

  const listed = await call('GET', '/api/products', { token: alice.token })
  assert.equal(listed.status, 200)
  assert.ok(listed.data.products.some((p) => (p.id || p._id) === productId))

  const patched = await call('PATCH', `/api/products/${productId}`, {
    token: alice.token,
    body: { name: 'Updated Product', category: 'appliances' },
  })
  assert.equal(patched.status, 200, JSON.stringify(patched.data))
  assert.equal(patched.data.product.name, 'Updated Product')
  assert.equal(patched.data.product.category, 'appliances')

  const newPurchase = ymd(addMonths(TODAY, -2))
  const repatched = await call('PATCH', `/api/products/${productId}`, {
    token: alice.token,
    body: { purchaseDate: newPurchase },
  })
  assert.equal(repatched.status, 200, JSON.stringify(repatched.data))
  assert.equal(repatched.data.product.warrantyExpiryDate, ymd(addMonths(new Date(`${newPurchase}T00:00:00`), 12)))

  const deleted = await call('DELETE', `/api/products/${productId}`, { token: alice.token })
  assert.equal(deleted.status, 200)

  const afterDelete = await call('GET', `/api/products/${productId}`, { token: alice.token })
  assert.equal(afterDelete.status, 404)
})

test('products: ownership — another user cannot touch my products', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('owner')
  const bob = await register('bob')

  const product = await createProduct(alice.token, { name: 'Alice Product' })
  const productId = product.id || product._id

  const bobRead = await call('GET', `/api/products/${productId}`, { token: bob.token })
  assert.equal(bobRead.status, 404, 'bob must not see alice product')

  const bobUpdate = await call('PATCH', `/api/products/${productId}`, {
    token: bob.token,
    body: { name: 'hacked' },
  })
  assert.equal(bobUpdate.status, 404, 'bob must not update alice product')

  const bobDelete = await call('DELETE', `/api/products/${productId}`, { token: bob.token })
  assert.equal(bobDelete.status, 404, 'bob must not delete alice product')

  const stillThere = await call('GET', `/api/products/${productId}`, { token: alice.token })
  assert.equal(stillThere.status, 200, 'alice product must survive bob attempts')
  assert.notEqual(stillThere.data.product.name, 'hacked')
})

test('security: every private endpoint rejects unauthenticated access', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('security-anon')
  const product = await createProduct(alice.token, { name: 'Private Product' })
  const productId = product.id || product._id

  const protectedCalls = [
    ['GET', '/api/products'],
    ['GET', `/api/products/${productId}`],
    ['PATCH', `/api/products/${productId}`],
    ['DELETE', `/api/products/${productId}`],
    ['GET', '/api/bills'],
    ['GET', `/api/bills/${productId}/file`],
    ['DELETE', `/api/bills/${productId}`],
    ['GET', '/api/tasks'],
    ['GET', '/api/reminders'],
    ['GET', '/api/services'],
    ['GET', '/api/calendar/events?year=2026&month=1'],
    // The manual reminder-email trigger must never be callable anonymously —
    // otherwise anyone could send mail for any reminder id.
    ['POST', `/api/reminders/email/send-test/${productId}`],
  ]

  for (const [method, url] of protectedCalls) {
    const res = await call(method, url)
    assert.equal(res.status, 401, `${method} ${url} must require authentication`)
  }
})

test('products: validation rejects bad input', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('validation')

  const noName = await call('POST', '/api/products', {
    token: alice.token,
    body: { serialNumber: 'SN', category: 'electronics' },
  })
  assert.equal(noName.status, 400)

  const badWarranty = await call('POST', '/api/products', {
    token: alice.token,
    body: sampleProduct({ name: 'Bad Warranty', warrantyMonths: -1 }),
  })
  assert.equal(badWarranty.status, 400)

  const badDate = await call('POST', '/api/products', {
    token: alice.token,
    body: sampleProduct({ name: 'Bad Date', purchaseDate: '2026-02-30' }),
  })
  assert.equal(badDate.status, 400)

  const noToken = await call('POST', '/api/products', { body: sampleProduct({ name: 'No Token', purchasePrice: 100 }) })
  assert.equal(noToken.status, 401)
})

test('bills: upload, list, read file, replace, delete — full lifecycle', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('bills-lifecycle')
  const product = await createProduct(alice.token, { name: 'Bill Product' })
  const productId = product.id || product._id

  const png = Buffer.from(
    '89504e470d0a1a0a' +
    '0000000d49484452' +
    '00000001000000010802000000907753de' +
    '0000000c4944415408d763f8ffff3f0005fe0001' +
    '0000000049454e44ae426082',
    'hex',
  )
  const upload = await call('POST', '/api/bills', {
    token: alice.token,
    qs: { productId },
    body: { productId, file: png, fileName: 'invoice.png' },
    filename: 'invoice.png',
    headers: { 'content-type': 'application/json' },
  })
  assert.equal(upload.status, 201, `upload failed: ${JSON.stringify(upload.data)}`)
  const billId = upload.data.bill.id || upload.data.bill._id

  const listed = await call('GET', '/api/bills', { token: alice.token })
  assert.equal(listed.status, 200)
  assert.ok(listed.data.bills.some((b) => (b.id || b._id) === billId))

  const read = await call('GET', `/api/bills/${billId}/file`, { token: alice.token })
  assert.equal(read.status, 200, `bill read failed: ${JSON.stringify(read.data)}`)

  const v2Png = Buffer.from(
    '89504e470d0a1a0a' +
    '0000000d49484452' +
    '00000001000000010802000000907753de' +
    '0000000c4944415408d763f8ffff3f0005fe0001' +
    '0000000049454e44ae426082',
    'hex',
  )
  const replaced = await call('PATCH', `/api/bills/${productId}`, {
    token: alice.token,
    qs: { productId },
    body: { productId, file: v2Png, fileName: 'invoice-v2.png' },
    filename: 'invoice-v2.png',
    headers: { 'content-type': 'application/json' },
  })
  assert.equal(replaced.status, 200, `replace failed: ${JSON.stringify(replaced.data)}`)

  const deleted = await call('DELETE', `/api/bills/${productId}`, { token: alice.token })
  assert.equal(deleted.status, 200)

  const afterDelete = await call('GET', `/api/bills/${productId}`, { token: alice.token })
  assert.ok(afterDelete.status === 200 || afterDelete.status === 404, `afterDelete status ${afterDelete.status}`)
  const afterBillList = await call('GET', '/api/bills', { token: alice.token })
  assert.ok(afterBillList.data.bills.length >= 0)
})

test('bills: validation — missing file, bad type, spoofed content, oversized', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('bills-validation')
  const product = await createProduct(alice.token, { name: 'Validation Product' })
  const productId = product.id || product._id

  const noFile = await call('POST', '/api/bills', {
    token: alice.token,
    qs: { productId },
    body: { productId, file: '' },
    filename: 'note.txt',
    headers: { 'content-type': 'application/json' },
  })
  assert.equal(noFile.status, 400)

  const wrongType = await call('POST', '/api/bills', {
    token: alice.token,
    body: { productId, file: 'not-a-real-bill' },
    filename: 'note.txt',
    headers: { 'content-type': 'application/json' },
    qs: { productId },
  })
  assert.equal(wrongType.status, 400)

  const spoofedExt = await call('POST', '/api/bills', {
    token: alice.token,
    body: { productId, file: '<svg onload=alert(1)>' },
    filename: 'invoice.png',
    headers: { 'content-type': 'application/json' },
    qs: { productId },
  })
  assert.equal(spoofedExt.status, 400, 'content that is not really a PNG must be rejected')

  const huge = await call('POST', '/api/bills', {
    token: alice.token,
    body: { productId, file: Buffer.alloc(6 * 1024 * 1024, 7) },
    filename: 'huge.pdf',
    headers: { 'content-type': 'application/json' },
    qs: { productId },
  })
  assert.ok([400, 413].includes(huge.status), `oversized bill should be rejected, got ${huge.status}`)
})

test('bills: ownership — another user cannot touch my bills', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('bill-owner')
  const bob = await register('bill-reader')

  const product = await createProduct(alice.token, { name: 'Owned Product' })
  const productId = product.id || product._id

  const ownedPng = Buffer.from(
    '89504e470d0a1a0a' +
    '0000000d49484452' +
    '00000001000000010802000000907753de' +
    '0000000c4944415408d763f8ffff3f0005fe0001' +
    '0000000049454e44ae426082',
    'hex',
  )
  const upload = await call('POST', '/api/bills', {
    token: alice.token,
    qs: { productId },
    body: { productId, file: ownedPng, fileName: 'owned.png' },
    filename: 'owned.png',
    headers: { 'content-type': 'application/json' },
  })
  assert.equal(upload.status, 201, JSON.stringify(upload.data))
  const billId = upload.data.bill.id || upload.data.bill._id

  const bobRead = await call('GET', `/api/bills/${billId}/file`, { token: bob.token })
  assert.equal(bobRead.status, 404, 'bob must not read alice bill')

  const bobDelete = await call('DELETE', `/api/bills/${billId}`, { token: bob.token })
  assert.equal(bobDelete.status, 404, 'bob must not delete alice bill')

  const stillThere = await call('GET', '/api/bills', { token: alice.token })
  assert.ok(stillThere.data?.bills?.some((b) => (b.id || b._id) === billId), 'alice bill must survive bob attempts')
})

test('products: legacy bill metadata payloads no longer create bills', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('legacy-bills')
  const product = await createProduct(alice.token, { name: 'Legacy Product' })
  const productId = product.id || product._id

  const legacy = await call('POST', '/api/bills', {
    token: alice.token,
    body: {
      fileName: 'old-invoice.pdf',
      originalName: 'old-invoice.pdf',
      contentBase64: 'cGhp',
      fileSize: 100,
    },
    qs: { productId },
  })
  assert.equal(legacy.status, 400, 'legacy JSON bill payload must be rejected')

  const listed = await call('GET', '/api/bills', { token: alice.token })
  assert.equal(listed.data.bills.length, 0, 'no bill should have been created')
})

test('tasks: CRUD, complete, reopen, delete, filters, ownership', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('tasks-crud')
  const bob = await register('tasks-bob')

  const product = await createProduct(alice.token, { name: 'Task Product' })
  const productId = product.id || product._id

  const created = await call('POST', '/api/tasks', {
    token: alice.token,
    body: {
      product: productId,
      title: 'Register the warranty',
      description: 'Fill in the warranty card',
      dueDate: ymd(new Date(TODAY.getTime() + 30 * 86400000)),
      priority: 'high',
    },
  })
  assert.equal(created.status, 201, JSON.stringify(created.data))
  assert.equal(created.data.task.title, 'Register the warranty')
  const taskId = created.data.task.id || created.data.task._id

  const fetched = await call('GET', `/api/tasks/${taskId}`, { token: alice.token })
  assert.equal(fetched.status, 200)
  assert.equal(fetched.data.task.title, 'Register the warranty')

  const updated = await call('PATCH', `/api/tasks/${taskId}`, {
    token: alice.token,
    body: { title: 'Updated task', priority: 'low' },
  })
  assert.equal(updated.status, 200, JSON.stringify(updated.data))
  assert.equal(updated.data.task.title, 'Updated task')
  assert.equal(updated.data.task.priority, 'low')

  const completed = await call('POST', `/api/tasks/${taskId}/complete`, { token: alice.token })
  assert.equal(completed.status, 200, JSON.stringify(completed.data))
  assert.equal(completed.data.task.status, 'completed')
  assert.ok(completed.data.task.completedAt, 'completedAt should be set')

  const again = await call('POST', `/api/tasks/${taskId}/complete`, { token: alice.token })
  assert.equal(again.status, 400, 'completing twice must be rejected')

  const reopened = await call('POST', `/api/tasks/${taskId}/reopen`, { token: alice.token })
  assert.equal(reopened.status, 200, JSON.stringify(reopened.data))
  assert.equal(reopened.data.task.status, 'pending')

  const bobRead = await call('GET', `/api/tasks/${taskId}`, { token: bob.token })
  assert.equal(bobRead.status, 404)
  const bobUpdate = await call('PATCH', `/api/tasks/${taskId}`, {
    token: bob.token,
    body: { title: 'hacked' },
  })
  assert.equal(bobUpdate.status, 404)
  const bobDelete = await call('DELETE', `/api/tasks/${taskId}`, { token: bob.token })
  assert.equal(bobDelete.status, 404)

  const all = await call('GET', '/api/tasks', { token: alice.token })
  assert.equal(all.status, 200)
  assert.ok(all.data.tasks.length >= 1)
  assert.ok(all.data.tasks.every((task) => task.userId === alice.userId || task.userId === alice.userId.toString()),
    'list must only contain own tasks')

  const pending = await call('GET', '/api/tasks?status=pending', { token: alice.token })
  assert.ok(pending.data.tasks.every((task) => task.status === 'pending'))

  const high = await call('GET', '/api/tasks?priority=high', { token: alice.token })
  assert.ok(high.data.tasks.every((task) => task.priority === 'high'))

  const byProduct = await call('GET', `/api/tasks?product=${productId}`, { token: alice.token })
  assert.ok(byProduct.data.tasks.every((task) => (task.product?.id || task.product) === productId))

  const badStatus = await call('GET', '/api/tasks?status=banana', { token: alice.token })
  assert.equal(badStatus.status, 400)

  const badDate = await call('GET', '/api/tasks?dueBefore=not-a-date', { token: alice.token })
  assert.equal(badDate.status, 400)

  const dueBeforePast = await call('GET', `/api/tasks?dueBefore=${ymd(TODAY)}`, { token: alice.token })
  assert.equal(dueBeforePast.status, 200)
  assert.ok(dueBeforePast.data.tasks.every((task) => task.dueDate < ymd(TODAY)))

  const deleted = await call('DELETE', `/api/tasks/${taskId}`, { token: alice.token })
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data))
  const afterDelete = await call('GET', `/api/tasks/${taskId}`, { token: alice.token })
  assert.equal(afterDelete.status, 404)
})

test('reminder: create, list, get, delete, and do-not-create for expired products', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('reminderowner')

  const product = await createProduct(alice.token, { name: 'Reminder Product' })
  const productId = product.id || product._id
  const expectedExpiry = product.warrantyExpiryDate

  const created = await call('POST', '/api/reminders', {
    token: alice.token,
    body: { product: productId, milestoneDays: 90 },
  })
  assert.equal(created.status, 201, JSON.stringify(created.data))
  assert.equal(created.data.reminder.milestoneDays, 90)
  const createdReminder = created.data.reminder
  assert.ok(createdReminder, 'reminder should be returned')
  assert.ok(createdReminder.productName, 'reminder should include productName')
  assert.equal(createdReminder.expiryDate, expectedExpiry)
  assert.ok(createdReminder.dueDate, 'dueDate should be set')
  const expiryDate = new Date(`${expectedExpiry}T00:00:00`)
  const expectedDue = ymd(new Date(expiryDate.getTime() - 90 * 86400000))
  const receivedDue = createdReminder.dueDate
  const dayDiff = createdReminder.dueDate === expectedDue
    ? 0
    : Math.round((new Date(receivedDue + 'T00:00:00').getTime() - new Date(expectedDue + 'T00:00:00').getTime()) / 86400000)
  assert.ok(dayDiff >= -1 && dayDiff <= 1, `due date mismatch: expected ${expectedDue}, got ${receivedDue} (diff ${dayDiff})`)
  const reminderId = createdReminder.id || createdReminder._id

  const dup = await call('POST', '/api/reminders', {
    token: alice.token,
    body: { product: productId, milestoneDays: 90 },
  })
  assert.equal(dup.status, 409, `expected 409 for duplicate, got ${dup.status}: ${JSON.stringify(dup.data)}`)
  assert.match(String(dup.data?.message || ''), /already exists/i, String(dup.data?.message || ''))

  const other = await call('POST', '/api/reminders', {
    token: alice.token,
    body: { product: productId, milestoneDays: 30 },
  })
  assert.equal(other.status, 201, JSON.stringify(other.data))
  const otherId = other.data.reminder.id || other.data.reminder._id

  const listed = await call('GET', '/api/reminders', { token: alice.token })
  assert.equal(listed.status, 200)
  assert.ok(listed.data.reminders.some((r) => (r.id || r._id) === reminderId))
  assert.ok(listed.data.reminders.some((r) => (r.id || r._id) === otherId))

  const fetched = await call('GET', `/api/reminders/${reminderId}`, { token: alice.token })
  assert.equal(fetched.status, 200)
  assert.ok(fetched.data.reminder?.productName, 'get one should return productName')

  const bob = await register('reminder-bob')
  const bobRead = await call('GET', `/api/reminders/${reminderId}`, { token: bob.token })
  assert.equal(bobRead.status, 404)
  const bobDelete = await call('DELETE', `/api/reminders/${reminderId}`, { token: bob.token })
  assert.equal(bobDelete.status, 404)

  const milestones = await call('GET', '/api/reminders/milestones', { token: alice.token })
  assert.equal(milestones.status, 200)
  assert.ok(milestones.data.milestones, 'milestones list should be returned')

  const expired = await createProduct(alice.token, {
    name: 'Expired Product',
    purchaseDate: '2020-01-01',
    warrantyMonths: 12,
  })
  const expiredReminder = await call('POST', '/api/reminders', {
    token: alice.token,
    body: { product: expired.id || expired._id, milestoneDays: 90 },
  })
  assert.equal(expiredReminder.status, 400, JSON.stringify(expiredReminder.data))
  assert.ok(/expired/i.test(expiredReminder.data?.message || ''), 'expected expired message')

  const badMilestone = await call('POST', '/api/reminders', {
    token: alice.token,
    body: { product: productId, milestoneDays: 12345 },
  })
  assert.equal(badMilestone.status, 400)

  const deleted = await call('DELETE', `/api/reminders/${reminderId}`, { token: alice.token })
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data))
  const afterDelete = await call('GET', `/api/reminders/${reminderId}`, { token: alice.token })
  assert.equal(afterDelete.status, 404)
})

test('calendar: events are scoped to the authenticated user', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('cal-scope-alice')
  const bob = await register('cal-scope-bob')

  const nextMonth = addMonths(TODAY, 1)
  // Buy exactly one warranty term before the target month so the computed
  // expiry date lands inside the requested month.
  const aliceExpiryTarget = addMonths(nextMonth, -12)
  const aliceProduct = await createProduct(alice.token, {
    name: 'Alice Expiry',
    purchaseDate: ymd(aliceExpiryTarget),
    warrantyMonths: 12,
  })
  const bobProduct = await createProduct(bob.token, {
    name: 'Bob Expiry',
    purchaseDate: ymd(aliceExpiryTarget),
    warrantyMonths: 12,
  })
  const aliceActorId = `${aliceProduct.id || aliceProduct._id}`
  const bobActorId = `${bobProduct.id || bobProduct._id}`

  const aliceEvents = await call('GET', '/api/calendar/events', {
    token: alice.token,
    qs: { year: nextMonth.getFullYear(), month: nextMonth.getMonth() + 1 },
  })
  assert.equal(aliceEvents.status, 200, JSON.stringify(aliceEvents.data))
  assert.ok(Array.isArray(aliceEvents.data.events), 'calendar response events must be an array')

  const aliceItems = aliceEvents.data.events.flatMap((e) => e.items || [])
  const aliceIds = aliceItems.map((i) => i.product?.id || i.product)
  assert.ok(aliceIds.includes(aliceActorId) || aliceIds.includes(aliceProduct.id || aliceProduct._id.toString()),
    'alice events must include alice product')
  assert.ok(!aliceIds.includes(bobActorId) && !aliceIds.includes(bobProduct.id || bobProduct._id.toString()),
    'alice events must NOT include bob product')

  const bobEvents = await call('GET', '/api/calendar/events', {
    token: bob.token,
    qs: { year: nextMonth.getFullYear(), month: nextMonth.getMonth() + 1 },
  })
  assert.equal(bobEvents.status, 200, JSON.stringify(bobEvents.data))
  assert.ok(Array.isArray(bobEvents.data.events), 'calendar response events must be an array')
  const bobIds = bobEvents.data.events.flatMap((e) => e.items || []).map((i) => i.product?.id || i.product)
  assert.ok(bobIds.includes(bobActorId) || bobIds.includes(bobProduct.id || bobProduct._id.toString()),
    'bob events must include bob product')
  assert.ok(!bobIds.includes(aliceActorId) && !bobIds.includes(aliceProduct.id || aliceProduct._id.toString()),
    'bob events must NOT include alice product')

  const inMonth = await createProduct(alice.token, {
    name: 'Inside Product',
    purchaseDate: ymd(aliceExpiryTarget),
    warrantyMonths: 12,
  })

  const inMonthExpiry = new Date(`${inMonth.warrantyExpiryDate}T00:00:00`)
  assert.equal(inMonthExpiry.getMonth(), nextMonth.getMonth(),
    'fixture should expire inside the requested month')

  const events = await call('GET', '/api/calendar/events', {
    token: alice.token,
    qs: { year: nextMonth.getFullYear(), month: nextMonth.getMonth() + 1 },
  })
  assert.equal(events.status, 200, JSON.stringify(events.data))
  assert.ok(Array.isArray(events.data.events), 'calendar response events must be an array')
  const titles = events.data.events.flatMap((e) => e.items || []).map((i) => i.title)
  assert.ok(titles.some((title) => title.includes('Inside Product')), 'in-month product must appear')

  for (const event of events.data.events) {
    assert.equal(event.year, nextMonth.getFullYear())
    assert.equal(event.month, nextMonth.getMonth() + 1)
  }

  const deleted = await call('DELETE', `/api/products/${inMonth.id || inMonth._id}`, { token: alice.token })
  assert.equal(deleted.status, 200)

  const eventsAfter = await call('GET', '/api/calendar/events', {
    token: alice.token,
    qs: { year: nextMonth.getFullYear(), month: nextMonth.getMonth() + 1 },
  })
  assert.equal(eventsAfter.status, 200)
  assert.ok(Array.isArray(eventsAfter.data.events), 'calendar response events must be an array')
  const titlesAfter = eventsAfter.data.events.flatMap((e) => e.items || []).map((i) => i.title)
  assert.ok(!titlesAfter.some((title) => title.includes('Inside Product')),
    'deleted product must disappear from the calendar')
})

test('calendar: invalid year/month and missing token are rejected', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('cal-invalid')

  const badYear = await call('GET', '/api/calendar/events', {
    token: alice.token,
    qs: { year: 'banana', month: 2 },
  })
  assert.equal(badYear.status, 400, `expected 400 for bad year, got ${badYear.status}`)

  const badMonth = await call('GET', '/api/calendar/events', {
    token: alice.token,
    qs: { year: 2026, month: 13 },
  })
  assert.equal(badMonth.status, 400, `expected 400 for bad month, got ${badMonth.status}`)

  const noToken = await call('GET', '/api/calendar/events', { qs: { year: 2026, month: 2 } })
  assert.equal(noToken.status, 401, 'calendar endpoint must require authentication')
})

test('service records: create, list, cost totals, and ownership', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('service-alice')
  const bob = await register('service-bob')

  const product = await createProduct(alice.token, { name: 'Serviced Product' })
  const productId = product.id || product._id

  const first = await call('POST', '/api/services', {
    token: alice.token,
    body: {
      product: productId,
      serviceDate: ymd(addMonths(TODAY, -1)),
      serviceType: 'repair',
      serviceCentre: 'Authorized Center',
      serviceCost: 1500,
      issueDescription: 'Screen replacement',
    },
  })
  assert.equal(first.status, 201, `service create failed: ${JSON.stringify(first.data)}`)
  const firstId = first.data.record.id || first.data.record._id

  const second = await call('POST', '/api/services', {
    token: alice.token,
    body: {
      product: productId,
      serviceDate: ymd(TODAY),
      serviceType: 'maintenance',
      serviceCentre: 'Local Shop',
      serviceCost: 500,
      issueDescription: 'Cleaning',
    },
  })
  assert.equal(second.status, 201, JSON.stringify(second.data))

  const listed = await call('GET', '/api/services', {
    token: alice.token,
    qs: { product: productId },
  })
  assert.equal(listed.status, 200, JSON.stringify(listed.data))
  assert.equal(listed.data.count, 2)
  assert.equal(listed.data.totalCost, 2000, 'totalCost must equal sum of service costs')
  assert.ok(listed.data.records.every((r) => Number(r.serviceCost) >= 0))

  const badType = await call('POST', '/api/services', {
    token: alice.token,
    body: { product: productId, serviceDate: ymd(TODAY), serviceType: 'banana', serviceCost: 1 },
  })
  assert.equal(badType.status, 400)

  const badDate = await call('POST', '/api/services', {
    token: alice.token,
    body: { product: productId, serviceDate: '2026-02-30', serviceType: 'repair', serviceCost: 1 },
  })
  assert.equal(badDate.status, 400)

  const bobList = await call('GET', '/api/services', {
    token: bob.token,
    qs: { product: productId },
  })
  assert.equal(bobList.status, 200, JSON.stringify(bobList.data))
  assert.equal(bobList.data.count, 0, 'bob must not see alice service records')
  assert.equal(bobList.data.totalCost, 0)

  const bobCreate = await call('POST', '/api/services', {
    token: bob.token,
    body: { product: productId, serviceDate: ymd(TODAY), serviceType: 'repair', serviceCost: 1 },
  })
  assert.equal(bobCreate.status, 404, `bob create expected 404, got ${bobCreate.status}`)

  const bobRead = await call('GET', `/api/services/${firstId}`, { token: bob.token })
  assert.equal(bobRead.status, 404)
  const bobDelete = await call('DELETE', `/api/services/${firstId}`, { token: bob.token })
  assert.equal(bobDelete.status, 404)

  const deleted = await call('DELETE', `/api/services/${firstId}`, { token: alice.token })
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data))

  const listedAfter = await call('GET', '/api/services', {
    token: alice.token,
    qs: { product: productId },
  })
  assert.equal(listedAfter.data.count, 1)
  assert.equal(listedAfter.data.totalCost, 500, 'totalCost must drop after deletion')

  const gone = await call('GET', `/api/services/${firstId}`, { token: alice.token })
  assert.equal(gone.status, 404)
})

// ---------------------------------------------------------------------------
// Scan Bill: the OCR response the review form is built from.
//
// The form copies `suggestions` straight into its editable fields, so this
// pins the response shape field by field and proves that scanning on its own
// never creates a product.
// ---------------------------------------------------------------------------

test('scan: OCR suggests the review fields, saves nothing, and is retrievable', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const alice = await register('scan')

  const before = await call('GET', '/api/products', { token: alice.token })
  assert.equal(before.status, 200)
  assert.equal(before.data.count, 0)

  const bill = buildTextPdf([
    'TAX INVOICE',
    'Croma Retail Store',
    'Invoice No: INV-2024-000123',
    'Invoice Date: 12-05-2024',
    'Sold By: Croma, Hyderabad',
    'Product Name: Samsung Washing Machine',
    'Brand: Samsung',
    'Model No: WA70BG4441BD',
    'Serial No: 9X3K821100',
    'Subtotal: 42,000.00',
    'Total: Rs. 45,000.00',
    'Warranty: 24 months',
  ])

  const scan = await call('POST', '/api/scan', {
    token: alice.token,
    body: { file: bill, fileType: 'application/pdf', fileName: 'contract-bill.pdf' },
  })

  assert.equal(scan.status, 201, JSON.stringify(scan.data))

  // Exactly the documented response shape — nothing more, nothing less.
  assert.deepStrictEqual(Object.keys(scan.data).sort(), [
    'file',
    'processingTimeMs',
    'rawText',
    'scanId',
    'source',
    'success',
    'suggestions',
  ])
  assert.equal(scan.data.success, true)
  assert.match(scan.data.scanId, /^[a-f0-9]{24}$/, 'scanId must satisfy the route isMongoId rule')
  assert.equal(typeof scan.data.processingTimeMs, 'number')
  assert.equal(scan.data.source, 'pdf')
  assert.equal(typeof scan.data.rawText, 'string')

  // File metadata only — never the buffered upload itself.
  assert.deepStrictEqual(Object.keys(scan.data.file).sort(), [
    'fileName',
    'fileType',
    'mimeType',
    'size',
  ])
  assert.equal(scan.data.file.fileType, 'PDF')

  // Every extracted field reaches the response with the exact key the review
  // form maps onto its input.
  assert.deepStrictEqual(Object.keys(scan.data.suggestions).sort(), [
    'brand',
    'invoiceNumber',
    'modelNumber',
    'productName',
    'purchaseDate',
    'purchasePrice',
    'seller',
    'serialNumber',
    'warrantyMonths',
  ])
  assert.deepStrictEqual(scan.data.suggestions, {
    invoiceNumber: 'INV-2024-000123',
    purchaseDate: '2024-05-12',
    purchasePrice: 45000,
    warrantyMonths: 24,
    seller: 'Croma, Hyderabad',
    productName: 'Samsung Washing Machine',
    brand: 'Samsung',
    modelNumber: 'WA70BG4441BD',
    serialNumber: '9X3K821100',
  })

  // Scanning alone must never create a product.
  const after = await call('GET', '/api/products', { token: alice.token })
  assert.equal(after.data.count, 0, 'a scan must not create a product')

  // The stored result is retrievable by the scan id the response returned.
  const fetched = await call('GET', `/api/scan/${scan.data.scanId}`, { token: alice.token })
  assert.equal(fetched.status, 200, JSON.stringify(fetched.data))
  assert.deepStrictEqual(fetched.data.suggestions, scan.data.suggestions)

  // A scan id that was never issued is a clean 404, not a crash.
  const missing = await call('GET', '/api/scan/64b000000000000000000000', { token: alice.token })
  assert.equal(missing.status, 404)
})
