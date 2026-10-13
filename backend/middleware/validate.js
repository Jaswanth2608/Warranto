/**
 * Shared express-validator result handler.
 * Usage: route chain of validators → validate → controller
 * Responds 400 with { success: false, message, errors: [{ field, message }] }
 * so the frontend can show field-level messages.
 */

const { validationResult } = require('express-validator')

function validate(req, res, next) {
  const result = validationResult(req)
  if (result.isEmpty()) return next()

  const errors = result.array().map((issue) => ({
    field: issue.path,
    message: issue.msg,
  }))

  return res.status(400).json({
    success: false,
    message: errors[0].message,
    errors,
  })
}

module.exports = validate
