'use strict'

/**
 * Publishes a realtime "change" frame to the acting user whenever a mutating
 * API request succeeds.
 *
 * Doing this once, at the edge of the app, means every controller stays free
 * of transport concerns and a new route inherits live updates automatically.
 * The frame names the resource, not the row: the client revalidates that
 * resource, so it can never be shown a payload it would not have been allowed
 * to fetch.
 */

const { hub } = require('../lib/realtime')

const ACTION_BY_METHOD = {
  POST: 'created',
  PATCH: 'updated',
  PUT: 'updated',
  DELETE: 'deleted',
}

// Top-level API segment -> the cached resource a client should revalidate.
const RESOURCE_BY_SEGMENT = {
  products: 'products',
  bills: 'bills',
  tasks: 'tasks',
  reminders: 'reminders',
  services: 'services',
  auth: 'profile',
}

const MONGO_ID = /^[a-f0-9]{24}$/i

/**
 * Describes the change a request represents, or null when it is not one.
 * Exported for tests and for reading the routing table at a glance.
 *
 * @param {{ method?: string, originalUrl?: string, url?: string }} req
 * @returns {{ resource: string, action: string, id?: string } | null}
 */
function describeChange(req) {
  const action = ACTION_BY_METHOD[String(req.method || '').toUpperCase()]
  if (!action) return null

  const path = String(req.originalUrl || req.url || '').split('?')[0]
  const segments = path.split('/').filter(Boolean)

  // Expect /api/<resource>[/<id>...]
  if (segments[0] !== 'api') return null

  const resource = RESOURCE_BY_SEGMENT[segments[1]]
  if (!resource) return null

  const maybeId = segments[2]
  return MONGO_ID.test(maybeId || '') ? { resource, action, id: maybeId } : { resource, action }
}

/**
 * Express middleware. Listens for the response finishing and only publishes
 * for a 2xx answer that belongs to an authenticated user.
 */
function realtimeChanges(req, res, next) {
  const change = describeChange(req)
  if (!change) return next()

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return
    const userId = req.user?._id ?? req.user?.id
    if (!userId) return

    // The tab that made the change already applied the response; skip only
    // that tab so the others find out immediately.
    const clientId = req.get?.('x-live-client')

    try {
      hub.publish(
        String(userId),
        {
          type: 'change',
          ...change,
          at: new Date().toISOString(),
        },
        { exceptClientId: clientId },
      )
    } catch (error) {
      // A realtime fan-out problem must never affect the API response that
      // has already been sent.
      console.error('[realtime] could not publish change:', error.message)
    }
  })

  return next()
}

module.exports = { realtimeChanges, describeChange, ACTION_BY_METHOD, RESOURCE_BY_SEGMENT }
