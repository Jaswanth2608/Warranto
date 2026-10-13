/**
 * Bill file storage — driver abstraction.
 *
 * Two drivers:
 * - "cloudinary" — used automatically when CLOUDINARY_CLOUD_NAME / _API_KEY /
 *   _API_SECRET are set in backend/.env (the production path).
 * - "local" — stores files on disk under backend/storage/bills (git-ignored).
 *   Used in development without Cloudinary credentials and by the test suite
 *   (BILL_STORAGE_DIR points it at a temp folder).
 *
 * BILL_STORAGE_DRIVER=auto|cloudinary|local overrides the automatic choice.
 *
 * Both drivers expose the same small interface:
 *   uploadBuffer({ buffer, userId, productId }) → { url, publicId, resourceType, size }
 *   destroyAsset(publicId, resourceType)        → Promise<void>
 *   resolveLocalPath(publicId)                  → string | null  (local driver only)
 *
 * Only file URLs and metadata are ever persisted — never file contents.
 */

const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')

const { ApiError } = require('../middleware/errorMiddleware')

/** Hard limits shared with the frontend (BILL_MAX_SIZE_MB in constants.js). */
const MAX_BILL_BYTES = 10 * 1024 * 1024

const ALLOWED_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png'])

const LOCAL_ROOT = process.env.BILL_STORAGE_DIR
  ? path.resolve(process.env.BILL_STORAGE_DIR)
  : path.join(__dirname, '..', 'storage', 'bills')

// ---------------------------------------------------------------------------
// Cloudinary (lazy-configured so tests never touch the network)
// ---------------------------------------------------------------------------

function cloudinaryCreds() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME
  const api_key = process.env.CLOUDINARY_API_KEY
  const api_secret = process.env.CLOUDINARY_API_SECRET
  if (cloud_name && api_key && api_secret) return { cloud_name, api_key, api_secret }
  return null
}

let cloudinaryClient = null
function getCloudinary() {
  if (!cloudinaryClient) {
    const { v2 } = require('cloudinary')
    v2.config(cloudinaryCreds())
    cloudinaryClient = v2
  }
  return cloudinaryClient
}

function cloudinaryUpload(buffer, { userId }) {
  return new Promise((resolve, reject) => {
    const stream = getCloudinary().uploader.upload_stream(
      {
        folder: `warranto/bills/${userId}`,
        resource_type: 'auto',
        unique_filename: true,
      },
      (error, result) => {
        if (error) return reject(new Error(error.message || 'Cloudinary upload failed.'))
        return resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          size: result.bytes,
        })
      },
    )
    stream.end(buffer)
  })
}

async function cloudinaryDestroy(publicId, resourceType) {
  await getCloudinary().uploader.destroy(publicId, {
    resource_type: resourceType || 'image',
    invalidate: true,
  })
}

// ---------------------------------------------------------------------------
// Local disk (development / tests) — files are served through the API so
// ownership is verified on every read.
// ---------------------------------------------------------------------------

async function localUpload(buffer, { userId, productId }) {
  const ext = ALLOWED_TYPES[detectMimeType(buffer)] || 'bin'
  const dir = path.join(LOCAL_ROOT, String(userId), String(productId))
  await fs.mkdir(dir, { recursive: true })
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`
  await fs.writeFile(path.join(dir, name), buffer)
  return {
    url: `/api/bills/${productId}/file`,
    publicId: `${userId}/${productId}/${name}`,
    resourceType: 'local',
    size: buffer.length,
  }
}

async function localDestroy(publicId) {
  // publicId is "<userId>/<fileName>" — reject anything that escapes the root.
  const target = path.resolve(LOCAL_ROOT, publicId)
  if (!target.startsWith(LOCAL_ROOT + path.sep)) {
    throw new ApiError(400, 'Invalid bill reference.')
  }
  try {
    await fs.unlink(target)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

// ---------------------------------------------------------------------------
// Driver selection + shared helpers
// ---------------------------------------------------------------------------

/**
 * Content sniffing — the stored file type is decided by the file's magic
 * bytes, never by the client-supplied name or mimetype alone.
 * Returns an allowed mimetype or null.
 */
function detectMimeType(buffer) {
  if (!buffer || buffer.length < 4) return null
  // %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf'
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }
  return null
}

function activeDriver() {
  const forced = (process.env.BILL_STORAGE_DRIVER || 'auto').toLowerCase()
  if (forced === 'cloudinary') return 'cloudinary'
  if (forced === 'local') return 'local'
  return cloudinaryCreds() ? 'cloudinary' : 'local'
}

/** Uploads a validated buffer; returns { url, publicId, resourceType, size }. */
async function uploadBuffer({ buffer, userId, productId }) {
  if (activeDriver() === 'cloudinary') return cloudinaryUpload(buffer, { userId, productId })
  return localUpload(buffer, { userId, productId })
}

/** Best-effort deletion of a previously stored asset. */
async function destroyAsset(publicId, resourceType) {
  if (!publicId) return
  if (activeDriver() === 'cloudinary') await cloudinaryDestroy(publicId, resourceType)
  else await localDestroy(publicId)
}

/** Absolute on-disk path for a local asset, or null for the cloudinary driver. */
function resolveLocalPath(publicId) {
  if (activeDriver() !== 'local' || !publicId) return null
  const target = path.resolve(LOCAL_ROOT, publicId)
  if (!target.startsWith(LOCAL_ROOT + path.sep)) return null
  return target
}

/** Content-Type for a stored bill based on its validated file type. */
function contentTypeFor(fileType) {
  switch (String(fileType || '').toUpperCase()) {
    case 'PDF':
      return 'application/pdf'
    case 'JPG':
    case 'JPEG':
      return 'image/jpeg'
    case 'PNG':
      return 'image/png'
    default:
      return 'application/octet-stream'
  }
}

module.exports = {
  MAX_BILL_BYTES,
  ALLOWED_TYPES,
  ALLOWED_EXTENSIONS,
  activeDriver,
  detectMimeType,
  uploadBuffer,
  destroyAsset,
  resolveLocalPath,
  contentTypeFor,
}
