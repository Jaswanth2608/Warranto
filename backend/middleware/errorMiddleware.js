/**
 * Centralized error handling.
 * Every error response has the same shape the frontend expects:
 *   { success: false, message, errors?: [{ field, message }] }
 * Stack traces and secrets are only ever logged server-side, never sent
 * to the client.
 */

const mongoose = require('mongoose')

/** Masks credentials embedded in a message before it is logged or sent. */
function sanitize(message) {
  return String(message).replace(/\/\/[^@\s]*@/g, '//***@')
}

/** Convenience for throwing HTTP errors from anywhere (controllers, middleware). */
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
  }
}

/** 404 handler for any route that was not matched. */
function notFound(req, _res, next) {
  next(new ApiError(404, `Cannot ${req.method} ${req.originalUrl} — route not found.`))
}

/** eslint-disable-next-line no-unused-vars */
function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || err.status || 500
  let message = err.message || 'Something went wrong on the server.'
  let errors

  if (err.type === 'entity.parse.failed') {
    // Malformed JSON body
    statusCode = 400
    message = 'Request body contains invalid JSON.'
  } else if (err.name === 'CastError') {
    // Invalid MongoDB ObjectId or cast failure
    statusCode = 400
    message = `Invalid value for "${err.path}".`
  } else if (err.name === 'ValidationError' && err.errors) {
    // Mongoose schema validation
    statusCode = 400
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }))
    message = errors[0].message
  } else if (err.code === 11000) {
    // Duplicate unique index (e.g. email already registered)
    statusCode = 409
    message = 'That value is already in use. Please choose another.'
  } else if (err instanceof mongoose.Error) {
    // Database unreachable / not connected / query failed
    statusCode = 503
    message = 'The database is not available. Set MONGODB_URI in backend/.env and restart the server.'
  }

  if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} —`, err)
  }

  res.status(statusCode).json({
    success: false,
    message: sanitize(message),
    ...(errors ? { errors } : {}),
  })
}

module.exports = { ApiError, notFound, errorHandler }
