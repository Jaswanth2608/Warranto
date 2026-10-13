'use strict'

const mongoose = require('mongoose')

const ServiceRecord = require('../models/ServiceRecord')
const Product = require('../models/Product')
const { ApiError } = require('../middleware/errorMiddleware')
const { uploadBuffer, destroyAsset } = require('../config/billStorage')

const InvoiceValidationError = new Error('Invoice validation placeholder')

const UPDATABLE_FIELDS = [
  'serviceDate',
  'serviceType',
  'serviceCentre',
  'technician',
  'issueDescription',
  'workPerformed',
  'serviceCost',
  'currency',
  'nextServiceDate',
  'notes',
]

function pickFields(body) {
  const fields = {}
  for (const key of UPDATABLE_FIELDS) {
    if (body[key] !== undefined) fields[key] = body[key]
  }
  return fields
}

/** GET /api/services — list for the current user, optionally filtered by product and service type. */
exports.listServiceRecords = async (req, res, next) => {
  try {
    const query = { user: req.user.id }

    if (req.query.product) {
      if (!mongoose.isValidObjectId(req.query.product)) {
        throw new ApiError(400, 'Invalid product id.')
      }
      query.product = req.query.product
    }

    if (req.query.serviceType) {
      const allowed = ServiceRecord.SERVICE_TYPES.map((t) => t.value)
      if (!allowed.includes(req.query.serviceType)) {
        throw new ApiError(400, 'Invalid service type filter.')
      }
      query.serviceType = req.query.serviceType
    }

    const sort = req.query.sort === 'date' ? { serviceDate: -1 } : { serviceDate: -1 }
    const records = await ServiceRecord.find(query).sort(sort).lean()

    const enriched = await Promise.all(
      records.map(async (record) => {
        const product = await Product.findById(record.product).select('name brand category').lean()
        return {
          ...record,
          productName: product?.name || null,
          productBrand: product?.brand || null,
        }
      }),
    )

    const totalCost = enriched.reduce((sum, r) => Number(r.serviceCost || 0) + sum, 0)

    res.json({
      success: true,
      count: enriched.length,
      records: enriched,
      totalCost,
    })
  } catch (error) {
    next(error)
  }
}

/** GET /api/services/product/:productId — service history for one product. */
exports.listServiceRecordsByProduct = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.productId)) {
      throw new ApiError(400, 'Invalid product id.')
    }

    const productId = req.params.productId

    const product = await Product.findOne({ _id: productId, user: req.user.id }).select('name')
    if (!product) throw new ApiError(404, 'Product not found.')

    const query = { user: req.user.id, product: productId }
    const serviceType = req.query.serviceType

    if (serviceType) {
      const allowed = ServiceRecord.SERVICE_TYPES.map((t) => t.value)
      if (!allowed.includes(serviceType)) {
        throw new ApiError(400, 'Invalid service type filter.')
      }
      query.serviceType = serviceType
    }

    const sort = req.query.sort === 'asc' ? { serviceDate: 1 } : { serviceDate: -1 }
    const records = await ServiceRecord.find(query).sort(sort).lean()

    let totalCost = 0
    for (const record of records) {
      totalCost += Number(record.serviceCost || 0)
    }

    res.json({
      success: true,
      product: { id: productId, name: product.name },
      count: records.length,
      records,
      totalCost,
    })
  } catch (error) {
    next(error)
  }
}

/** GET /api/services/:id */
exports.getServiceRecord = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Invalid service record id.')
    }

    const record = await ServiceRecord.findOne({ _id: req.params.id, user: req.user.id })
      .populate('product', 'name brand category')
      .lean()

    if (!record) throw new ApiError(404, 'Service record not found.')

    res.json({
      success: true,
      record: {
        ...record,
        productName: record.product?.name || null,
        productBrand: record.product?.brand || null,
      },
    })
  } catch (error) {
    next(error)
  }
}

/** POST /api/services — create a service record for an owned product. */
exports.createServiceRecord = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const productId = req.body.product

    const product = await Product.findOne({ _id: productId, user: req.user.id }).session(session)
    if (!product) throw new ApiError(404, 'Product not found.')

    const invoice = req.body.invoice != null ? req.body.invoice : undefined
    let uploadedInvoice = null

    if (invoice && typeof invoice === 'object' && invoice.file) {
      const file = invoice.file
      if (!file || !(file instanceof Blob)) {
        throw new ApiError(400, 'Please provide a valid invoice file.')
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new ApiError(400, 'Invoice files must be 10 MB or smaller.')
      }

      const name = invoice.fileName || file.name || 'invoice'
      const storage = await uploadBuffer({
        buffer: Buffer.from(await file.arrayBuffer()),
        userId: req.user.id,
        productId,
      })

      uploadedInvoice = {
        fileName: name.slice(0, 200).trim(),
        fileType: invoice.fileType || storage.resourceType === 'local' ? 'FILE' : 'PDF',
        fileSize: storage.size,
        uploadedAt: new Date().toISOString().slice(0, 10),
        url: storage.url,
        publicId: storage.publicId,
        resourceType: storage.resourceType,
      }
    }

    const fields = pickFields(req.body)
    if (fields.serviceCost === undefined) fields.serviceCost = 0

    const record = new ServiceRecord({
      user: req.user.id,
      product: productId,
      ...fields,
      invoice: uploadedInvoice || null,
    })

    await record.save({ session })
    await record.populate('product', 'name brand category')

    await session.commitTransaction()

    res.status(201).json({ success: true, record: record.toJSON() })
  } catch (error) {
    await session.abortTransaction().catch(() => {})
    next(error)
  } finally {
    session.endSession()
  }
}

/** PATCH /api/services/:id — update an owned service record. */
exports.updateServiceRecord = async (req, res, next) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Invalid service record id.')
    }

    const record = await ServiceRecord.findOne({ _id: req.params.id, user: req.user.id }).session(session)
    if (!record) throw new ApiError(404, 'Service record not found.')

    const fields = pickFields(req.body)
    if (Object.keys(fields).length === 0 && !req.body.invoice) {
      throw new ApiError(400, 'No updatable fields were provided.')
    }

    let replacedInvoice = false
    if (req.body.invoice && typeof req.body.invoice === 'object' && req.body.invoice.file) {
      const file = req.body.invoice.file
      if (!file || !(file instanceof Blob)) {
        throw new ApiError(400, 'Please provide a valid invoice file.')
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new ApiError(400, 'Invoice files must be 10 MB or smaller.')
      }

      if (record.invoice?.publicId) {
        await destroyAsset(record.invoice.publicId, record.invoice.resourceType).catch(() => {})
      }

      const storage = await uploadBuffer({
        buffer: Buffer.from(await file.arrayBuffer()),
        userId: req.user.id,
        productId: record.product,
      })

      record.invoice = {
        fileName: (req.body.invoice.fileName || file.name || 'invoice').slice(0, 200).trim(),
        fileType: req.body.invoice.fileType || storage.resourceType === 'local' ? 'FILE' : 'PDF',
        fileSize: storage.size,
        uploadedAt: new Date().toISOString().slice(0, 10),
        url: storage.url,
        publicId: storage.publicId,
        resourceType: storage.resourceType,
      }
      replacedInvoice = true
    }

    Object.assign(record, fields)

    await record.save({ session })
    await record.populate('product', 'name brand category')

    await session.commitTransaction()

    res.json({ success: true, record: record.toJSON() })
  } catch (error) {
    await session.abortTransaction().catch(() => {})
    next(error)
  } finally {
    session.endSession()
  }
}

/** DELETE /api/services/:id */
exports.deleteServiceRecord = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, 'Invalid service record id.')
    }

    const record = await ServiceRecord.findOne({ _id: req.params.id, user: req.user.id })
    if (!record) throw new ApiError(404, 'Service record not found.')

    if (record.invoice?.publicId) {
      await destroyAsset(record.invoice.publicId, record.invoice.resourceType).catch(() => {})
    }

    await ServiceRecord.deleteOne({ _id: req.params.id, user: req.user.id })

    res.json({ success: true, message: 'Service record deleted.', id: req.params.id })
  } catch (error) {
    next(error)
  }
}
