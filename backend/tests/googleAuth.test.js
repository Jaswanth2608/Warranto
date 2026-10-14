'use strict'

/**
 * Google sign-in tests.
 *
 * Covers:
 *  - configuration reporting (GET /api/auth/providers, lib/googleAuth helpers)
 *  - missing / invalid credentials never open a session
 *  - a Google-only account cannot be taken over with a password
 *  - the public user shape never exposes the Google link or password hash
 *
 * These run without real Google credentials: the important failure paths
 * (unconfigured server, malformed token, password login on a Google account)
 * are all reachable offline. Verifying a genuine Google ID token — and the
 * account-linking / duplicate-email paths that need one — requires a real
 * client id and is documented in README.md as a manual check.
 *
 * Run with:  npm test   (from the backend folder)
 */

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'warranto-test-secret'

// Allow the suite to connect against a throwaway database when MONGODB_URI is
// not otherwise set locally. Must happen before the database module loads.
if (process.env.MONGODB_TEST_URI) {
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI
}

const assert = require('node:assert/strict')
const test = require('node:test')

const { app } = require('../server')
const { connectDB, disconnectDB } = require('../config/db')
const { isGoogleConfigured, getGoogleClientId } = require('../lib/googleAuth')
const User = require('../models/User')

const SKIP_REASON = 'database not available — set MONGODB_URI in backend/.env to run these tests'
const FAKE_CLIENT_ID = '1234567890-warranto-test.apps.googleusercontent.com'

let dbReady = false
let server = null
let base = null
const createdUserIds = new Set()

function emailWithTag(tag) {
  return `google+${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${tag}@example.example`
}

function call(method, path, { body, token } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
})

test.after(async () => {
  if (createdUserIds.size > 0) {
    await User.deleteMany({ _id: { $in: [...createdUserIds] } }).catch(() => {})
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve))
    server = null
  }
  await disconnectDB().catch(() => {})
})

test('google configuration helpers read GOOGLE_CLIENT_ID at call time', (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const original = process.env.GOOGLE_CLIENT_ID

  delete process.env.GOOGLE_CLIENT_ID
  assert.equal(getGoogleClientId(), null)
  assert.equal(isGoogleConfigured(), false)

  process.env.GOOGLE_CLIENT_ID = `  ${FAKE_CLIENT_ID}  `
  assert.equal(getGoogleClientId(), FAKE_CLIENT_ID, 'client id should be trimmed')
  assert.equal(isGoogleConfigured(), true)

  if (original === undefined) delete process.env.GOOGLE_CLIENT_ID
  else process.env.GOOGLE_CLIENT_ID = original
})

test('GET /api/auth/providers reports which methods the server offers', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const original = process.env.GOOGLE_CLIENT_ID

  delete process.env.GOOGLE_CLIENT_ID
  const withoutGoogle = await call('GET', '/api/auth/providers')
  assert.equal(withoutGoogle.status, 200)
  assert.equal(withoutGoogle.data.success, true)
  assert.equal(withoutGoogle.data.providers.password, true, 'password sign-in must stay available')
  assert.equal(withoutGoogle.data.providers.google, false)

  process.env.GOOGLE_CLIENT_ID = FAKE_CLIENT_ID
  const withGoogle = await call('GET', '/api/auth/providers')
  assert.equal(withGoogle.status, 200)
  assert.equal(withGoogle.data.providers.google, true)
  assert.equal(withGoogle.data.providers.password, true)

  if (original === undefined) delete process.env.GOOGLE_CLIENT_ID
  else process.env.GOOGLE_CLIENT_ID = original
})

test('POST /api/auth/google rejects a missing credential with 400', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const res = await call('POST', '/api/auth/google', { body: {} })
  assert.equal(res.status, 400)
  assert.equal(res.data.success, false)
})

test('POST /api/auth/google answers 501 while the server is not configured', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const original = process.env.GOOGLE_CLIENT_ID
  delete process.env.GOOGLE_CLIENT_ID

  const res = await call('POST', '/api/auth/google', { body: { credential: 'any-value' } })
  assert.equal(res.status, 501)
  assert.equal(res.data.success, false)
  assert.match(String(res.data.message), /not configured/i)

  if (original === undefined) delete process.env.GOOGLE_CLIENT_ID
  else process.env.GOOGLE_CLIENT_ID = original
})

test('POST /api/auth/google rejects an invalid credential with a generic 401', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const original = process.env.GOOGLE_CLIENT_ID
  process.env.GOOGLE_CLIENT_ID = FAKE_CLIENT_ID

  const credential = 'not-a-real-jwt'
  const res = await call('POST', '/api/auth/google', { body: { credential } })

  assert.equal(res.status, 401, 'a token that does not verify must never open a session')
  assert.equal(res.data.success, false)
  assert.equal(res.data.token, undefined, 'no session token may be issued')
  assert.ok(
    !String(res.data.message).toLowerCase().includes(credential),
    'the rejected credential must not be echoed back',
  )

  if (original === undefined) delete process.env.GOOGLE_CLIENT_ID
  else process.env.GOOGLE_CLIENT_ID = original
})

test('a Google-only account cannot be signed into with a password', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const email = emailWithTag('google-only')
  const user = await User.create({
    fullName: 'Google Only',
    email,
    googleId: `sub-${Date.now()}`,
    memberSince: new Date(),
  })
  createdUserIds.add(user.id)

  // No passwordHash exists, so password login must fail with the same generic
  // message used for a wrong password (no account probing).
  const res = await call('POST', '/api/auth/login', {
    body: { email, password: 'Password1!' },
  })
  assert.equal(res.status, 401)
  assert.equal(res.data.success, false)
  assert.equal(res.data.token, undefined)

  // And the public user shape never leaks the identity link or password hash.
  const json = user.toJSON()
  assert.equal(json.googleId, undefined, 'googleId is internal and must not be serialized')
  assert.equal(json.passwordHash, undefined)
  assert.equal(json.email, email)
})

test('password registration and login still work alongside Google', async (t) => {
  if (!dbReady) return t.skip(SKIP_REASON)

  const email = emailWithTag('password-still-works')
  const registered = await call('POST', '/api/auth/register', {
    body: { fullName: 'Password User', email, password: 'Password1!' },
  })
  assert.equal(registered.status, 201, JSON.stringify(registered.data))
  assert.ok(registered.data.token)
  createdUserIds.add(registered.data.user.id)

  const loggedIn = await call('POST', '/api/auth/login', {
    body: { email, password: 'Password1!' },
  })
  assert.equal(loggedIn.status, 200)
  assert.ok(loggedIn.data.token)

  const me = await call('GET', '/api/auth/me', { token: loggedIn.data.token })
  assert.equal(me.status, 200)
  assert.equal(me.data.user.email, email)
})
