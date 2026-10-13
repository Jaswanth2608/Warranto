'use strict'

// Read lazily at call time: the test's before() hook starts an in-process
// server on an ephemeral port and sets the base URL AFTER this module loads.
function baseUrl() {
  return globalThis.__WARRANTO_TEST_BASE_URL || process.env.API_BASE_URL || 'http://127.0.0.1:3000'
}

/**
 * Build a fetch-able Request for `node:test` integration tests.
 *
 * - `method` is uppercased for consistency.
 * - `qs` is appended to the URL as query parameters.
 * - `body` may be:
 *     - undefined/null → no body
 *     - a string/Buffer/Uint8Array → sent as-is with the provided Content-Type
 *     - an object → JSON-encoded with Content-Type application/json; when that
 *       object has a Buffer/Uint8Array/String "file" field it is encoded as a
 *       base64 value so the server can reconstruct the file from JSON.
 */
function buildRequest(method, path, options = {}) {
  const url = new URL(path, baseUrl())

  if (options.qs) {
    for (const [key, value] of Object.entries(options.qs)) {
      url.searchParams.set(key, String(value))
    }
  }

  const headers = new Headers(options.headers || {})

  let payload
  let effectiveBody = options.body

  if (effectiveBody !== undefined && effectiveBody !== null) {
    if (typeof effectiveBody === 'string' || Buffer.isBuffer(effectiveBody) || effectiveBody instanceof Uint8Array) {
      headers.set('Content-Type', options.headers?.['content-type'] || 'application/json')
      payload = effectiveBody
    } else if (typeof effectiveBody === 'object') {
      headers.set('Content-Type', 'application/json')
      if (effectiveBody.file !== undefined) {
        const raw = effectiveBody.file
        let encoded
        if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
          encoded = Buffer.from(raw).toString('base64')
        } else if (typeof raw === 'string') {
          encoded = Buffer.from(raw, 'utf8').toString('base64')
        } else {
          encoded = String(raw)
        }
        effectiveBody = { ...effectiveBody, fileId: `buf:${encoded}` }
        delete effectiveBody.file
      }
      payload = JSON.stringify(effectiveBody)
    } else {
      payload = String(effectiveBody)
    }
  }

  const token = options.token
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const upper = method.toUpperCase()
  const allowsBody = !['GET', 'HEAD'].includes(upper)
  return new Request(url.toString(), {
    method: upper,
    headers,
    body: allowsBody && payload !== undefined ? payload : undefined,
  })
}

/**
 * Make an HTTP call against the integration API.
 *
 * Returns { status, data, headers }.
 *
 * Notes:
 * - GET/HEAD/DELETE requests never send a body, even if `options.body` is
 *   provided; use POST/PUT/PATCH when the intention is to send a payload.
 * - Query parameters should be supplied through `options.qs`, not through the
 *   request body.
 */
async function call(method, path, options = {}) {
  const request = buildRequest(method, path, options)

  let response
  try {
    response = await fetch(request)
  } catch (error) {
    throw new Error(`request to ${path} failed: ${error && error.message}`)
  }

  let data
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    try {
      data = await response.json()
    } catch {
      data = null
    }
  } else if (contentType.includes('application/octet-stream') || contentType.includes('image')) {
    data = await response.arrayBuffer()
  } else {
    data = await response.text()
  }

  return {
    status: response.status,
    data,
    headers: Object.fromEntries(response.headers.entries()),
  }
}

module.exports = call
