/**
 * Product controller — CRUD scoped to the authenticated user.
 *
 * Response contracts (matched to frontend/src/services/productService.js):
 *   GET    /api/products      → { success, count, products: [...] }
 *   GET    /api/products/:id  → { success, product }
 *   POST   /api/products      → 201 { success, product }
 *   PATCH  /api/products/:id  → { success, product }
 *   DELETE /api/products/:id  → { success, message, id }
 *
 * Rules:
 * - Every product belongs to req.user; queries always filter by owner, so
 *   users can never read, update or delete someone else's product (a foreign
 *   id answers 404, same as a missing one, so ids cannot be probed).
 * - warrantyExpiryDate and status are derived on the server. Any client
 *   supplied "status" is ignored.
 * - Bills are managed exclusively through /api/bills (real file storage);
 *   any "bill" field in these payloads is ignored.
 */

const Product = require('../models/Product')
const { ApiError } = require('../middleware/errorMiddleware')
const { getWarrantyExpiryDate, statusQuery, STATUS } = require('../utils/warranty')

/** Only these fields are ever taken from the request body (whitelist). */
const UPDATABLE_FIELDS = [
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

/** Builds the fields object from a (validated) request body. */
function pickFields(body) {
  const fields = {}
  for (const key of UPDATABLE_FIELDS) {
    if (body[key] !== undefined) fields[key] = body[key]
  }
  return fields
}

/** GET /api/products — supports ?search= &status= &category= &sort= */
exports.listProducts = async (req, res, next) => {
  try {
    const query = { user: req.user.id }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    if (search) {
      // Escape regex metacharacters so user input is matched literally.
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(safe, 'i')
      query.$or = [
        { name: pattern },
        { brand: pattern },
        { modelNumber: pattern },
        { serialNumber: pattern },
        { seller: pattern },
      ]
    }

    const status = typeof req.query.status === 'string' ? req.query.status : ''
    if (status && status !== 'all') {
      if (![STATUS.ACTIVE, STATUS.EXPIRING_SOON, STATUS.EXPIRED].includes(status)) {
        throw new ApiError(400, 'status must be one of: active, expiring, expired, all.')
      }
      Object.assign(query, statusQuery(status))
    }

    const category = typeof req.query.category === 'string' ? req.query.category : ''
    if (category && category !== 'all') query.category = category

    let sort = { createdAt: -1 }
    if (req.query.sort === 'oldest') sort = { createdAt: 1 }
    else if (req.query.sort === 'expiry') sort = { warrantyExpiryDate: 1 }
    else if (req.query.sort === 'price') sort = { purchasePrice: -1 }
    else if (req.query.sort && req.query.sort !== 'newest') {
      throw new ApiError(400, 'sort must be one of: newest, oldest, expiry, price.')
    }

    const products = await Product.find(query).sort(sort)
    res.json({ success: true, count: products.length, products })
  } catch (error) {
    next(error)
  }
}

/** GET /api/products/:id */
exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, user: req.user.id })
    if (!product) throw new ApiError(404, 'Product not found.')
    res.json({ success: true, product })
  } catch (error) {
    next(error)
  }
}

/** POST /api/products */
exports.createProduct = async (req, res, next) => {
  try {
    const body = req.body || {}
    const fields = pickFields(body)

    const product = new Product({
      ...fields,
      user: req.user.id,
      bill: null,
    })
    // Derived on the server — identical rule to the frontend's warranty.js.
    product.warrantyExpiryDate = getWarrantyExpiryDate(
      product.purchaseDate,
      product.warrantyMonths,
    )
    if (!product.warrantyExpiryDate) {
      throw new ApiError(400, 'Could not calculate the warranty expiry date.')
    }

    await product.save()
    res.status(201).json({ success: true, product: product.toJSON() })
  } catch (error) {
    next(error)
  }
}

/** PATCH /api/products/:id */
exports.updateProduct = async (req, res, next) => {
  try {
    const body = req.body || {}

    const product = await Product.findOne({ _id: req.params.id, user: req.user.id })
    if (!product) throw new ApiError(404, 'Product not found.')

    const fields = pickFields(body)
    if (Object.keys(fields).length === 0) {
      throw new ApiError(400, 'No updatable fields were provided.')
    }

    const warrantyInputsChanged =
      fields.purchaseDate !== undefined || fields.warrantyMonths !== undefined
    Object.assign(product, fields)

    if (warrantyInputsChanged || !product.warrantyExpiryDate) {
      product.warrantyExpiryDate = getWarrantyExpiryDate(
        product.purchaseDate,
        product.warrantyMonths,
      )
      if (!product.warrantyExpiryDate) {
        throw new ApiError(400, 'Could not calculate the warranty expiry date.')
      }
    }

    await product.save()
    res.json({ success: true, product: product.toJSON() })
  } catch (error) {
    next(error)
  }
}

/**
 * DELETE /api/products/:id
 * When the product goes away its stored bill asset is cleaned up too.
 */
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, user: req.user.id })
    if (!product) throw new ApiError(404, 'Product not found.')

    if (product.bill?.publicId) {
      // Best-effort — the product is already gone either way.
      try {
        const { destroyAsset } = require('../config/billStorage')
        await destroyAsset(product.bill.publicId, product.bill.resourceType)
      } catch (error) {
        console.error(`[bills] Could not delete asset for removed product ${product.id}:`, error.message)
      }
    }

    res.json({ success: true, message: 'Product deleted.', id: product.id })
  } catch (error) {
    next(error)
  }
}
