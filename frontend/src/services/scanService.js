import apiClient from './httpClient'

/**
 * Scan Bill endpoints backed by the Warranto API.
 * - POST /api/scan uploads a bill and runs OCR, returning field suggestions only.
 * - GET /api/scan/:scanId retrieves a previous scan result for review.
 * - POST /api/scan/:scanId/create-product creates a product from validated
 *   user-confirmed fields and attaches the stored bill.
 */

export const scanService = {
  /** Upload a bill and run OCR. Returns suggestions, raw text, and a scan id. */
  scan: (productId, file) => {
    const form = new FormData()
    form.append('file', file)
    if (productId) form.append('productId', productId)

    return apiClient.post('/scan', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    })
  },

  /** Retrieve a previous scan result for review. */
  getResult: (scanId) => apiClient.get(`/scan/${scanId}`),

  /** Create a product from validated user-confirmed scan fields. */
  createProduct: (scanId, payload) => apiClient.post(`/scan/${scanId}/create-product`, payload),
}

export default scanService
