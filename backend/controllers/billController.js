/**
 * Bill controller — upload, replace, list, delete and read bill files.
 *
 * Response contracts (matched to frontend/src/services/billService.js):
 *   GET    /api/bills            → { success, count, bills: [...] }
 *   POST   /api/bills            → 201 { success, bill, product }
 *   PATCH  /api/bills/:productId → { success, bill, product }
 *   DELETE /api/bills/:productId → { success, message, id }
 *   GET    /api/bills/:productId/file → the stored file (stream or redirect)
 *
 * Rules:
 * - Every operation resolves the product with { _id, user: req.user.id }, so
 *   a foreign product id answers 404 — identical to a missing one, so ids
 *   cannot be probed and nobody can touch another user's bill.
 * - Only the file's URL and metadata are stored in MongoDB, never contents.
 * - Storage failures are surfaced as a clear 502 and never leave a half-
 *   written bill record: the database is only updated after the upload
 *   succeeds, and a failed replace keeps the previous bill intact.
 */

const fs = require('fs')
const mongoose = require('mongoose')

const Product = require('../models/Product')
const { ApiError } = require('../middleware/errorMiddleware')
const { toYMD } = require('../utils/warranty')
const {
  uploadBuffer,
  destroyAsset,
  resolveLocalPath,
  contentTypeFor,
  activeDriver,
} = require('../config/billStorage')

/** Uploads the buffered file and maps storage failures to a clear 502. */
async function storeFile(file, userId, productId) {
  try {
    return await uploadBuffer({
      buffer: file.buffer,
      userId,
      productId,
    })
  } catch (error) {
    // Logged server-side only; the client gets an actionable message.
    console.error(`[bills] Storage upload failed for product ${productId}:`, error.message)
    throw new ApiError(
      502,
      'The bill could not be uploaded to storage right now. Please try again in a moment.',
    )
  }
}

/** Best-effort cleanup of a previous asset — never fails the main request. */
async function cleanupAsset(publicId, resourceType, context) {
  if (!publicId) return
  try {
    await destroyAsset(publicId, resourceType)
  } catch (error) {
    console.error(`[bills] Could not delete stored asset (${context}):`, error.message)
  }
}

/** Validates the productId sent with an upload (body or param). */
function requireProductId(value) {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(400, 'A valid product id is required.')
  }
  return String(value)
}

/** Loads the product if it belongs to the current user, else 404. */
async function findOwnedProduct(productId, userId) {
  const product = await Product.findOne({ _id: productId, user: userId })
  if (!product) throw new ApiError(404, 'Product not found.')
  return product
}

/**
 * Resolves a bill request by either the product id (the canonical, product-
 * scoped contract the frontend uses) or the bill id that GET /api/bills
 * returns for every bill. Both lookups are scoped to the current user, so a
 * foreign or unknown id still answers the same 404 as a missing one.
 */
async function findOwnedProductByBillRef(ref, userId) {
  const byProduct = await Product.findOne({ _id: ref, user: userId })
  if (byProduct) return byProduct

  const byBill = await Product.findOne({ user: userId, 'bill._id': ref })
  if (byBill) return byBill

  throw new ApiError(404, 'Product not found.')
}

/** GET /api/bills — every bill attached to the current user's products. */
exports.listBills = async (req, res, next) => {
  try {
    const products = await Product.find({ user: req.user.id, bill: { $ne: null } }).sort({
      'bill.uploadedAt': -1,
      createdAt: -1,
    })

    const bills = products.map((product) => {
      const json = product.toJSON()
      return {
        ...json.bill,
        product: { id: json.id, name: json.name, brand: json.brand },
      }
    })

    res.json({ success: true, count: bills.length, bills })
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/bills — attach a bill to one of the user's products.
 * The file arrives as req.file after uploadBillFile. If the client sends a
 * JSON body with { productId }, that productId is also honored. Fails 409
 * when a bill already exists — use PATCH to replace it.
 */
exports.uploadBill = async (req, res, next) => {
  try {
    const productId = requireProductId(req.body?.productId || req.params.id)
    const product = await findOwnedProduct(productId, req.user.id)

    if (product.bill) {
      throw new ApiError(409, 'This product already has a bill. Replace it instead.')
    }

    const stored = await storeFile(req.file, req.user.id, productId)

    product.bill = {
      fileName: req.file.fileName,
      fileType: req.file.fileType,
      fileSize: req.file.size,
      uploadedAt: toYMD(new Date()),
      url: stored.url,
      publicId: stored.publicId,
      resourceType: stored.resourceType,
    }

    try {
      await product.save()
    } catch (error) {
      // The DB write failed — remove the freshly uploaded asset so nothing
      // is orphaned in storage, then surface the original error.
      await cleanupAsset(stored.publicId, stored.resourceType, 'save-failure rollback')
      throw error
    }

    res.status(201).json({ success: true, bill: product.toJSON().bill, product: product.toJSON() })
  } catch (error) {
    next(error)
  }
}

/**
 * PATCH /api/bills/:productId — replace the product's bill with a new file.
 * The file arrives as req.file after uploadBillFile. The productId may be
 * repeated in req.body for clients that send both, but req.params.id wins.
 * If no bill existed, this attaches one.
 */
exports.replaceBill = async (req, res, next) => {
  try {
    const productId = requireProductId(req.params.id || req.body?.productId)
    const product = await findOwnedProduct(productId, req.user.id)
    const previous = product.bill

    if (!req.file) {
      throw new ApiError(400, 'Please choose a bill file to upload.')
    }

    // Upload first: if storage fails, the existing bill stays untouched.
    const stored = await storeFile(req.file, req.user.id, productId)

    product.bill = {
      fileName: req.file.fileName,
      fileType: req.file.fileType,
      fileSize: req.file.size,
      uploadedAt: toYMD(new Date()),
      url: stored.url,
      publicId: stored.publicId,
      resourceType: stored.resourceType,
    }

    try {
      await product.save()
    } catch (error) {
      await cleanupAsset(stored.publicId, stored.resourceType, 'replace-save-failure rollback')
      throw error
    }

    // The old asset is no longer referenced — clean it up after the save.
    if (previous?.publicId && previous.publicId !== stored.publicId) {
      await cleanupAsset(previous.publicId, previous.resourceType, 'replaced bill')
    }

    res.json({ success: true, bill: product.toJSON().bill, product: product.toJSON() })
  } catch (error) {
    next(error)
  }
}

/**
 * DELETE /api/bills/:productId — remove the bill from the product.
 * The product itself stays in the account.
 */
exports.removeBill = async (req, res, next) => {
  try {
    const productId = requireProductId(req.params.id)
    const product = await findOwnedProduct(productId, req.user.id)

    if (!product.bill) {
      throw new ApiError(404, 'This product does not have a bill attached.')
    }

    const previous = product.bill
    product.bill = null
    await product.save()

    await cleanupAsset(previous.publicId, previous.resourceType, 'deleted bill')

    res.json({ success: true, message: 'Bill deleted.', id: productId })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/bills/:productId/file — authenticated read of the stored bill.
 * Local driver: streams the file from disk. Cloudinary: redirects to the
 * stored secure URL. Ownership is verified on every read.
 *
 * ?download=1 forces a download with the original file name.
 */
exports.getBillFile = async (req, res, next) => {
  try {
    const ref = requireProductId(req.params.id)
    const product = await findOwnedProductByBillRef(ref, req.user.id)
    const productId = product._id.toString()

    if (!product.bill || !product.bill.url) {
      throw new ApiError(404, 'No bill file is stored for this product.')
    }

    const asDownload = req.query.download === '1'
    const disposition = asDownload ? 'attachment' : 'inline'
    // RFC 5987 encoding keeps non-ASCII file names safe in the header.
    const encodedName = encodeURIComponent(product.bill.fileName)
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="bill.${String(product.bill.fileType || 'bin').toLowerCase()}"; filename*=UTF-8''${encodedName}`,
    )
    res.setHeader('Cache-Control', 'private, no-store')

    const localPath = resolveLocalPath(product.bill.publicId)
    if (localPath) {
      res.setHeader('Content-Type', contentTypeFor(product.bill.fileType))
      const stream = fs.createReadStream(localPath)
      stream.on('error', (error) => {
        console.error(`[bills] Could not read stored file for product ${productId}:`, error.message)
        if (!res.headersSent) {
          res.status(404).json({ success: false, message: 'The stored bill file could not be found.' })
        } else {
          res.destroy()
        }
      })
      return stream.pipe(res)
    }

    // Cloudinary driver — hand the browser the public delivery URL.
    return res.redirect(302, product.bill.url)
  } catch (error) {
    next(error)
  }
}

/** Which storage driver is active — used by the health endpoint. */
exports.storageDriver = activeDriver
