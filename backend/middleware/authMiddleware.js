/**
 * Authentication middleware.
 * - protect: requires a valid "Authorization: Bearer <token>" JWT and loads
 *   the user attached to it as req.user.
 * - requireDb: returns a clear 503 when MongoDB is not connected, instead of
 *   letting queries hang or fail cryptically.
 */

const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const User = require('../models/User')
const { ApiError } = require('./errorMiddleware')

/**
 * Reads the JWT secret from the environment.
 * Never hardcodes a secret and never logs its value.
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret || !secret.trim()) {
    throw new ApiError(
      503,
      'JWT_SECRET is not configured. Add it to backend/.env (see backend/.env.example) and restart the server.',
    )
  }
  return secret
}

/** Signs an access token for a user id. */
function signToken(userId) {
  return jwt.sign({ sub: userId }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })
}

/** Protects routes: valid token required, user loaded into req.user. */
async function protect(req, _res, next) {
  try {
    const header = req.headers.authorization || ''
    if (!header.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authentication required. Please log in.')
    }

    const token = header.slice(7).trim()
    let payload
    try {
      payload = jwt.verify(token, getJwtSecret())
    } catch (_err) {
      throw new ApiError(401, 'Your session is invalid or has expired. Please log in again.')
    }

    const user = await User.findById(payload.sub)
    if (!user) {
      throw new ApiError(401, 'Your account no longer exists. Please log in again.')
    }

    req.user = user
    return next()
  } catch (error) {
    return next(error)
  }
}

/** 503 when MongoDB is not connected — keeps error messages useful. */
function requireDb(req, _res, next) {
  if (mongoose.connection.readyState !== 1) {
    return next(
      new ApiError(
        503,
        'The database is not connected. Set MONGODB_URI in backend/.env and restart the server.',
      ),
    )
  }
  return next()
}

module.exports = { protect, requireDb, getJwtSecret, signToken }
