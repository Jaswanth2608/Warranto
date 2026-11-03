import { apiBaseUrl } from './httpClient.js'
import { getLiveClientId } from '../utils/liveClientId.js'

/**
 * Live change stream (Server-Sent Events).
 *
 * The API answers GET /api/events with a long-lived event stream. The browser's
 * EventSource cannot send an Authorization header, so this reads the response
 * with fetch() and parses the SSE frames itself — the token stays a header, it
 * is never put in a URL.
 *
 * Behaviour that matters for "always fresh":
 * - Reconnects with exponential backoff and jitter after a network drop.
 * - A dropped connection is not silent: the caller is told via onStatus.
 * - After a reconnect the server has no memory of what was missed, so the
 *   client is told to resync (`type: 'resync'`).
 * - Stops cleanly on sign-out and on unmount.
 */

const TOKEN_KEY = 'warranto.token'
const RETRY_BASE_MS = 1200
const RETRY_MAX_MS = 20000
// The server pings every 25 s. Silence for longer than this means the socket is
// half-open (laptop slept, network moved): reconnect instead of waiting for a
// TCP timeout that may never arrive.
const STALL_TIMEOUT_MS = 65_000

/** Parses one SSE frame ("event: x\ndata: {...}\n id: y"). */
export function parseFrame(raw) {
  let event = 'message'
  let id
  let retry
  const dataLines = []

  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') event = value
    else if (field === 'id') id = value
    else if (field === 'retry') retry = Number(value) || undefined
    else if (field === 'data') dataLines.push(value)
  }

  if (dataLines.length === 0) return { event, id, retry, data: null }

  const text = dataLines.join('\n')
  try {
    return { event, id, retry, data: JSON.parse(text) }
  } catch {
    return { event, id, retry, data: text }
  }
}

/**
 * Opens the stream and keeps it open.
 *
 * @param {{
 *   onEvent?: (event: object) => void,
 *   onStatus?: (status: { state: string, attempt?: number, retryInMs?: number }) => void,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export function createLiveConnection({
  onEvent,
  onStatus,
  fetchImpl,
  stallTimeoutMs = STALL_TIMEOUT_MS,
} = {}) {
  const doFetch = fetchImpl || ((...args) => fetch(...args))

  let stopped = false
  let controller = null
  let retryTimer = null
  let attempt = 0
  let everConnected = false

  const report = (state, detail = {}) => {
    try {
      onStatus?.({ state, ...detail })
    } catch {
      // A status observer must never break the stream.
    }
  }

  const emit = (event) => {
    try {
      onEvent?.(event)
    } catch (error) {
      console.error('[live] handler failed:', error)
    }
  }

  function clearRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function scheduleRetry() {
    if (stopped) return
    const exponential = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS)
    // Jitter avoids every tab of an account reconnecting on the same tick.
    const delay = Math.round(exponential * (0.7 + Math.random() * 0.6))
    attempt += 1
    report(attempt === 1 ? 'reconnecting' : 'offline', { attempt, retryInMs: delay })
    clearRetry()
    retryTimer = setTimeout(connect, delay)
  }

  async function connect() {
    if (stopped) return
    clearRetry()

    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      report('signed-out')
      return
    }

    controller = new AbortController()
    report(attempt === 0 ? 'connecting' : 'reconnecting', { attempt })

    let response
    try {
      response = await doFetch(`${apiBaseUrl}/events`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
          // Identifies this tab so its own writes are not echoed back.
          'X-Live-Client': getLiveClientId(),
        },
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch (error) {
      if (stopped || error?.name === 'AbortError') return
      scheduleRetry()
      return
    }

    if (stopped) {
      try {
        controller.abort()
      } catch {
        /* already gone */
      }
      return
    }

    if (response.status === 401) {
      // The session is gone; httpClient's redirect handles the UI. Stay quiet
      // until a new token appears (the provider restarts on sign-in).
      report('unauthorized')
      return
    }

    if (!response.ok || !response.body) {
      scheduleRetry()
      return
    }

    attempt = 0
    report('live')
    if (everConnected) emit({ type: 'resync', reason: 'reconnected' })
    everConnected = true

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let serverAskedRetryIn = 0
    let stalled = false

    // Any byte — including the server's comment ping — proves the connection is
    // alive; a quiet stream longer than the timeout is treated as dead.
    let lastActivityAt = Date.now()

    const stallTimer = setInterval(() => {
      if (Date.now() - lastActivityAt < stallTimeoutMs) return
      stalled = true
      try {
        controller.abort()
      } catch {
        /* already gone */
      }
      // Aborting the fetch is enough in a browser; cancelling the reader too
      // makes the hung read finish deterministically everywhere.
      try {
        reader.cancel().catch(() => {})
      } catch {
        /* already gone */
      }
    }, Math.max(250, Math.min(5_000, Math.floor(stallTimeoutMs / 4))))

    const touch = () => {
      lastActivityAt = Date.now()
    }

    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        touch()

        buffer += decoder.decode(value, { stream: true })

        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          boundary = buffer.indexOf('\n\n')

          const frame = parseFrame(raw)
          if (!frame) continue

          if (frame.retry) serverAskedRetryIn = frame.retry

          if (frame.event === 'ready') {
            attempt = 0
            report('live', { connectedAt: frame.data?.connectedAt })
          } else if (frame.event === 'change' && frame.data) {
            emit(frame.data)
          }
        }
      }
    } catch (error) {
      if (stopped) return
      // A stall abort is not a user stop: report it and retry like a drop.
      if (error?.name === 'AbortError' && !stalled) return
    } finally {
      clearInterval(stallTimer)
    }

    if (!stopped) {
      if (serverAskedRetryIn) {
        attempt = 0
        clearRetry()
        report('reconnecting', { retryInMs: serverAskedRetryIn })
        retryTimer = setTimeout(connect, serverAskedRetryIn)
      } else {
        scheduleRetry()
      }
    }
  }

  return {
    start() {
      if (stopped) return
      connect()
    },
    stop() {
      stopped = true
      clearRetry()
      if (controller) {
        try {
          controller.abort()
        } catch {
          /* already gone */
        }
        controller = null
      }
      report('stopped')
    },
    /** Reconnects immediately (used when the tab becomes visible again). */
    reconnectNow() {
      if (stopped) return
      clearRetry()
      attempt = 0
      if (controller) {
        try {
          controller.abort()
        } catch {
          /* already gone */
        }
      }
      connect()
    },
  }
}

export default createLiveConnection
