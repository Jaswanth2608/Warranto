/**
 * Bill upload middleware.
 *
 * Supports two upload shapes used by this app:
 * - JSON/body-style payloads where the file content is sent inside a JSON body
 *   field named "file" (string/Buffer/Uint8Array) alongside a "productId"
 *   field. The middleware normalizes those into multer's expected req.file shape
 *   so the rest of the stack can treat them like a normal uploaded file.
 * - Classic multipart uploads (browser FormData) handled by multer directly.
 *
 * Files are buffered in memory (max 10 MB). The stored file type is decided by
 * the file's magic bytes, never by the client-supplied name/mimetype alone.
 *
 * All failures answer 400 with the same { success: false, message } shape.
 *
 * On success req.file is normalized to:
 *   { buffer, size, fileName, fileType ("PDF" | "JPG" | "PNG"), mimeType }
 */

const path = require('path')
const multer = require('multer')

const { ApiError } = require('./errorMiddleware')
const {
  MAX_BILL_BYTES,
  ALLOWED_EXTENSIONS,
  detectMimeType,
} = require('../config/billStorage')

const TYPE_LABELS = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
}

const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_BILL_BYTES,
    files: 1,
    fields: 10,
  },
  // Extension gate only — the buffered content is verified after upload,
  // since multer has not read the bytes yet when fileFilter runs.
  fileFilter(_req, file, callback) {
    const original = (file.originalname || '').trim()
    if (!original || file.mimetype === 'application/octet-stream') {
      return callback(null, true)
    }

    const extension = path.extname(original).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return callback(
        new ApiError(400, 'Unsupported file type. Please upload a PDF, JPG, JPEG or PNG.'),
      )
    }
    return callback(null, true)
  },
}).fields([{ name: 'file', maxCount: 1 }, { name: 'productId', maxCount: 1 }])

/** Best-effort conversion of a JSON field-body payload into a multer-style file. */
function normalizeJsonFileBody(req) {
  const raw = req.body
  if (!raw || typeof raw !== 'object') return

  let fileLike = raw.file
  const filename = raw.fileName || raw.originalName || 'uploaded-file'

  if (!fileLike && typeof raw.fileId === 'string' && raw.fileId.startsWith('buf:')) {
    fileLike = Buffer.from(raw.fileId.slice(4), 'base64')
  }

  if (!fileLike && typeof raw.contentBase64 === 'string') {
    fileLike = Buffer.from(raw.contentBase64, 'base64')
    if (!raw.fileName) raw.fileName = raw.originalName || 'base64-upload'
  }

  if (!fileLike) return

  let buffer
  if (Buffer.isBuffer(fileLike)) {
    buffer = fileLike
  } else if (fileLike instanceof Uint8Array) {
    buffer = Buffer.from(fileLike)
  } else if (typeof fileLike === 'string') {
    buffer = Buffer.from(fileLike, 'utf8')
  } else {
    return
  }

  const mimetype = (raw.fileType || raw.mimeType || 'application/octet-stream')

  req.file = {
    buffer,
    size: buffer.length,
    originalname: filename,
    mimetype,
    encoding: '7bit',
    destination: null,
    filename: filename,
    path: null,
  }
  delete req.body.file
}

/** Verifies the buffered bytes really are the allowed type. Content wins. */
function verifyContent(file) {
  const sniffed = detectMimeType(file.buffer)
  if (!sniffed) {
    throw new ApiError(400, 'The file contents do not match a PDF, JPG or PNG file.')
  }

  const declared = file.mimetype
  const jpegAlias = sniffed === 'image/jpeg' && declared === 'image/jpg'
  if (declared && declared !== 'application/octet-stream' && declared !== sniffed && !jpegAlias) {
    throw new ApiError(400, 'The file contents do not match its file type.')
  }

  file.fileType = TYPE_LABELS[sniffed]
  file.mimeType = sniffed
}

/**
 * Runs multer (if it consumed a multipart body) and then normalizes any JSON
 * file field. Converts all errors into the standard { success: false, message }
 * shape.
 */
function uploadBillFile(req, res, next) {
  // Multer only consumes multipart bodies. If the request was JSON and has a
  // file field, normalize it directly; otherwise pass through to multer.
  if (req.body && typeof req.body === 'object' && !req.file && !isMultipartLike(req)) {
    normalizeJsonFileBody(req)

    try {
      if (!req.file) {
        throw new ApiError(400, 'Please choose a bill file to upload.')
      }

      verifyContent(req.file)
      req.file.fileName = path.basename(req.file.originalname || 'bill').slice(0, 200)
      return next()
    } catch (caught) {
      return next(caught)
    }
  }

  upload(req, res, (error) => {
    try {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          throw new ApiError(
            400,
            `Bill files must be ${MAX_BILL_BYTES / (1024 * 1024)} MB or smaller.`,
          )
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
          throw new ApiError(400, 'Send the bill file in a form field named "file".')
        }
        throw new ApiError(400, error.message || 'The bill upload could not be processed.')
      }
      if (error) throw error

      // multer's .fields() stores uploads on req.files, never req.file.
      // Promote the "file" part so the rest of the stack sees the single
      // normalized file it expects (this is the browser/FormData path).
      if (!req.file && req.files && Array.isArray(req.files.file) && req.files.file[0]) {
        req.file = req.files.file[0]
      }

      normalizeJsonFileBody(req)

      if (!req.file) {
        throw new ApiError(400, 'Please choose a bill file to upload.')
      }

      verifyContent(req.file)
      req.file.fileName = path.basename(req.file.originalname || 'bill').slice(0, 200)
      return next()
    } catch (caught) {
      return next(caught)
    }
  })
}

function isMultipartLike(req) {
  const ct = (req.headers && (req.headers['content-type'] || req.headers['content-type'])) || ''
  const lowered = ct.toLowerCase()
  if (lowered.startsWith('multipart/')) return true
  if (lowered.startsWith('application/x-www-form-urlencoded')) return true
  return false
}

module.exports = { uploadBillFile }
