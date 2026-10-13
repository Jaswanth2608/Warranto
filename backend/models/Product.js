/**
 * Product model.
 *
 * Field names and date formats match the frontend exactly
 * (frontend/src/data/products.js and ProductForm.jsx):
 *   purchaseDate / bill.uploadedAt → "YYYY-MM-DD" strings
 *   purchasePrice, warrantyMonths  → numbers
 *
 * warrantyExpiryDate and status are derived on the server — the client can
 * never supply them.
 */

const mongoose = require('mongoose')
const {
  isYMD,
  toYMD,
  getWarrantyExpiryDate,
  deriveWarrantyStatus,
} = require('../utils/warranty')

// Same lists as frontend/src/utils/constants.js
const CATEGORIES = ['electronics', 'appliances', 'furniture', 'accessories', 'other']
const WARRANTY_TYPES = [
  'Manufacturer Warranty',
  'Extended Warranty',
  'Store Warranty',
  'Seller Warranty',
  'No Warranty',
]

const MAX_BILL_BYTES = 10 * 1024 * 1024 // BILL_MAX_SIZE_MB = 10 in the frontend

/**
 * Attached bill. Only the stored file's URL and metadata live here — never
 * the file contents. url/publicId/resourceType are written exclusively by
 * the bill controller after a successful storage upload; clients cannot set
 * them through the product endpoints (normalizeBill ignores them).
 */
const billSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: [true, 'Bill file name is required.'],
    trim: true,
    maxlength: [200, 'File name must be 200 characters or fewer.'],
  },
  fileType: {
    type: String,
    trim: true,
    maxlength: [20, 'File type must be 20 characters or fewer.'],
    default: 'FILE',
  },
  fileSize: {
    type: Number,
    min: [1, 'File size must be greater than zero.'],
    max: [MAX_BILL_BYTES, 'Bill files must be 10 MB or smaller.'],
  },
  uploadedAt: {
    type: String,
    default: () => toYMD(new Date()),
    validate: {
      validator: isYMD,
      message: 'Bill upload date must be a valid date (YYYY-MM-DD).',
    },
  },
  // Where the file is stored (Cloudinary secure_url, or the API file route
  // for the local dev driver). Set only by the bill upload pipeline.
  url: {
    type: String,
    trim: true,
    maxlength: [1000, 'Bill URL is too long.'],
    default: null,
  },
  // Storage-provider identifier used to delete/replace the asset later.
  publicId: {
    type: String,
    trim: true,
    maxlength: [300, 'Bill storage reference is too long.'],
    default: null,
  },
  // Storage driver that owns the asset ("cloudinary" | "local").
  resourceType: {
    type: String,
    trim: true,
    maxlength: [20, 'Bill resource type is too long.'],
    default: null,
  },
})

const productSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Product name is required.'],
    trim: true,
    maxlength: [120, 'Product name must be 120 characters or fewer.'],
  },
  brand: {
    type: String,
    required: [true, 'Brand is required.'],
    trim: true,
    maxlength: [80, 'Brand must be 80 characters or fewer.'],
  },
  category: {
    type: String,
    required: [true, 'Choose a category.'],
    enum: {
      values: CATEGORIES,
      message: 'Choose a valid category.',
    },
    default: 'electronics',
  },
  modelNumber: {
    type: String,
    trim: true,
    maxlength: [100, 'Model number must be 100 characters or fewer.'],
    default: '',
  },
  serialNumber: {
    type: String,
    trim: true,
    maxlength: [100, 'Serial number must be 100 characters or fewer.'],
    default: '',
  },
  purchaseDate: {
    type: String,
    required: [true, 'Purchase date is required.'],
    validate: {
      validator: isYMD,
      message: 'Purchase date must be a valid date (YYYY-MM-DD).',
    },
  },
  purchasePrice: {
    type: Number,
    required: [true, 'Purchase price is required.'],
    min: [0, 'Purchase price cannot be negative.'],
  },
  seller: {
    type: String,
    trim: true,
    maxlength: [150, 'Seller must be 150 characters or fewer.'],
    default: '',
  },
  warrantyMonths: {
    type: Number,
    required: [true, 'Warranty duration is required.'],
    min: [1, 'Warranty duration must be between 1 and 120 months.'],
    max: [120, 'Warranty duration must be between 1 and 120 months.'],
  },
  warrantyType: {
    type: String,
    enum: {
      values: WARRANTY_TYPES,
      message: 'Choose a valid warranty type.',
    },
    default: 'Manufacturer Warranty',
  },
  // Derived server-side from purchaseDate + warrantyMonths (never from the client).
  warrantyExpiryDate: {
    type: String,
    default: null,
    validate: {
      validator: (value) => value === null || isYMD(value),
      message: 'Warranty expiry date must be a valid date (YYYY-MM-DD).',
    },
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Notes must be 2000 characters or fewer.'],
    default: '',
  },
  bill: {
    type: billSchema,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

// Recompute the expiry whenever the inputs change — the client cannot set it.
productSchema.pre('save', function recomputeExpiry() {
  if (!this.purchaseDate || typeof this.warrantyMonths !== 'number') return
  if (this.isModified('purchaseDate') || this.isModified('warrantyMonths') || !this.warrantyExpiryDate) {
    this.warrantyExpiryDate = getWarrantyExpiryDate(this.purchaseDate, this.warrantyMonths)
  }
})

/**
 * Public JSON shape used by the API — mirrors the frontend's mock product:
 *   id, name, brand, category, modelNumber, serialNumber, purchaseDate,
 *   purchasePrice, seller, warrantyMonths, warrantyType, warrantyExpiryDate,
 *   notes, user, createdAt ("YYYY-MM-DD"), status + daysRemaining (derived),
 *   bill: null | { id, fileName, fileType, fileSize, uploadedAt, url }
 *
 * publicId/resourceType are stripped from JSON — they are storage-internal.
 */
productSchema.set('toJSON', {
  transform(_doc, ret) {
    if (ret._id) ret.id = ret._id.toString()
    delete ret._id
    delete ret.__v
    if (ret.user) ret.user = ret.user.toString()
    if (ret.createdAt) ret.createdAt = toYMD(ret.createdAt)
    if (ret.bill) {
      if (ret.bill._id) {
        ret.bill.id = ret.bill._id.toString()
        delete ret.bill._id
      }
      delete ret.bill.__v
      delete ret.bill.publicId
      delete ret.bill.resourceType
    }
    if (ret.warrantyExpiryDate) {
      const info = deriveWarrantyStatus(ret.warrantyExpiryDate)
      ret.status = info.status
      ret.daysRemaining = info.daysRemaining
    }
    return ret
  },
})

module.exports = mongoose.model('Product', productSchema)
module.exports.CATEGORIES = CATEGORIES
module.exports.WARRANTY_TYPES = WARRANTY_TYPES
