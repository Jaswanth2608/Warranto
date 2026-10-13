/**
 * Auth controller — register, login, current user, profile and password.
 *
 * Response contracts (matched to frontend/src/services/authService.js):
 *   POST   /api/auth/register       → 201 { success, token, user }
 *   POST   /api/auth/login          → 200 { success, token, user }
 *   POST   /api/auth/google         → 200 { success, token, user }  (verified ID token)
 *   GET    /api/auth/providers      → 200 { success, providers }
 *   GET    /api/auth/me             → 200 { success, user }
 *   POST   /api/auth/logout         → 200 { success, message }   (stateless JWT)
 *   PATCH  /api/auth/profile        → 200 { success, user }
 *   POST   /api/auth/change-password→ 200 { success, message }
 *
 * Passwords are hashed with bcryptjs; tokens are signed with JWT_SECRET.
 * Duplicate emails are handled safely (409, no stack trace).
 */

const bcrypt = require('bcryptjs')
const User = require('../models/User')
const { ApiError } = require('../middleware/errorMiddleware')
const { signToken } = require('../middleware/authMiddleware')
const { isGoogleConfigured, verifyGoogleCredential } = require('../lib/googleAuth')

const SALT_ROUNDS = 10

/** POST /api/auth/register */
exports.register = async (req, res, next) => {
  try {
    const body = req.body || {}
    const email = String(body.email || '').toLowerCase().trim()

    const existing = await User.findOne({ email })
    if (existing) {
      throw new ApiError(409, 'An account with this email already exists.')
    }

    const passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS)
    const user = await User.create({
      fullName: String(body.fullName).trim(),
      email,
      passwordHash,
      memberSince: new Date(),
      lastLoginAt: new Date(),
    })

    res.status(201).json({ success: true, token: signToken(user.id), user: user.toJSON() })
  } catch (error) {
    // Backstop for the race where two registrations hit the unique index at once.
    if (error && error.code === 11000) {
      return next(new ApiError(409, 'An account with this email already exists.'))
    }
    next(error)
  }
}

/** POST /api/auth/login */
exports.login = async (req, res, next) => {
  try {
    const body = req.body || {}
    const email = String(body.email || '').toLowerCase().trim()

    const user = await User.findOne({ email }).select('+passwordHash')
    // Same message for "no such user" and "wrong password" — no account probing.
    // A Google-only account has no hash, so it can never match a password.
    const valid =
      user &&
      user.passwordHash &&
      (await bcrypt.compare(String(body.password || ''), user.passwordHash))
    if (!valid) {
      throw new ApiError(401, 'Incorrect email or password.')
    }

    user.lastLoginAt = new Date()
    await user.save()

    res.json({ success: true, token: signToken(user.id), user: user.toJSON() })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/auth/providers — which sign-in methods this server offers.
 * Public and secret-free: it only reveals whether Google sign-in is configured,
 * so the UI can hide the option instead of failing after a click.
 */
exports.getProviders = (_req, res) => {
  res.json({
    success: true,
    providers: {
      password: true,
      google: isGoogleConfigured(),
    },
  })
}

/**
 * POST /api/auth/google — sign in with a Google Identity Services ID token.
 *
 * The token is verified server-side (signature, issuer, expiry, audience).
 * Linking rules:
 *   - The Google subject (`sub`) is the durable identity key, never the email.
 *   - A new account is created only when the verified email is unknown.
 *   - An existing password account is linked when Google reports the same
 *     *verified* email — the same claim password reset relies on. An unverified
 *     email can never take over an account.
 *   - An account already linked to a different Google subject is refused.
 * The response uses the exact same JWT shape as password login, so every
 * protected route and per-user data scope works unchanged.
 */
exports.googleSignIn = async (req, res, next) => {
  try {
    const identity = await verifyGoogleCredential(req.body?.credential)

    let user = await User.findOne({ googleId: identity.googleId })

    if (!user) {
      const existing = await User.findOne({ email: identity.email })

      if (existing) {
        if (existing.googleId && existing.googleId !== identity.googleId) {
          throw new ApiError(409, 'This email is already linked to a different Google account.')
        }
        existing.googleId = identity.googleId
        if (!existing.avatarUrl && identity.avatarUrl) existing.avatarUrl = identity.avatarUrl
        user = existing
      } else {
        user = new User({
          fullName: identity.fullName,
          email: identity.email,
          googleId: identity.googleId,
          avatarUrl: identity.avatarUrl,
          memberSince: new Date(),
        })
      }
    }

    user.lastLoginAt = new Date()
    await user.save()

    res.json({ success: true, token: signToken(user.id), user: user.toJSON() })
  } catch (error) {
    // Two simultaneous first sign-ins can race on the unique indexes.
    if (error && error.code === 11000) {
      return next(
        new ApiError(409, 'That account already exists. Sign in with your email and password.'),
      )
    }
    next(error)
  }
}

/** GET /api/auth/me — requires a valid token (protect middleware). */
exports.me = (req, res) => {
  res.json({ success: true, user: req.user.toJSON() })
}

/** POST /api/auth/logout — JWTs are stateless; the client drops the token. */
exports.logout = (_req, res) => {
  res.json({ success: true, message: 'Logged out successfully.' })
}

/** PATCH /api/auth/profile */
exports.updateProfile = async (req, res, next) => {
  try {
    const body = req.body || {}
    const user = req.user

    if (typeof body.fullName === 'string' && body.fullName.trim()) {
      user.fullName = body.fullName.trim()
    }
    if (typeof body.email === 'string' && body.email.trim()) {
      user.email = body.email.trim().toLowerCase()
    }
    if (typeof body.avatarUrl === 'string') {
      user.avatarUrl = body.avatarUrl
    }
    if (typeof body.notificationsEnabled === 'boolean') {
      user.notificationsEnabled = body.notificationsEnabled
    }

    await user.save()
    res.json({ success: true, user: user.toJSON() })
  } catch (error) {
    if (error && error.code === 11000) {
      return next(new ApiError(409, 'An account with this email already exists.'))
    }
    next(error)
  }
}

/** POST /api/auth/change-password */
exports.changePassword = async (req, res, next) => {
  try {
    const body = req.body || {}

    const user = await User.findById(req.user.id).select('+passwordHash')
    if (!user) {
      throw new ApiError(401, 'Your account no longer exists. Please log in again.')
    }

    // Google-only accounts have no password to compare against.
    if (!user.passwordHash) {
      throw new ApiError(
        400,
        'This account signs in with Google and has no password yet. Set one from Settings after signing in.',
      )
    }

    const valid = await bcrypt.compare(String(body.currentPassword || ''), user.passwordHash)
    if (!valid) {
      throw new ApiError(401, 'Your current password is incorrect.')
    }

    user.passwordHash = await bcrypt.hash(body.newPassword, SALT_ROUNDS)
    await user.save()

    res.json({ success: true, message: 'Password changed successfully.' })
  } catch (error) {
    next(error)
  }
}
