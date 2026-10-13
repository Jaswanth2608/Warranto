'use strict'

const mongoose = require('mongoose')
const scanService = require('../lib/scanService')
const Product = require('../models/Product')
const { ApiError } = require('../middleware/errorMiddleware')

const scanResults = new Map()

/**
 * Store a scan result for later retrieval and product creation.
 * In production this would use a persistent store; here we keep it in memory
 * so the frontend can review suggestions before creating a product.
 */
function storeScanResult(scanId, result) {
  scanResults.set(scanId, result)
}

/**
 * GET /api/scan/:scanId — retrieve a previous scan result.
 */
exports.getScanResult = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.scanId)) {
      throw new ApiError(400, 'Invalid scan id.')
    }

    const result = scanResults.get(req.params.scanId)
    if (!result) {
      throw new ApiError(404, 'Scan result not found.')
    }

    res.json({ success: true, ...result })
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/scan/:scanId/create-product — create a product from a previous
 * scan result, applying the validated fields and attaching the stored bill.
 */
exports.createProductFromScan = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.scanId)) {
      throw new ApiError(400, 'Invalid scan id.')
    }

    const scanId = req.params.scanId
    const result = scanResults.get(scanId)
    if (!result) {
      throw new ApiError(404, 'Scan result not found.')
    }

    const file = result.file
    if (!file) {
      throw new ApiError(400, 'No bill file found for this scan.')
    }

    const created = await scanService.createProductFromScan(scanId, req.body, req.user.id, file)

    scanResults.delete(scanId)

    res.status(201).json({ success: true, ...created })
  } catch (error) {
    next(error)
  }
}

exports.storeScanResult = storeScanResult
