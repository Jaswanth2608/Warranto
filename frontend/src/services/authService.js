import apiClient from './httpClient'

/**
 * Auth endpoints backed by the Warranto API.
 * Every success response carries { success: true, token, user } except `me`,
 * which only returns the user, and `providers`, which reports which sign-in
 * methods the server has configured.
 */
export const authService = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
  register: (payload) => apiClient.post('/auth/register', payload),
  /** Google Identity Services: exchange the signed ID token for an app session. */
  google: (credential) => apiClient.post('/auth/google', { credential }),
  /** Which sign-in methods the server offers (public, secret-free). */
  providers: () => apiClient.get('/auth/providers'),
  logout: () => apiClient.post('/auth/logout'),
  me: () => apiClient.get('/auth/me'),
  updateProfile: (payload) => apiClient.patch('/auth/profile', payload),
  changePassword: (payload) => apiClient.post('/auth/change-password', payload),
}

export default authService
