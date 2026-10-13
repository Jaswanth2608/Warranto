import apiClient from './httpClient'

/**
 * Bill endpoints backed by the Warranto API.
 * - Uploads are multipart/form-data: a "file" part plus the product id.
 * - Reads go through the API (never straight to storage) so ownership is
 *   verified on every access and the JWT is attached automatically.
 * - Generous timeout: files can be up to 10 MB.
 */

const FILE_TIMEOUT = 60000

function uploadForm(productId, file) {
  const form = new FormData()
  form.append('file', file)
  if (productId) form.append('productId', productId)
  return form
}

// The shared client defaults to JSON; these per-request headers tell axios to
// send the FormData as multipart instead of stringifying it. The browser adds
// the boundary itself.
const MULTIPART = { 'Content-Type': 'multipart/form-data' }

export const billService = {
  list: () => apiClient.get('/bills'),

  /** POST /api/bills — attach a bill to a product that has none yet. */
  upload: (productId, file) =>
    apiClient.post('/bills', uploadForm(productId, file), {
      headers: MULTIPART,
      timeout: FILE_TIMEOUT,
    }),

  /** PATCH /api/bills/:productId — replace (or attach) the product's bill. */
  replace: (productId, file) =>
    apiClient.patch(`/bills/${productId}`, uploadForm(null, file), {
      headers: MULTIPART,
      timeout: FILE_TIMEOUT,
    }),

  /** DELETE /api/bills/:productId — remove the bill, keep the product. */
  remove: (productId) => apiClient.delete(`/bills/${productId}`),

  /** Authenticated read of the stored file (blob). Used for preview + download. */
  getFile: (productId) =>
    apiClient.get(`/bills/${productId}/file`, { responseType: 'blob', timeout: FILE_TIMEOUT }),
}

export default billService
