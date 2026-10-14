'use strict'

/**
 * Unit tests for the CORS origin matcher (backend/lib/corsOrigins.js).
 *
 * These run without a database and lock in the behavior that fixes the
 * production CORS bug: a wildcard entry such as `https://*.vercel.app` must
 * allow the production alias and every preview deployment, while still
 * rejecting lookalike origins and scheme mismatches.
 *
 * Run with:  npm test   (from the backend folder)
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { buildOriginMatcher, parseOrigins, escapeRegExp } = require('../lib/corsOrigins')

test('parseOrigins trims entries, drops blanks, and strips a trailing slash', () => {
  const parsed = parseOrigins(' https://a.example.com/ , , https://b.example.com')
  assert.deepEqual(parsed, ['https://a.example.com', 'https://b.example.com'])
})

test('parseOrigins tolerates an empty or missing CLIENT_URL', () => {
  assert.deepEqual(parseOrigins(''), [])
  assert.deepEqual(parseOrigins(undefined), [])
  assert.deepEqual(parseOrigins(null), [])
})

test('escapeRegExp neutralizes regex metacharacters', () => {
  assert.equal(escapeRegExp('a.b+c'), 'a\\.b\\+c')
})

test('exact origins are allowed and others are rejected', () => {
  const { isAllowedOrigin } = buildOriginMatcher(
    'https://warranto.vercel.app,https://app.example.com',
    { isProduction: true },
  )

  assert.equal(isAllowedOrigin('https://warranto.vercel.app'), true)
  assert.equal(isAllowedOrigin('https://app.example.com'), true)
  assert.equal(isAllowedOrigin('https://evil.example.com'), false)
  // Exact matching must not be fooled by a suffix or prefix.
  assert.equal(isAllowedOrigin('https://warranto.vercel.app.evil.com'), false)
  assert.equal(isAllowedOrigin('https://evil.com/https://warranto.vercel.app'), false)
})

test('a wildcard entry allows the production alias and preview deployments', () => {
  const { isAllowedOrigin } = buildOriginMatcher('https://*.vercel.app', {
    isProduction: true,
  })

  assert.equal(isAllowedOrigin('https://warranto.vercel.app'), true)
  assert.equal(isAllowedOrigin('https://warranto-git-main-jaswanth21.vercel.app'), true)
  assert.equal(isAllowedOrigin('https://warranto-jaswanth21.vercel.app'), true)
})

test('a wildcard never matches a different scheme, port, or host', () => {
  const { isAllowedOrigin } = buildOriginMatcher('https://*.vercel.app', {
    isProduction: true,
  })

  assert.equal(isAllowedOrigin('http://warranto.vercel.app'), false)
  assert.equal(isAllowedOrigin('https://warranto.vercel.app:8443'), false)
  assert.equal(isAllowedOrigin('https://warranto.vercel.app.evil.com'), false)
  assert.equal(isAllowedOrigin('https://warranto.vercelusercontent.com'), false)
})

test('a wildcard cannot escape into a path', () => {
  const { isAllowedOrigin } = buildOriginMatcher('https://*.vercel.app', {
    isProduction: true,
  })

  // `*` matches any run except `/`, so a trailing path segment is rejected.
  assert.equal(isAllowedOrigin('https://warranto.vercel.app/evil'), false)
})

test('local dev and preview origins are allowed outside production only', () => {
  const dev = buildOriginMatcher('https://warranto.vercel.app', { isProduction: false })
  assert.equal(dev.isAllowedOrigin('http://localhost:5173'), true)
  assert.equal(dev.isAllowedOrigin('http://127.0.0.1:4173'), true)

  const prod = buildOriginMatcher('https://warranto.vercel.app', { isProduction: true })
  assert.equal(prod.isAllowedOrigin('http://localhost:5173'), false)
  assert.equal(prod.isAllowedOrigin('http://127.0.0.1:4173'), false)
  assert.equal(prod.isAllowedOrigin('https://warranto.vercel.app'), true)
})

test('a request without an Origin header is always allowed', () => {
  const { isAllowedOrigin } = buildOriginMatcher('https://warranto.vercel.app', {
    isProduction: true,
  })
  assert.equal(isAllowedOrigin(undefined), true)
  assert.equal(isAllowedOrigin(''), true)
})

test('combined exact and wildcard entries work together', () => {
  const { isAllowedOrigin } = buildOriginMatcher(
    'https://warranto.vercel.app,https://*.vercel.app',
    { isProduction: true },
  )
  assert.equal(isAllowedOrigin('https://warranto.vercel.app'), true)
  assert.equal(isAllowedOrigin('https://warranto-git-main-jaswanth21.vercel.app'), true)
  assert.equal(isAllowedOrigin('https://other.vercel.app'), true)
  assert.equal(isAllowedOrigin('https://evil.example.com'), false)
})
