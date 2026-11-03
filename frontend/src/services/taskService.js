import apiClient from './httpClient'

/**
 * Action-task endpoints. Tasks are always linked to one of the user's
 * products, so the calendar can open the product the task belongs to.
 */
export const taskService = {
  list: (params) => apiClient.get('/tasks', { params }),
  getById: (id) => apiClient.get(`/tasks/${id}`),
  create: (payload) => apiClient.post('/tasks', payload),
  update: (id, payload) => apiClient.patch(`/tasks/${id}`, payload),
  complete: (id) => apiClient.post(`/tasks/${id}/complete`),
  reopen: (id) => apiClient.post(`/tasks/${id}/reopen`),
  remove: (id) => apiClient.delete(`/tasks/${id}`),
}

export default taskService
