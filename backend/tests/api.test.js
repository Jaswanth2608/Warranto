/**
 * API tests that run WITHOUT a database.
 * They verify the HTTP surface: health endpoints, 404 handling, validation,
 * authentication guards, error shapes, and CORS — all against the real app.
 *
 * Run with:  npm test   (from the backend folder)
 */

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'warranto-test-secret'

const { before, after, test } = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')

const { app } = require('../server')

let server
let base

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => new Promise((resolve) => server.close(resolve)))

/** Tiny fetch helper returning { status, data, headers }. */
async function call(method, path, { body, token, raw, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data, headers: res.headers }
}

const VALID_ID = '64b000000000000000000000'

test('GET /api/health returns ok without exposing secrets', async () => {
  const res = await call('GET', '/api/health')
  assert.equal(res.status, 200)
  assert.equal(res.data.status, 'ok')
  assert.equal(res.data.service, 'Warranto API')

  const flat = JSON.stringify(res.data)
  assert.ok(!flat.includes('mongodb'), 'health response must not mention the database URI')
  assert.ok(!flat.includes('JWT_SECRET'), 'health response must not mention env var names')
  assert.ok(!('MONGODB_URI' in res.data))
})

test('GET /api/health/db reports connection state without credentials', async () => {
  const res = await call('GET', '/api/health/db')
  assert.equal(res.status, 200)
  assert.equal(typeof res.data.connected, 'boolean')
  assert.equal(typeof res.data.state, 'string')
  assert.ok(!JSON.stringify(res.data).includes('mongodb+srv'))
  assert.ok(!JSON.stringify(res.data).includes('://'))
})

test('unknown routes answer a JSON 404', async () => {
  const res = await call('GET', '/api/definitely-not-a-route')
  assert.equal(res.status, 404)
  assert.equal(res.data.success, false)
  assert.match(res.data.message, /route not found/i)
})

test('malformed JSON bodies answer 400 with a readable message', async () => {
  const res = await call('POST', '/api/auth/login', { raw: '{"email": "x"@ }' })
  assert.equal(res.status, 400)
  assert.equal(res.data.success, false)
  assert.match(res.data.message, /json/i)
})

test('POST /api/auth/register rejects an empty body with field errors', async () => {
  const res = await call('POST', '/api/auth/register', { body: {} })
  assert.equal(res.status, 400)
  assert.equal(res.data.success, false)
  const fields = res.data.errors.map((e) => e.field)
  assert.ok(fields.includes('fullName'), 'expected fullName error')
  assert.ok(fields.includes('email'), 'expected email error')
  assert.ok(fields.includes('password'), 'expected password error')
})

test('POST /api/auth/register rejects invalid email and weak password', async () => {
  const res = await call('POST', '/api/auth/register', {
    body: { fullName: 'Test User', email: 'not-an-email', password: 'short' },
  })
  assert.equal(res.status, 400)
  const fields = res.data.errors.map((e) => e.field)
  assert.ok(fields.includes('email'))
  assert.ok(fields.includes('password'))
})

test('POST /api/auth/login rejects missing credentials', async () => {
  const res = await call('POST', '/api/auth/login', { body: {} })
  assert.equal(res.status, 400)
  assert.ok(res.data.errors.some((e) => e.field === 'email'))
  assert.ok(res.data.errors.some((e) => e.field === 'password'))
})

test('register with valid input but no database answers a clear 503', async () => {
  const res = await call('POST', '/api/auth/register', {
    body: { fullName: 'Test User', email: 'someone@example.com', password: 'Secret123' },
  })
  assert.equal(res.status, 503)
  assert.equal(res.data.success, false)
  assert.match(res.data.message, /database is not connected/i)
})

test('GET /api/products without a token answers 401', async () => {
  const res = await call('GET', '/api/products')
  assert.equal(res.status, 401)
  assert.equal(res.data.success, false)
  assert.match(res.data.message, /log in/i)
})

test('GET /api/products with a garbage token answers 401', async () => {
  const res = await call('GET', '/api/products', { token: 'not.a.jwt' })
  assert.equal(res.status, 401)
  assert.match(res.data.message, /session is invalid|log in/i)
})

test('a well-formed token without a database answers 503, not a crash', async () => {
  const token = jwt.sign({ sub: VALID_ID }, process.env.JWT_SECRET, { expiresIn: '1h' })
  const res = await call('GET', '/api/auth/me', { token })
  assert.equal(res.status, 503)
  assert.equal(res.data.success, false)
  assert.match(res.data.message, /database/i)
})

test('POST /api/products validates the body before authentication (400, not 401)', async () => {
  const res = await call('POST', '/api/products', {
    body: { name: '', purchasePrice: 'abc', warrantyMonths: 0 },
  })
  assert.equal(res.status, 400)
  const fields = res.data.errors.map((e) => e.field)
  assert.ok(fields.includes('name'))
  assert.ok(fields.includes('purchasePrice'))
  assert.ok(fields.includes('warrantyMonths'))
})

test('POST /api/products with a valid body still requires a token (401)', async () => {
  const res = await call('POST', '/api/products', {
    body: {
      name: 'Samsung Washing Machine',
      brand: 'Samsung',
      category: 'appliances',
      purchaseDate: '2025-01-15',
      purchasePrice: 32490,
      warrantyMonths: 24,
    },
  })
  assert.equal(res.status, 401)
})

test('product id validation runs before authentication (400 for bad ids)', async () => {
  const res = await call('GET', '/api/products/not-an-id')
  assert.equal(res.status, 400)
  assert.match(res.data.message, /invalid product id/i)
})

test('PATCH and DELETE on a valid id still require a token (401)', async () => {
  const patch = await call('PATCH', `/api/products/${VALID_ID}`, { body: { name: 'New name' } })
  assert.equal(patch.status, 401)

  const remove = await call('DELETE', `/api/products/${VALID_ID}`)
  assert.equal(remove.status, 401)
})

test('protected bill endpoints require a token (401)', async () => {
  const list = await call('GET', '/api/bills')
  assert.equal(list.status, 401)

  const remove = await call('DELETE', `/api/bills/${VALID_ID}`)
  assert.equal(remove.status, 401)

  const file = await call('GET', `/api/bills/${VALID_ID}/file`)
  assert.equal(file.status, 401)

  // Multipart upload without a token also answers 401.
  const form = new FormData()
  form.append('productId', VALID_ID)
  form.append('file', new Blob([Buffer.from('%PDF-1.4%%EOF')], { type: 'application/pdf' }), 'b.pdf')
  const upload = await fetch(`${base}/api/bills`, {
    method: 'POST',
    headers: { Authorization: 'Bearer not-a-token' },
    body: form,
  })
  assert.equal(upload.status, 401)
})

test('bill routes with an invalid product id answer 400 before auth', async () => {
  const patch = await call('PATCH', '/api/bills/not-an-id')
  assert.equal(patch.status, 400)
  assert.match(patch.data.message, /invalid product id/i)

  const remove = await call('DELETE', '/api/bills/not-an-id')
  assert.equal(remove.status, 400)

  const file = await call('GET', '/api/bills/not-an-id/file')
  assert.equal(file.status, 400)
})

test('CORS allows the Vite dev server origin', async () => {
  const res = await call('GET', '/api/health', {
    headers: { Origin: 'http://localhost:5173' },
  })
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})

test('CORS preflight succeeds for the Vite dev server', async () => {
  const res = await fetch(`${base}/api/products`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization',
    },
  })
  assert.ok([200, 204].includes(res.status))
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.match(res.headers.get('access-control-allow-headers') || '', /authorization/i)
})

test('task endpoints require a token or valid input', async () => {
  const list = await call('GET', '/api/tasks')
  assert.equal(list.status, 401)

  const get = await call('GET', `/api/tasks/${VALID_ID}`)
  assert.equal(get.status, 401)

  const create = await call('POST', '/api/tasks', { body: {} })
  assert.ok([400, 401].includes(create.status), 'create without token or valid body is rejected')

  const complete = await call('POST', `/api/tasks/${VALID_ID}/complete`)
  assert.equal(complete.status, 401)

  const reopen = await call('POST', `/api/tasks/${VALID_ID}/reopen`)
  assert.equal(reopen.status, 401)

  const del = await call('DELETE', `/api/tasks/${VALID_ID}`)
  assert.equal(del.status, 401)
})

test('task id validation runs before authentication (400 for bad ids)', async () => {
  const get = await call('GET', '/api/tasks/not-an-id')
  assert.equal(get.status, 400)
  assert.match(get.data.message, /invalid task id/i)

  const complete = await call('POST', '/api/tasks/not-an-id/complete')
  assert.equal(complete.status, 400)
  assert.match(complete.data.message, /invalid task id/i)

  const reopen = await call('POST', '/api/tasks/not-an-id/reopen')
  assert.equal(reopen.status, 400)
  assert.match(reopen.data.message, /invalid task id/i)

  const del = await call('DELETE', '/api/tasks/not-an-id')
  assert.equal(del.status, 400)
  assert.match(del.data.message, /invalid task id/i)
})

test('task validation rejects bad input (400) even without a token', async () => {
  const create = await call('POST', '/api/tasks', {
    body: { title: '', priority: 'urgent', dueDate: 'not-a-date' },
  })
  assert.equal(create.status, 400)
  const fields = create.data.errors.map((e) => e.field)
  assert.ok(fields.includes('product'), 'expected product error')
  assert.ok(fields.includes('title'), 'expected title error')
  assert.ok(fields.includes('priority'), 'expected priority error')
  assert.ok(fields.includes('dueDate'), 'expected dueDate error')
})

test('reminder endpoints require a token or valid input', async () => {
  const list = await call('GET', '/api/reminders')
  assert.equal(list.status, 401)

  const get = await call('GET', `/api/reminders/${VALID_ID}`)
  assert.equal(get.status, 401)

  const create = await call('POST', '/api/reminders', { body: {} })
  assert.ok([400, 401].includes(create.status), 'create without token or valid body is rejected')

  const del = await call('DELETE', `/api/reminders/${VALID_ID}`)
  assert.equal(del.status, 401)

  const milestones = await call('GET', '/api/reminders/milestones')
  assert.equal(milestones.status, 401)
})

test('reminder id validation runs before authentication (400 for bad ids)', async () => {
  const get = await call('GET', '/api/reminders/not-an-id')
  assert.equal(get.status, 400)
  assert.match(get.data.message, /invalid reminder id/i)

  const del = await call('DELETE', '/api/reminders/not-an-id')
  assert.equal(del.status, 400)
  assert.match(del.data.message, /invalid reminder id/i)
})

test('reminder validation rejects bad input (400) even without a token', async () => {
  const create = await call('POST', '/api/reminders', {
    body: { product: 'not-an-id', milestoneDays: 5 },
  })
  assert.equal(create.status, 400)
  const fields = create.data.errors.map((e) => e.field)
  assert.ok(fields.includes('product'), 'expected product error')
  assert.ok(fields.includes('milestoneDays'), 'expected milestoneDays error')
})
