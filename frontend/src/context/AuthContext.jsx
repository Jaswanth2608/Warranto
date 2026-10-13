import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authService } from '../services/authService'

/**
 * Real authentication backed by the Warranto API.
 * - Login/register/me return a JWT; it is stored in localStorage and attached
 *   to every request by httpClient.
 * - The user profile is cached in localStorage so the UI paints instantly on
 *   refresh, then re-validated against GET /auth/me.
 * - An expired or invalid token clears the session (see also httpClient's 401
 *   handling for protected API calls).
 */

const AuthContext = createContext(null)
const SESSION_KEY = 'warranto.session'
const TOKEN_KEY = 'warranto.token'

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeSession(user) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  else localStorage.removeItem(SESSION_KEY)
}

function writeToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

function clearSession() {
  writeToken(null)
  writeSession(null)
}

export function AuthProvider({ children }) {
  // Only trust the cached session if a token exists alongside it.
  const [user, setUser] = useState(() =>
    localStorage.getItem(TOKEN_KEY) ? readSession() : null,
  )
  const [restoring, setRestoring] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)))

  // Restore the session on page load: prove the token is still valid.
  useEffect(() => {
    let active = true

    if (!localStorage.getItem(TOKEN_KEY)) {
      setRestoring(false)
      return () => {}
    }

    authService
      .me()
      .then((res) => {
        if (!active) return
        writeSession(res.data.user)
        setUser(res.data.user)
      })
      .catch(() => {
        // Token invalid or expired — start signed out.
        if (!active) return
        clearSession()
        setUser(null)
      })
      .finally(() => {
        if (active) setRestoring(false)
      })

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async ({ email, password }) => {
    const res = await authService.login({ email, password })
    writeToken(res.data.token)
    writeSession(res.data.user)
    setUser(res.data.user)
    return res.data.user
  }, [])

  const register = useCallback(async ({ fullName, email, password }) => {
    const res = await authService.register({ fullName, email, password })
    writeToken(res.data.token)
    writeSession(res.data.user)
    setUser(res.data.user)
    return res.data.user
  }, [])

  /**
   * Google sign-in: the raw Google ID token is sent to the API, which verifies
   * it and returns the same JWT/session shape as password login.
   */
  const loginWithGoogle = useCallback(async (credential) => {
    const res = await authService.google(credential)
    writeToken(res.data.token)
    writeSession(res.data.user)
    setUser(res.data.user)
    return res.data.user
  }, [])

  const logout = useCallback(() => {
    // Best-effort server call — the session ends locally either way.
    authService.logout().catch(() => {})
    clearSession()
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (patch) => {
    const res = await authService.updateProfile(patch)
    writeSession(res.data.user)
    setUser(res.data.user)
    return res.data.user
  }, [])

  const changePassword = useCallback(async ({ currentPassword, newPassword }) => {
    const res = await authService.changePassword({ currentPassword, newPassword })
    return res.data.message
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      restoring,
      login,
      register,
      loginWithGoogle,
      logout,
      updateProfile,
      changePassword,
    }),
    [user, restoring, login, register, loginWithGoogle, logout, updateProfile, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

export default AuthContext
