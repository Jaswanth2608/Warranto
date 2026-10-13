'use strict'

const { Router } = require('express')
const { param } = require('express-validator')
const mongoose = require('mongoose')

const validate = require('../middleware/validate')
const { protect, requireDb } = require('../middleware/authMiddleware')
const scanController = require('../controllers/scanController')
const { uploadBillFile } = require('../middleware/uploadBill')
const scanService = require('../lib/scanService')
const Product = require('../models/Product')
const { ApiError } = require('../middleware/errorMiddleware')

const router = Router()

const idRule = param('scanId').isMongoId().withMessage('Invalid scan id.')

/**
 * POST /api/scan — upload a bill, run OCR, and return extracted field
 * suggestions. The bill is stored immediately so the original is preserved
 * even if OCR fails. No product is created without an explicit user action.
 */
router.post(
  '/',
  protect,
  requireDb,
  uploadBillFile,
  async (req, res, next) => {
    try {
      const productId = req.body?.productId
      if (productId && !mongoose.isValidObjectId(productId)) {
        throw new ApiError(400, 'Invalid product id.')
      }

      const ownedProduct = productId
        ? await Product.findOne({ _id: productId, user: req.user.id }).select('id name')
        : null

      if (productId && !ownedProduct) {
        throw new ApiError(404, 'Product not found.')
      }

      const result = await scanService.scan(req.file, ownedProduct, req.user.id)

      // Keep the uploaded file with the scan result so the review →
      // create-product step can attach it. Without this, creation always
      // fails with "No bill file found for this scan."
      scanController.storeScanResult(result.scanId, { ...result, file: req.file })

      res.status(201).json({
        success: true,
        scanId: result.scanId,
        // Metadata only — echoing req.file would serialize the whole buffer
        // (up to 10 MB) back to the browser.
        file: {
          fileName: req.file.fileName,
          fileType: req.file.fileType,
          size: req.file.size,
          mimeType: req.file.mimeType,
        },
        suggestions: result.suggestions,
        rawText: result.rawText,
        source: result.source,
        processingTimeMs: result.processingTimeMs,
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * GET /api/scan/:scanId — retrieve a previous scan result.
 */
router.get('/:scanId', [idRule], validate, protect, requireDb, scanController.getScanResult)

/**
 * POST /api/scan/:scanId/create-product — create a product from a previous
 * scan result, applying the validated fields and attaching the stored bill.
 * This is the only path that creates a product, and it re-validates everything.
 */
router.post(
  '/:scanId/create-product',
  [idRule, ...scanService.createProductRules({ partial: false })],
  validate,
  protect,
  requireDb,
  scanController.createProductFromScan,
)

module.exports = router
