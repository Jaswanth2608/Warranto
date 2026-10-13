'use strict'

/**
 * Google sign-in verification (Google Identity Services ID tokens).
 *
 * The browser obtains a signed ID token from Google's hosted client library
 * (https://accounts.google.com/gsi/client) and posts it here as `credential`.
 * This module verifies the signature, issuer, expiry and audience against
 * GOOGLE_CLIENT_ID using Google's own library — identity claims are never
 * trusted from the client, and the token is never logged.
 *
 * The flow needs no client secret: an ID token is verified against Google's
 * public keys, not exchanged for an access token.
 */

const { ApiError } = require('../middleware/errorMiddleware')

let oauthClient = null

/** The configured OAuth client id, or null when Google sign-in is unavailable. */
function getGoogleClientId() {
  const value = process.env.GOOGLE_CLIENT_ID
  return value && value.trim() ? value.trim() : null
}

/** True when the server can verify Google credentials. */
function isGoogleConfigured() {
  return Boolean(getGoogleClientId())
}

/** Lazily built so the API boots even if Google sign-in is never configured. */
function getOAuthClient() {
  if (!oauthClient) {
    // Required lazily: Google sign-in is an optional feature and must not be
    // able to break unrelated startup.
    const { OAuth2Client } = require('google-auth-library')
    oauthClient = new OAuth2Client()
  }
  return oauthClient
}

const UNVERIFIED = 'That Google sign-in could not be verified. Please try again.'
const NOT_CONFIGURED =
  'Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID in backend/.env and restart.'

/**
 * Verifies a Google ID token and returns the claims the app is allowed to use.
 * Throws ApiError on any failure — callers never see raw library errors.
 *
 * @param {string} credential raw `credential` value from Google Identity Services
 * @returns {Promise<{googleId: string, email: string, fullName: string, avatarUrl: string}>}
 */
async function verifyGoogleCredential(credential) {
  const clientId = getGoogleClientId()
  if (!clientId) throw new ApiError(501, NOT_CONFIGURED)

  if (typeof credential !== 'string' || !credential.trim()) {
    throw new ApiError(400, 'A Google credential is required.')
  }
  // A JWT is well under this; anything larger is not a real credential.
  if (credential.length > 4096) throw new ApiError(400, 'That Google credential is not valid.')

  let payload
  try {
    const ticket = await getOAuthClient().verifyIdToken({
      idToken: credential.trim(),
      audience: clientId,
    })
    payload = ticket.getPayload()
  } catch (error) {
    // Expected for expired or forged tokens. Only a short, non-sensitive reason
    // is logged — never the token itself.
    const reason = error instanceof Error ? String(error.message).slice(0, 140) : 'unknown error'
    console.warn(`[auth] Rejected a Google ID token: ${reason}`)
    throw new ApiError(401, UNVERIFIED)
  }

  if (!payload || !payload.sub) throw new ApiError(401, UNVERIFIED)

  // A Google account without a verified email must never be able to claim a
  // local account that happens to share its address.
  if (!payload.email || payload.email_verified !== true) {
    throw new ApiError(401, 'Your Google account has no verified email address, so it cannot be used to sign in.')
  }

  const email = String(payload.email).toLowerCase().trim()

  return {
    googleId: String(payload.sub),
    email,
    fullName:
      (typeof payload.name === 'string' && payload.name.trim()) ||
      email.split('@')[0],
    avatarUrl: typeof payload.picture === 'string' ? payload.picture : '',
  }
}

module.exports = { isGoogleConfigured, verifyGoogleCredential, getGoogleClientId }
