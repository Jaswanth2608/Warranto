import apiClient from './httpClient'

/** Product CRUD endpoints — enabled when the backend is connected. */
export const productService = {
  list: (params) => apiClient.get('/products', { params }),
  getById: (id) => apiClient.get(`/products/${id}`),
  create: (payload) => apiClient.post('/products', payload),
  update: (id, payload) => apiClient.patch(`/products/${id}`, payload),
  remove: (id) => apiClient.delete(`/products/${id}`),
}

export default productService
