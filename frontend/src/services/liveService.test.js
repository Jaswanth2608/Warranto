/**
 * Live-stream client tests.
 *
 * These pin the parts that decide whether "real time" actually feels real: the
 * frame parser, the request headers, and recovery from a connection that goes
 * silent without ever closing.
 *
 * Run with:  npm test   (from the frontend folder)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createLiveConnection, parseFrame } from './liveService.js'

// The stream reads the session token from localStorage; provide the small
// surface it uses when running under Node.
const store = new Map([['warranto.token', 'test-token']])
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
}
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A fetch response whose body never closes on its own, plus a `close()` so a
 * test can release the underlying stream handle when it is finished.
 */
function openStream(chunks) {
  const encoder = new TextEncoder()
  let streamController = null
  const body = new ReadableStream({
    start(controller) {
      streamController = controller
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
    },
  })
  return {
    response: { ok: true, status: 200, body },
    close: () => {
      try {
        streamController?.close()
      } catch {
        /* already closed or cancelled */
      }
    },
  }
}

test('parseFrame reads a named frame and its JSON payload', () => {
  const frame = parseFrame(
    'id: 7\nevent: change\ndata: {"resource":"products","action":"updated"}',
  )

  assert.equal(frame.event, 'change')
  assert.equal(frame.id, '7')
  assert.deepEqual(frame.data, { resource: 'products', action: 'updated' })
})

test('parseFrame ignores comment pings and keeps retry hints', () => {
  assert.deepEqual(parseFrame(': ping'), { event: 'message', id: undefined, retry: undefined, data: null })
  assert.equal(parseFrame('retry: 3000').retry, 3000)
})

test('the stream authenticates with headers, never a token in the URL', async () => {
  let seen = null
  const stream = openStream(['event: ready\ndata: {"clientId":"tab-1"}\n\n'])
  const connection = createLiveConnection({
    fetchImpl: async (url, options) => {
      seen = { url, options }
      return stream.response
    },
    stallTimeoutMs: 60_000,
  })

  connection.start()
  await wait(60)

  assert.match(seen.options.headers.Authorization, /^Bearer test-token$/)
  assert.equal(seen.options.headers.Accept, 'text/event-stream')
  assert.ok(seen.options.headers['X-Live-Client'], 'the tab identifies itself for echo suppression')
  assert.ok(!seen.url.includes('test-token'))

  connection.stop()
  stream.close()
})

test('a silent stream is torn down and reconnected instead of hanging forever', async () => {
  let calls = 0
  const states = []
  const streams = []

  const connection = createLiveConnection({
    fetchImpl: async () => {
      calls += 1
      // Ready, then silence: no ping, no close.
      const stream = openStream(['event: ready\ndata: {}\n\n'])
      streams.push(stream)
      return stream.response
    },
    onStatus: ({ state }) => states.push(state),
    stallTimeoutMs: 40,
  })

  connection.start()
  // Stall detection (250ms poll) + the reconnect backoff (up to ~1.6s).
  await wait(2_600)

  const observed = { calls, states: [...states] }
  connection.stop()
  for (const stream of streams) stream.close()

  assert.ok(
    observed.calls >= 2,
    `expected a reconnect, saw ${observed.calls} request(s)`,
  )
  assert.ok(
    observed.states.includes('reconnecting') || observed.states.includes('offline'),
    observed.states.join(','),
  )
})

test('stop() ends the retry loop', async () => {
  let calls = 0
  const streams = []
  const connection = createLiveConnection({
    fetchImpl: async () => {
      calls += 1
      const stream = openStream(['event: ready\ndata: {}\n\n'])
      streams.push(stream)
      return stream.response
    },
    stallTimeoutMs: 30,
  })

  connection.start()
  await wait(70)
  connection.stop()
  const afterStop = calls
  await wait(1_400)
  const finalCalls = calls
  for (const stream of streams) stream.close()

  assert.equal(finalCalls, afterStop, 'no request may be made after stop()')
})
