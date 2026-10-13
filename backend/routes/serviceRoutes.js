'use strict'

const { Router } = require('express')
const { body, param } = require('express-validator')

const validate = require('../middleware/validate')
const { protect, requireDb } = require('../middleware/authMiddleware')
const serviceController = require('../controllers/serviceController')
const ServiceRecord = require('../models/ServiceRecord')
const Product = require('../models/Product')
const { isYMD } = require('../utils/warranty')

const router = Router()

const SERVICE_TYPES = ServiceRecord.SERVICE_TYPES.map((t) => t.value)

const toStr = (value) => (value === undefined || value === null ? value : String(value))

const isRealDate = (value) => {
  if (!isYMD(value)) throw new Error('Date must be a valid calendar date (YYYY-MM-DD).')
  return true
}

function serviceRules({ partial }) {
  const required = (chain) => (partial ? chain.optional() : chain)
  const optionalText = (chain) => chain.optional({ values: 'falsy' })

  return [
    required(
      body('serviceDate')
        .customSanitizer(toStr)
        .trim()
        .notEmpty()
        .withMessage('Service date is required.')
        .bail()
        .custom(isRealDate),
    ),
    required(
      body('serviceType')
        .customSanitizer(toStr)
        .notEmpty()
        .withMessage('Service type is required.')
        .bail()
        .isIn(SERVICE_TYPES)
        .withMessage(`Service type must be one of: ${SERVICE_TYPES.join(', ')}.`),
    ),
    optionalText(
      body('serviceCentre')
        .trim()
        .isLength({ max: 150 })
        .withMessage('Service centre must be 150 characters or fewer.'),
    ),
    optionalText(
      body('technician')
        .trim()
        .isLength({ max: 150 })
        .withMessage('Technician name must be 150 characters or fewer.'),
    ),
    optionalText(
      body('issueDescription')
        .trim()
        .isLength({ max: 4000 })
        .withMessage('Issue description must be 4000 characters or fewer.'),
    ),
    optionalText(
      body('workPerformed')
        .trim()
        .isLength({ max: 4000 })
        .withMessage('Work performed must be 4000 characters or fewer.'),
    ),
    body('serviceCost')
      .customSanitizer(toStr)
      .optional()
      .isFloat({ min: 0, max: 100000000 })
      .withMessage('Service cost must be a number between 0 and 100000000.')
      .bail()
      .toFloat(),
    optionalText(
      body('currency')
        .trim()
        .isLength({ max: 3 })
        .withMessage('Currency must be 3 characters or fewer.'),
    ),
    body('nextServiceDate')
      .customSanitizer(toStr)
      .optional()
      .custom((value) => {
        if (!value) return true
        if (!isYMD(value)) throw new Error('Next service date must be a valid date (YYYY-MM-DD).')
        return true
      }),
    optionalText(
      body('notes')
        .trim()
        .isLength({ max: 2000 })
        .withMessage('Notes must be 2000 characters or fewer.'),
    ),
  ]
}

const idRule = param('id').isMongoId().withMessage('Invalid service record id.')

router.get('/', protect, requireDb, serviceController.listServiceRecords)

router.get('/:id', [idRule], validate, protect, requireDb, serviceController.getServiceRecord)

router.post(
  '/',
  [body('product').isMongoId().withMessage('Invalid product id.'), ...serviceRules({ partial: false })],
  validate,
  protect,
  requireDb,
  serviceController.createServiceRecord,
)

router.patch(
  '/:id',
  [idRule, ...serviceRules({ partial: true })],
  validate,
  protect,
  requireDb,
  serviceController.updateServiceRecord,
)

router.delete('/:id', [idRule], validate, protect, requireDb, serviceController.deleteServiceRecord)

module.exports = router
