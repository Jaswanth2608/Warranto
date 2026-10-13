'use strict'

const mongoose = require('mongoose')
const { isYMD } = require('../utils/warranty')

const SERVICE_TYPES = [
  { value: 'repair', label: 'Repair' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'checkup', label: 'Check-up' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'servicing', label: 'Servicing' },
  { value: 'parts_replacement', label: 'Parts Replacement' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'support', label: 'Support' },
  { value: 'other', label: 'Other' },
]

const serviceRecordSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    serviceDate: {
      type: String,
      required: [true, 'Service date is required.'],
      validate: {
        validator: isYMD,
        message: 'Service date must be a valid date (YYYY-MM-DD).',
      },
    },
    serviceType: {
      type: String,
      required: [true, 'Service type is required.'],
      enum: {
        values: SERVICE_TYPES.map((t) => t.value),
        message: 'Choose a valid service type.',
      },
    },
    serviceCentre: {
      type: String,
      trim: true,
      maxlength: [150, 'Service centre must be 150 characters or fewer.'],
      default: '',
    },
    technician: {
      type: String,
      trim: true,
      maxlength: [150, 'Technician name must be 150 characters or fewer.'],
      default: '',
    },
    issueDescription: {
      type: String,
      trim: true,
      maxlength: [4000, 'Issue description must be 4000 characters or fewer.'],
      default: '',
    },
    workPerformed: {
      type: String,
      trim: true,
      maxlength: [4000, 'Work performed must be 4000 characters or fewer.'],
      default: '',
    },
    serviceCost: {
      type: Number,
      min: [0, 'Service cost cannot be negative.'],
      max: [100000000, 'Service cost must be 100000000 or lower.'],
      default: 0,
    },
    currency: {
      type: String,
      trim: true,
      maxlength: [3, 'Currency must be 3 characters or fewer.'],
      default: 'INR',
    },
    nextServiceDate: {
      type: String,
      default: null,
      validate: {
        validator: (value) => value === null || isYMD(value),
        message: 'Next service date must be a valid date (YYYY-MM-DD).',
      },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes must be 2000 characters or fewer.'],
      default: '',
    },
    invoice: {
      type: {
        fileName: {
          type: String,
          required: true,
          trim: true,
          maxlength: [200, 'Invoice file name must be 200 characters or fewer.'],
        },
        fileType: {
          type: String,
          trim: true,
          maxlength: [20, 'File type must be 20 characters or fewer.'],
          default: 'FILE',
        },
        fileSize: {
          type: Number,
          min: [1, 'Invoice file size must be greater than zero.'],
          max: [10 * 1024 * 1024, 'Invoice files must be 10 MB or smaller.'],
        },
        uploadedAt: {
          type: String,
          default: () => {
            const d = new Date()
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            return `${y}-${m}-${day}`
          },
          validate: { validator: isYMD, message: 'Upload date must be a valid date (YYYY-MM-DD).' },
        },
        url: {
          type: String,
          trim: true,
          maxlength: [1000, 'Invoice URL is too long.'],
          default: null,
        },
        publicId: {
          type: String,
          trim: true,
          maxlength: [300, 'Invoice storage reference is too long.'],
          default: null,
        },
        resourceType: {
          type: String,
          trim: true,
          maxlength: [20, 'Invoice resource type is too long.'],
          default: null,
        },
      },
      default: null,
    },
  },
  { timestamps: true }
)

serviceRecordSchema.index({ userId: 1, product: 1, serviceDate: -1 })
serviceRecordSchema.index({ userId: 1, product: 1, serviceType: 1 })

serviceRecordSchema.pre('save', function removeInternalInvoiceFields() {
  if (this.isModified('invoice') && this.invoice && this.invoice._id) {
    delete this.invoice._id
  }
})

serviceRecordSchema.set('toJSON', {
  transform(_doc, ret) {
    if (ret._id) ret.id = ret._id.toString()
    delete ret._id
    delete ret.__v
    if (ret.user) ret.user = ret.user.toString()
    if (ret.product) ret.product = ret.product.toString()
    if (ret.invoice && ret.invoice._id) {
      ret.invoice.id = ret.invoice._id.toString()
      delete ret.invoice._id
    }
    delete ret.invoice?.__v
    delete ret.invoice?.publicId
    delete ret.invoice?.resourceType
    if (ret.createdAt) ret.createdAt = ret.createdAt.toISOString().slice(0, 10)
    if (ret.updatedAt) ret.updatedAt = ret.updatedAt.toISOString().slice(0, 10)
    return ret
  },
})

const ServiceRecord = mongoose.model('ServiceRecord', serviceRecordSchema)

module.exports = ServiceRecord
module.exports.SERVICE_TYPES = SERVICE_TYPES
