/**
 * Product routes — all protected and scoped to the authenticated user.
 *
 *   GET    /api/products
 *   GET    /api/products/:id
 *   POST   /api/products
 *   PATCH  /api/products/:id
 *   DELETE /api/products/:id
 *
 * Validation → auth → database guard → controller, so bad input answers 400
 * immediately and unauthenticated requests answer 401.
 */

const { Router } = require('express')
const { body, param } = require('express-validator')

const validate = require('../middleware/validate')
const { protect, requireDb } = require('../middleware/authMiddleware')
const productController = require('../controllers/productController')
const Product = require('../models/Product')
const { isYMD, toYMD } = require('../utils/warranty')

const router = Router()

const CATEGORIES = Product.CATEGORIES
const WARRANTY_TYPES = Product.WARRANTY_TYPES

// express-validator needs strings; the frontend sends numbers for
// purchasePrice and warrantyMonths (see ProductForm.jsx).
const toStr = (value) => (value === undefined || value === null ? value : String(value))

const isRealDate = (value) => {
  if (!isYMD(value)) throw new Error('Date must be a valid calendar date (YYYY-MM-DD).')
  return true
}

const isNotFuture = (value) => {
  if (value > toYMD(new Date())) throw new Error('Purchase date cannot be in the future.')
  return true
}

/**
 * Builds the validator chain for POST (partial=false) or PATCH (partial=true).
 * - Required fields: enforced on POST; optional on PATCH but must be valid
 *   when present (a blank name still fails with "Product name is required.").
 * - Optional text fields: skipped when absent or blank, model defaults apply.
 */
function productRules({ partial }) {
  const required = (chain) => (partial ? chain.optional() : chain)
  const optionalText = (chain) => chain.optional({ values: 'falsy' })

  return [
    required(
      body('name')
        .trim()
        .notEmpty()
        .withMessage('Product name is required.')
        .bail()
        .isLength({ max: 120 })
        .withMessage('Product name must be 120 characters or fewer.'),
    ),
    required(
      body('brand')
        .trim()
        .notEmpty()
        .withMessage('Brand is required.')
        .bail()
        .isLength({ max: 80 })
        .withMessage('Brand must be 80 characters or fewer.'),
    ),
    optionalText(
      body('category')
        .isIn(CATEGORIES)
        .withMessage('Choose a valid category (electronics, appliances, furniture, accessories, other).'),
    ),
    optionalText(
      body('modelNumber')
        .trim()
        .isLength({ max: 100 })
        .withMessage('Model number must be 100 characters or fewer.'),
    ),
    optionalText(
      body('serialNumber')
        .trim()
        .isLength({ max: 100 })
        .withMessage('Serial number must be 100 characters or fewer.'),
    ),
    required(
      body('purchaseDate')
        .customSanitizer(toStr)
        .trim()
        .notEmpty()
        .withMessage('Purchase date is required.')
        .bail()
        .custom(isRealDate)
        .bail()
        .custom(isNotFuture),
    ),
    required(
      body('purchasePrice')
        .customSanitizer(toStr)
        .notEmpty()
        .withMessage('Purchase price is required.')
        .bail()
        .isFloat({ min: 0, max: 100000000 })
        .withMessage('Purchase price must be a number between 0 and 100000000.')
        .bail()
        .toFloat(),
    ),
    optionalText(
      body('seller')
        .trim()
        .isLength({ max: 150 })
        .withMessage('Seller must be 150 characters or fewer.'),
    ),
    required(
      body('warrantyMonths')
        .customSanitizer(toStr)
        .notEmpty()
        .withMessage('Warranty duration is required.')
        .bail()
        .isInt({ min: 1, max: 120 })
        .withMessage('Warranty duration must be between 1 and 120 months.')
        .bail()
        .toInt(),
    ),
    optionalText(
      body('warrantyType')
        .isIn(WARRANTY_TYPES)
        .withMessage('Choose a valid warranty type.'),
    ),
    optionalText(
      body('notes')
        .trim()
        .isLength({ max: 2000 })
        .withMessage('Notes must be 2000 characters or fewer.'),
    ),
  ]
}

const idRule = param('id').isMongoId().withMessage('Invalid product id.')

router.get('/', protect, requireDb, productController.listProducts)

router.post('/', productRules({ partial: false }), validate, protect, requireDb, productController.createProduct)

router.get('/:id', [idRule], validate, protect, requireDb, productController.getProduct)

router.patch(
  '/:id',
  [idRule, ...productRules({ partial: true })],
  validate,
  protect,
  requireDb,
  productController.updateProduct,
)

router.delete('/:id', [idRule], validate, protect, requireDb, productController.deleteProduct)

module.exports = router
