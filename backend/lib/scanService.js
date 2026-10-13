'use strict'

const crypto = require('crypto')
const Product = require('../models/Product')
const { ApiError } = require('../middleware/errorMiddleware')
const { uploadBuffer } = require('../config/billStorage')
const { extractBillText, extractSuggestions } = require('./ocrScanner')
const { toYMD, isYMD, getWarrantyExpiryDate, STATUS } = require('../utils/warranty')

const CREATABLE_FIELDS = [
  'name',
  'brand',
  'category',
  'modelNumber',
  'serialNumber',
  'purchaseDate',
  'purchasePrice',
  'seller',
  'warrantyMonths',
  'warrantyType',
  'notes',
]

function pickFields(body) {
  const fields = {}
  for (const key of CREATABLE_FIELDS) {
    if (body[key] !== undefined) fields[key] = body[key]
  }
  return fields
}

const CATEGORIES = Product.CATEGORIES
const WARRANTY_TYPES = Product.WARRANTY_TYPES

const toStr = (value) => (value === undefined || value === null ? value : String(value))
const body = require('express-validator').body

const isRealDate = (value) => {
  if (!isYMD(value)) throw new Error('Date must be a valid calendar date (YYYY-MM-DD).')
  return true
}

const isNotFuture = (value) => {
  if (value > toYMD(new Date())) throw new Error('Purchase date cannot be in the future.')
  return true
}

function createProductRules({ partial }) {
  const required = (chain) => (partial ? chain.optional() : chain)
  const optionalText = (chain) => chain.optional({ values: 'falsy' })

  return [
    required(
      body('name')
        .customSanitizer(toStr)
        .trim()
        .notEmpty()
        .withMessage('Product name is required.')
        .bail()
        .isLength({ max: 120 })
        .withMessage('Product name must be 120 characters or fewer.'),
    ),
    required(
      body('brand')
        .customSanitizer(toStr)
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
        .customSanitizer(toStr)
        .trim()
        .isLength({ max: 100 })
        .withMessage('Model number must be 100 characters or fewer.'),
    ),
    optionalText(
      body('serialNumber')
        .customSanitizer(toStr)
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
        .customSanitizer(toStr)
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
        .customSanitizer(toStr)
        .trim()
        .isLength({ max: 2000 })
        .withMessage('Notes must be 2000 characters or fewer.'),
    ),
  ]
}

/**
 * Run OCR on a bill upload and return suggestions.
 * The bill is stored immediately so the original is preserved.
 */
async function scan(file, ownedProduct, userId) {
  if (!file || !file.buffer) {
    throw new ApiError(400, 'Please choose a bill file to upload.')
  }

  const fileType = file.fileType || 'FILE'
  const mimeType = file.mimeType

  if (!['PDF', 'JPG', 'PNG'].includes(fileType)) {
    throw new ApiError(400, 'Unsupported file type for OCR. Please upload a PDF, JPG or PNG.')
  }

  const t0 = Date.now()

  let text = ''
  let source = 'unknown'

  try {
    const extracted = await extractBillText(file.buffer, fileType, mimeType)
    text = extracted.text
    source = extracted.source
  } catch (error) {
    if (error.message && error.message.includes('too large')) {
      throw new ApiError(400, 'The scanned image is too large for OCR. Please use a smaller file or a PDF.')
    }
    if (error.message && error.message.includes('Unsupported file type')) {
      throw new ApiError(400, 'This file type cannot be scanned.')
    }
    throw new ApiError(422, 'Could not extract text from the uploaded bill. Please check the file and try again.')
  }

  const suggestions = extractSuggestions(text)

  // Scan ids must satisfy the routes' isMongoId() param rule (24 hex chars),
  // so the review → create-product round trip validates. Random bytes keep
  // ids unguessable without needing a database sequence.
  const scanId = crypto.randomBytes(12).toString('hex')

  return {
    scanId,
    suggestions,
    rawText: text.slice(0, 10000),
    source,
    processingTimeMs: Date.now() - t0,
  }
}

/**
 * Create a product from a validated scan payload.
 * The bill must already be stored separately; this path only creates the product.
 */
async function createProductFromScan(scanId, body, userId, file) {
  const fields = pickFields(body)

  if (!fields.name || !fields.brand || !fields.purchaseDate || !fields.purchasePrice || !fields.warrantyMonths) {
    throw new ApiError(400, 'Please provide product name, brand, purchase date, purchase price, and warranty duration.')
  }

  const product = new Product({
    ...fields,
    user: userId,
    bill: null,
  })

  product.warrantyExpiryDate = getWarrantyExpiryDate(product.purchaseDate, product.warrantyMonths)
  if (!product.warrantyExpiryDate) {
    throw new ApiError(400, 'Could not calculate the warranty expiry date.')
  }

  await product.save()

  const stored = await uploadBuffer({
    buffer: file.buffer,
    userId,
    productId: product._id,
  })

  product.bill = {
    fileName: file.fileName,
    fileType: file.fileType,
    fileSize: file.size,
    uploadedAt: toYMD(new Date()),
    url: stored.url,
    publicId: stored.publicId,
    resourceType: stored.resourceType,
  }

  await product.save()

  return {
    product: product.toJSON(),
    bill: product.toJSON().bill,
  }
}

module.exports = {
  scan,
  createProductFromScan,
  createProductRules,
  pickFields,
  CREATABLE_FIELDS,
  CATEGORIES,
  WARRANTY_TYPES,
}
