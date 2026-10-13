import axios from 'axios'

/**
 * Central Axios instance for every API call.
 * - Base URL comes from VITE_API_BASE_URL (falls back to the local dev API).
 * - The JWT from localStorage is attached to every protected request.
 * - A 401 outside the auth endpoints means the token is invalid or expired:
 *   the session is cleared and the app returns to the login screen.
 * - Rejected errors carry `status` and `fieldErrors` so pages can show
 *   precise, field-level messages instead of a generic failure.
 */

const TOKEN_KEY = 'warranto.token'
const SESSION_KEY = 'warranto.session'

/**
 * Resolves the API base URL from VITE_API_BASE_URL.
 * - Development: falls back to the local API on port 5000.
 * - Production: a missing variable is reported loudly and the client falls
 *   back to same-origin "/api" (works behind a proxy, fails visibly instead of
 *   silently calling localhost). Redeploy after setting the variable — Vite
 *   inlines it at build time.
 */
const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '')

if (!configuredBaseUrl && import.meta.env.PROD) {
  console.error(
    '[config] VITE_API_BASE_URL is not set — this production build has no API URL. ' +
      'Set it in Vercel → Settings → Environment Variables (e.g. https://<your-render-service>.onrender.com/api) and redeploy.',
  )
}

const apiBaseUrl =
  configuredBaseUrl || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api')

// Endpoints where a 401 is a normal "wrong credentials" answer handled by the
// page (or a rejected third-party identity) rather than an expired session.
const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/google',
  '/auth/me',
  '/auth/logout',
]

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    let data = error.response?.data

    // Blob responses (bill file reads) carry their JSON error body inside a
    // Blob — unwrap it so field/page error messages still work.
    if (data instanceof Blob && data.type.includes('application/json')) {
      try {
        data = JSON.parse(await data.text())
      } catch {
        data = null
      }
    }

    const message = data?.message || error.message || 'Something went wrong. Please try again.'

    // Expired or invalid token on a protected call → end the session cleanly.
    if (status === 401 && !AUTH_ENDPOINTS.some((path) => error.config?.url?.includes(path))) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(SESSION_KEY)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login')
      }
    }

    const friendly = new Error(message)
    friendly.status = status
    friendly.fieldErrors = Array.isArray(data?.errors) ? data.errors : undefined
    return Promise.reject(friendly)
  },
)

export default apiClient
