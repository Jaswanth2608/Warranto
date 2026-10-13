/**
 * Auth routes.
 * Validation runs before the database is touched, so malformed requests get
 * an instant 400 even if MongoDB is offline.
 *
 *   GET    /api/auth/providers       which sign-in methods are available
 *   POST   /api/auth/register
 *   POST   /api/auth/login
 *   POST   /api/auth/google          Google Identity Services ID token
 *   GET    /api/auth/me              (protected)
 *   POST   /api/auth/logout
 *   PATCH  /api/auth/profile         (protected)
 *   POST   /api/auth/change-password (protected)
 */

const { Router } = require('express')
const { body } = require('express-validator')

const validate = require('../middleware/validate')
const { protect, requireDb } = require('../middleware/authMiddleware')
const authController = require('../controllers/authController')

const router = Router()

// express-validator needs strings; the frontend may send numbers/booleans.
const toStr = (value) => (value === undefined || value === null ? value : String(value))

const emailRules = body('email')
  .customSanitizer(toStr)
  .trim()
  .notEmpty()
  .withMessage('Email is required.')
  .bail()
  .isEmail()
  .withMessage('Enter a valid email address.')
  .bail()
  .customSanitizer((value) => value.toLowerCase())

// Same password requirements the Register page shows to the user.
const newPasswordRules = body('password')
  .customSanitizer(toStr)
  .notEmpty()
  .withMessage('Password is required.')
  .bail()
  .isLength({ min: 8, max: 72 })
  .withMessage('Password must be at least 8 characters.')
  .bail()
  .matches(/[a-z]/)
  .withMessage('Password must include a lowercase letter.')
  .bail()
  .matches(/[A-Z]/)
  .withMessage('Password must include an uppercase letter.')
  .bail()
  .matches(/\d/)
  .withMessage('Password must include a number.')

router.post(
  '/register',
  [
    body('fullName')
      .trim()
      .notEmpty()
      .withMessage('Full name is required.')
      .bail()
      .isLength({ max: 80 })
      .withMessage('Full name must be 80 characters or fewer.'),
    emailRules,
    newPasswordRules,
  ],
  validate,
  requireDb,
  authController.register,
)

router.post(
  '/login',
  [
    emailRules,
    body('password')
      .customSanitizer(toStr)
      .notEmpty()
      .withMessage('Password is required.')
      .bail()
      .isLength({ max: 72 })
      .withMessage('Password must be 72 characters or fewer.'),
  ],
  validate,
  requireDb,
  authController.login,
)

/**
 * POST /api/auth/google — the body only ever carries Google's signed ID token;
 * everything about the identity is derived from the verified token server-side.
 */
router.post(
  '/google',
  [
    body('credential')
      .customSanitizer(toStr)
      .trim()
      .notEmpty()
      .withMessage('A Google credential is required.')
      .bail()
      .isLength({ max: 4096 })
      .withMessage('That Google credential is not valid.'),
  ],
  validate,
  requireDb,
  authController.googleSignIn,
)

router.get('/providers', authController.getProviders)

router.get('/me', protect, authController.me)

router.post('/logout', authController.logout)

router.patch(
  '/profile',
  protect,
  [
    body('fullName')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ min: 1, max: 80 })
      .withMessage('Full name must be between 1 and 80 characters.'),
    body('email')
      .optional({ values: 'falsy' })
      .customSanitizer(toStr)
      .trim()
      .isEmail()
      .withMessage('Enter a valid email address.')
      .bail()
      .customSanitizer((value) => value.toLowerCase()),
    body('avatarUrl')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 500 })
      .withMessage('Avatar URL must be 500 characters or fewer.'),
    body('notificationsEnabled')
      .optional()
      .custom((value) => typeof value === 'boolean')
      .withMessage('notificationsEnabled must be true or false.'),
  ],
  validate,
  authController.updateProfile,
)

router.post(
  '/change-password',
  protect,
  [
    body('currentPassword')
      .customSanitizer(toStr)
      .notEmpty()
      .withMessage('Current password is required.'),
    body('newPassword')
      .customSanitizer(toStr)
      .notEmpty()
      .withMessage('New password is required.')
      .bail()
      .isLength({ min: 8, max: 72 })
      .withMessage('New password must be at least 8 characters.'),
  ],
  validate,
  authController.changePassword,
)

module.exports = router
