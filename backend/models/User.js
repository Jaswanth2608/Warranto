/**
 * User model.
 * The password is stored only as a bcrypt hash (select: false so it is never
 * returned by queries unless explicitly requested for login).
 *
 * An account may be created with a password, with Google sign-in, or both — a
 * Google-linked account may set a password later, and a password account may
 * link Google on its first Google sign-in.
 */

const mongoose = require('mongoose')
const { toYMD } = require('../utils/warranty')

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required.'],
    trim: true,
    maxlength: [80, 'Full name must be 80 characters or fewer.'],
  },
  email: {
    type: String,
    required: [true, 'Email is required.'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [254, 'Email must be 254 characters or fewer.'],
  },
  passwordHash: {
    type: String,
    // Not `required`: accounts created through Google sign-in have no password.
    // Local registration always sets one (see authController.register) and
    // login still compares against it, so password auth is unchanged.
    select: false,
  },
  googleId: {
    type: String,
    trim: true,
    // Google's stable subject identifier. Only Google-linked accounts carry it,
    // and the partial index keeps local accounts out of the uniqueness check.
    index: {
      unique: true,
      partialFilterExpression: { googleId: { $type: 'string' } },
    },
  },
  avatarUrl: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
  notificationsEnabled: {
    type: Boolean,
    default: true,
  },
  memberSince: {
    type: Date,
    default: Date.now,
  },
  lastLoginAt: {
    type: Date,
    default: null,
  },
})

/**
 * Public JSON shape used by the API:
 *   { id, fullName, email, avatarUrl, notificationsEnabled,
 *     memberSince: "YYYY-MM-DD", lastLoginAt: ISO string }
 * The password hash and Mongo internals are never exposed.
 */
userSchema.set('toJSON', {
  transform(_doc, ret) {
    if (ret._id) ret.id = ret._id.toString()
    delete ret._id
    delete ret.__v
    delete ret.passwordHash
    // Internal identity-provider link — not part of the public user shape.
    delete ret.googleId
    if (ret.memberSince) ret.memberSince = toYMD(ret.memberSince)
    return ret
  },
})

module.exports = mongoose.model('User', userSchema)
