'use strict'

/**
 * Realtime change hub + SSE endpoint.
 *
 * These run without MongoDB: the transport is independent of the database, so
 * a broken stream can be told apart from a broken query.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { createRealtimeHub, formatFrame, hub } = require('../lib/realtime')
const { describeChange, realtimeChanges } = require('../middleware/realtime')
const { streamEvents } = require('../routes/eventRoutes')

/** Minimal stand-in for an Express response, with the parts SSE touches. */
function fakeResponse({ failWrites = false } = {}) {
  const chunks = []
  return {
    chunks,
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code
      return this
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value
    },
    flushHeaders() {
      this.flushed = true
    },
    write(chunk) {
      if (failWrites) throw new Error('socket hang up')
      chunks.push(chunk)
      return true
    },
    end() {
      this.ended = true
    },
    json(body) {
      this.body = body
      return this
    },
    on() {},
  }
}

function framesOf(res) {
  return res.chunks.join('')
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Frame formatting
// ---------------------------------------------------------------------------

test('formatFrame writes a named SSE event with single-line JSON', () => {
  const frame = formatFrame({
    event: 'change',
    id: '42',
    data: { resource: 'products', action: 'updated' },
  })

  assert.equal(
    frame,
    'id: 42\nevent: change\ndata: {"resource":"products","action":"updated"}\n\n',
  )
  assert.equal(frame.split('\n\n').length, 2, 'exactly one terminating blank line')
})

// ---------------------------------------------------------------------------
// Hub behaviour
// ---------------------------------------------------------------------------

test('publish delivers only to the matching user streams', () => {
  const local = createRealtimeHub({ heartbeatMs: 60_000 })
  const aliceA = fakeResponse()
  const aliceB = fakeResponse()
  const bob = fakeResponse()

  const offA = local.subscribe('alice', aliceA)
  local.subscribe('alice', aliceB)
  const offBob = local.subscribe('bob', bob)

  const delivered = local.publish('alice', { type: 'change', resource: 'products' })

  assert.equal(delivered, 2)
  assert.match(framesOf(aliceA), /event: change/)
  assert.match(framesOf(aliceB), /"resource":"products"/)
  assert.equal(framesOf(bob), '', 'another account must never see the frame')
  assert.equal(local.count('alice'), 2)
  assert.equal(local.total(), 3)

  offA()
  offBob()
  assert.equal(local.count('alice'), 1)
  local.closeAll()
})

test('publish skips the tab that made the change', () => {
  const local = createRealtimeHub({ heartbeatMs: 60_000 })
  const author = fakeResponse()
  const otherTab = fakeResponse()
  const anonymous = fakeResponse()

  local.subscribe('alice', author, { clientId: 'tab-1' })
  local.subscribe('alice', otherTab, { clientId: 'tab-2' })
  local.subscribe('alice', anonymous)

  assert.equal(
    local.publish('alice', { type: 'change', resource: 'products' }, { exceptClientId: 'tab-1' }),
    2,
  )
  assert.equal(framesOf(author), '', 'the acting tab must not revalidate its own write')
  assert.match(framesOf(otherTab), /"resource":"products"/)
  assert.match(framesOf(anonymous), /"resource":"products"/, 'streams without an id still hear it')

  local.closeAll()
})

test('a malformed client id is ignored instead of isolating a stream', () => {
  const local = createRealtimeHub({ heartbeatMs: 60_000 })
  const res = fakeResponse()

  local.subscribe('user-7', res, { clientId: 'not a valid id\n' })
  assert.equal(local.publish('user-7', { type: 'change' }, { exceptClientId: 'not a valid id\n' }), 1)

  local.closeAll()
})

test('unsubscribing stops delivery and publish reports zero listeners', () => {
  const local = createRealtimeHub({ heartbeatMs: 60_000 })
  const res = fakeResponse()
  const off = local.subscribe('user-1', res)

  off()
  off() // idempotent

  assert.equal(local.publish('user-1', { type: 'change' }), 0)
  assert.equal(local.count('user-1'), 0)
  assert.equal(framesOf(res), '')
  local.closeAll()
})

test('subscribe requires a user id', () => {
  const local = createRealtimeHub()
  assert.throws(() => local.subscribe('', fakeResponse()), /requires a user id/)
  local.closeAll()
})

test('a failing stream is dropped instead of accumulating', () => {
  const local = createRealtimeHub({ heartbeatMs: 60_000 })
  const dead = fakeResponse({ failWrites: true })
  const live = fakeResponse()

  local.subscribe('user-2', dead)
  local.subscribe('user-2', live)

  assert.equal(local.publish('user-2', { type: 'change' }), 1)
  assert.equal(local.count('user-2'), 1)
  local.closeAll()
})

test('the heartbeat keeps idle streams warm', async () => {
  const local = createRealtimeHub({ heartbeatMs: 5 })
  const res = fakeResponse()
  local.subscribe('user-3', res)

  await wait(30)

  assert.match(framesOf(res), /: ping\n\n/)
  local.closeAll()
})

test('only the newest streams per account are kept when the cap is reached', () => {
  const local = createRealtimeHub({ heartbeatMs: 60_000, maxClientsPerUser: 2 })
  const first = fakeResponse()
  const second = fakeResponse()
  const third = fakeResponse()

  local.subscribe('user-4', first)
  local.subscribe('user-4', second)
  local.subscribe('user-4', third)

  assert.equal(local.count('user-4'), 2)
  assert.equal(first.ended, true, 'the oldest stream is closed')
  local.closeAll()
})

test('closeAll ends every stream and clears the registry', () => {
  const local = createRealtimeHub({ heartbeatMs: 60_000 })
  const a = fakeResponse()
  const b = fakeResponse()
  local.subscribe('a', a)
  local.subscribe('b', b)

  local.closeAll()

  assert.equal(a.ended, true)
  assert.equal(b.ended, true)
  assert.equal(local.total(), 0)
})

// ---------------------------------------------------------------------------
// Request -> change description
// ---------------------------------------------------------------------------

test('describeChange maps mutations to the resource a client revalidates', () => {
  assert.deepEqual(describeChange({ method: 'POST', originalUrl: '/api/products' }), {
    resource: 'products',
    action: 'created',
  })
  assert.deepEqual(
    describeChange({ method: 'PATCH', originalUrl: '/api/products/65f1c2a4b3d4e5f60718293a' }),
    { resource: 'products', action: 'updated', id: '65f1c2a4b3d4e5f60718293a' },
  )
  assert.deepEqual(describeChange({ method: 'DELETE', originalUrl: '/api/bills?x=1' }), {
    resource: 'bills',
    action: 'deleted',
  })
  assert.deepEqual(describeChange({ method: 'POST', originalUrl: '/api/auth/login' }), {
    resource: 'profile',
    action: 'created',
  })
})

test('describeChange ignores reads and non-resource routes', () => {
  assert.equal(describeChange({ method: 'GET', originalUrl: '/api/products' }), null)
  assert.equal(describeChange({ method: 'POST', originalUrl: '/api/scan' }), null)
  assert.equal(describeChange({ method: 'POST', originalUrl: '/health' }), null)
  assert.equal(describeChange({ method: 'POST', originalUrl: '/api/unknown' }), null)
})

test('realtimeChanges publishes only a successful authenticated change', () => {
  const local = hub
  const stream = fakeResponse()
  const off = local.subscribe('user-5', stream)

  function run({ method, originalUrl, statusCode, user }) {
    const res = new EventEmitter()
    res.statusCode = statusCode
    const req = { method, originalUrl, user }
    realtimeChanges(req, res, () => {})
    res.emit('finish')
  }

  run({ method: 'POST', originalUrl: '/api/products', statusCode: 201, user: { _id: 'user-5' } })
  assert.match(framesOf(stream), /"resource":"products"/)

  const before = framesOf(stream)
  run({ method: 'POST', originalUrl: '/api/products', statusCode: 400, user: { _id: 'user-5' } })
  run({ method: 'POST', originalUrl: '/api/products', statusCode: 201, user: undefined })
  run({ method: 'GET', originalUrl: '/api/products', statusCode: 200, user: { _id: 'user-5' } })

  assert.equal(framesOf(stream), before, 'failed, anonymous and read requests publish nothing')
  off()
})

test('the acting tab is skipped when it identifies itself', () => {
  const author = fakeResponse()
  const otherTab = fakeResponse()
  const offAuthor = hub.subscribe('user-8', author, { clientId: 'tab-a' })
  const offOther = hub.subscribe('user-8', otherTab, { clientId: 'tab-b' })

  const res = new EventEmitter()
  res.statusCode = 201
  const req = {
    method: 'POST',
    originalUrl: '/api/products',
    user: { _id: 'user-8' },
    get: (name) => (String(name).toLowerCase() === 'x-live-client' ? 'tab-a' : undefined),
  }

  realtimeChanges(req, res, () => {})
  res.emit('finish')

  assert.equal(framesOf(author), '')
  assert.match(framesOf(otherTab), /"resource":"products"/)

  offAuthor()
  offOther()
})

// ---------------------------------------------------------------------------
// SSE endpoint
// ---------------------------------------------------------------------------

test('streamEvents opens a stream, sends ready, then forwards changes', () => {
  const res = fakeResponse()
  const req = new EventEmitter()
  req.user = { _id: 'user-6' }

  streamEvents(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'no-cache, no-transform')
  assert.equal(res.headers['x-accel-buffering'], 'no')
  assert.equal(res.flushed, true)
  assert.match(framesOf(res), /^retry: 3000\n\n/)
  assert.match(framesOf(res), /event: ready/)
  assert.equal(hub.count('user-6'), 1)

  hub.publish('user-6', { type: 'change', resource: 'bills', action: 'created' })
  assert.match(framesOf(res), /"resource":"bills"/)

  // Closing the request must release the stream.
  req.emit('close')
  assert.equal(hub.count('user-6'), 0)
})

test('streamEvents refuses an unauthenticated request', () => {
  const res = fakeResponse()
  streamEvents({ user: null, on() {} }, res)

  assert.equal(res.statusCode, 401)
  assert.equal(res.body.success, false)
})
