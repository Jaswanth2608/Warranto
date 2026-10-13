import apiClient from './httpClient'

/** Service-history endpoints backed by the Warranto API. */
export const serviceService = {
  list: (params) => apiClient.get('/services', { params }),

  /** Service records for one product, with optional type filter and sort. */
  forProduct: (productId, params) =>
    apiClient.get(`/services/product/${productId}`, { params }),

  getById: (id) => apiClient.get(`/services/${id}`),

  create: (payload) => apiClient.post('/services', payload),

  update: (id, payload) => apiClient.patch(`/services/${id}`, payload),

  remove: (id) => apiClient.delete(`/services/${id}`),
}

export default serviceService
