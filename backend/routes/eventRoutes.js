'use strict'

/**
 * GET /api/events — the live change stream.
 *
 *   GET /api/events
 *
 * A normal authenticated request that never finishes on its own: the server
 * writes a `ready` frame, then one `change` frame per successful mutation made
 * by the same account, plus a comment ping every 25 s to keep proxies from
 * closing an idle connection.
 *
 * Authentication uses the usual Bearer token. Browsers' built-in EventSource
 * cannot set a header, so the frontend reads the stream with fetch() instead —
 * see frontend/src/services/liveService.js.
 */

const { Router } = require('express')
const { protect } = require('../middleware/authMiddleware')
const { hub, formatFrame, DEFAULT_HEARTBEAT_MS } = require('../lib/realtime')

/**
 * Starts an SSE response for req.user.id.
 * Exported separately so it can be exercised without a database.
 */
function streamEvents(req, res) {
  const userId = req.user?._id ?? req.user?.id
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required. Please log in.' })
    return
  }

  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  // Render (and most reverse proxies) buffer responses unless told not to.
  res.setHeader('X-Accel-Buffering', 'no')

  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  // Subscribe before announcing readiness so the count includes this stream.
  const unsubscribe = hub.subscribe(String(userId), res)

  // Ask the browser client to come back after 3 s if the connection drops.
  res.write('retry: 3000\n\n')
  res.write(
    formatFrame({
      event: 'ready',
      data: {
        connectedAt: new Date().toISOString(),
        heartbeatMs: DEFAULT_HEARTBEAT_MS,
        streams: hub.count(String(userId)),
      },
    }),
  )

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    unsubscribe()
  }

  req.on('close', close)
  req.on('aborted', close)
  res.on('close', close)
}

const router = Router()

router.get('/', protect, streamEvents)

module.exports = router
module.exports.streamEvents = streamEvents
