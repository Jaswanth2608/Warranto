'use strict'

/**
 * Realtime change hub (Server-Sent Events).
 *
 * Warranto keeps one long-lived HTTP response open per signed-in browser tab
 * and writes a small JSON "change" frame whenever that user's data changes.
 * The frontend revalidates the affected resource, so a product added in one
 * tab (or on a phone) appears everywhere within a moment instead of on the
 * next full page load.
 *
 * Why SSE and not WebSockets: the traffic is one-directional, it survives
 * Render's proxy without extra configuration, and it reconnects natively.
 *
 * The connection is a normal authenticated request (the browser client sends
 * the Bearer token itself; see the frontend live service), so events are
 * always scoped to a single user id. A client can never subscribe to another
 * account's stream because there is no way to name one.
 */

const DEFAULT_HEARTBEAT_MS = 25_000
const MAX_CLIENTS_PER_USER = 12
const MAX_BUFFERED_EVENTS = 64

/** Serialises one SSE frame. `data` is JSON, so it never contains newlines. */
function formatFrame({ event = 'message', data, id }) {
  const lines = []
  if (id) lines.push(`id: ${id}`)
  lines.push(`event: ${event}`)
  lines.push(`data: ${JSON.stringify(data ?? null)}`)
  return `${lines.join('\n')}\n\n`
}

/**
 * Creates an isolated hub. Tests build their own instance so a stray publish
 * can never leak into another test.
 *
 * @param {{ heartbeatMs?: number, maxClientsPerUser?: number }} [options]
 */
function createRealtimeHub(options = {}) {
  const heartbeatMs = Number(options.heartbeatMs) || DEFAULT_HEARTBEAT_MS
  const maxClientsPerUser = Number(options.maxClientsPerUser) || MAX_CLIENTS_PER_USER

  /** @type {Map<string, Set<object>>} userId -> open clients */
  const clients = new Map()
  let nextClientId = 1
  let heartbeatTimer = null

  function clientsOf(userId) {
    return clients.get(String(userId))
  }

  function dropClient(userId, client) {
    const key = String(userId)
    const set = clients.get(key)
    if (!set) return
    set.delete(client)
    if (set.size === 0) clients.delete(key)
  }

  function write(client, chunk) {
    try {
      client.res.write(chunk)
      return true
    } catch (_error) {
      // A client that cannot be written to is gone; drop it right away so the
      // set does not accumulate half-open connections.
      dropClient(client.userId, client)
      return false
    }
  }

  function ensureHeartbeat() {
    if (heartbeatTimer) return
    heartbeatTimer = setInterval(() => {
      // A comment frame keeps proxies (and Render's idle timeout) from
      // closing the stream; clients ignore it.
      for (const set of clients.values()) {
        for (const client of [...set]) write(client, ': ping\n\n')
      }
    }, heartbeatMs)
    // Never keep the Node process alive just for the heartbeat.
    if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref()
  }

  /**
   * Attaches a response to a user's stream.
   * Returns an unsubscribe function; call it from the request's "close" event.
   */
  function subscribe(userId, res) {
    if (!userId) throw new Error('subscribe() requires a user id')

    const key = String(userId)
    let set = clients.get(key)
    if (!set) {
      set = new Set()
      clients.set(key, set)
    }

    // Bound the fan-out per account (many tabs is fine, a leak is not).
    if (set.size >= maxClientsPerUser) {
      const oldest = set.values().next().value
      if (oldest) {
        try {
          oldest.res.end()
        } catch (_error) {
          /* already closed */
        }
        set.delete(oldest)
      }
    }

    const client = { id: nextClientId++, userId: key, res, subscribedAt: new Date() }
    set.add(client)
    ensureHeartbeat()

    return function unsubscribe() {
      dropClient(key, client)
      if (clients.size === 0 && heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
    }
  }

  /**
   * Publishes one change to every open tab of a user.
   * Returns how many open streams received it (0 when nobody is listening).
   */
  function publish(userId, payload) {
    const set = clientsOf(userId)
    if (!set || set.size === 0) return 0

    const frame = formatFrame({ event: 'change', data: payload })
    let delivered = 0
    for (const client of [...set]) {
      if (write(client, frame)) delivered += 1
    }
    return delivered
  }

  /** How many streams are open for a user (used by diagnostics/tests). */
  function count(userId) {
    return clientsOf(userId)?.size ?? 0
  }

  /** Total open streams across all users. */
  function total() {
    let sum = 0
    for (const set of clients.values()) sum += set.size
    return sum
  }

  /** Ends every stream — used on graceful shutdown. */
  function closeAll() {
    for (const set of clients.values()) {
      for (const client of [...set]) {
        try {
          client.res.end()
        } catch (_error) {
          /* already closed */
        }
      }
    }
    clients.clear()
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  return { subscribe, publish, count, total, closeAll, formatFrame, maxClientsPerUser, maxBufferedEvents: MAX_BUFFERED_EVENTS }
}

/** Process-wide hub — one stream registry for the running API. */
const hub = createRealtimeHub()

module.exports = { createRealtimeHub, formatFrame, hub, DEFAULT_HEARTBEAT_MS }
