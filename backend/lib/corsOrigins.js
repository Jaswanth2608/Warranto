'use strict'

/**
 * CORS origin configuration helpers.
 *
 * `CLIENT_URL` holds one or more comma-separated browser origins. Each entry is
 * either an exact origin (the safe default) or contains `*` as a wildcard:
 *
 *   CLIENT_URL=https://warranto.vercel.app,https://*.vercel.app
 *
 * A `*` matches any run of characters except `/`, so `https://*.vercel.app`
 * matches the production alias and every Vercel preview deployment while never
 * matching a path or a different scheme.
 *
 * Wildcards are safe for this API even though they widen the allow-list:
 * authentication uses a Bearer token stored in the app's own localStorage, never
 * a cookie, so another origin cannot read a signed-in user's credentials just
 * because it is allowed by CORS.
 */

/** Escape a literal origin so it is safe inside a RegExp. */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Parse a raw CLIENT_URL value into trimmed origins (no trailing slash). */
function parseOrigins(clientUrl) {
  return String(clientUrl || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

/**
 * Build the CORS origin matcher.
 *
 * @param {string} clientUrl  Raw CLIENT_URL value.
 * @param {{ isProduction?: boolean }} [options]
 *   When not production, the local Vite dev/preview origins are always allowed
 *   so localhost development keeps working unchanged.
 * @returns {{ allowedOrigins: string[], allowedOriginPatterns: RegExp[], isAllowedOrigin: (origin: string) => boolean }}
 */
function buildOriginMatcher(clientUrl, options = {}) {
  const allowedOrigins = parseOrigins(clientUrl)

  // Local origins are only relevant outside production:
  // 5173 = `npm run dev`, 4173 = `npm run preview` (production build served locally).
  if (!options.isProduction) {
    allowedOrigins.push(
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
    )
  }

  const allowedOriginPatterns = allowedOrigins
    .filter((origin) => origin.includes('*'))
    .map((origin) => new RegExp(`^${escapeRegExp(origin).replace(/\\\*/g, '[^/]*')}$`, 'i'))

  function isAllowedOrigin(origin) {
    if (!origin) return true
    if (allowedOrigins.includes(origin)) return true
    return allowedOriginPatterns.some((pattern) => pattern.test(origin))
  }

  return { allowedOrigins, allowedOriginPatterns, isAllowedOrigin }
}

module.exports = { buildOriginMatcher, parseOrigins, escapeRegExp }
