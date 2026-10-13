import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import AddProduct from './pages/AddProduct'
import ProductDetails from './pages/ProductDetails'
import EditProduct from './pages/EditProduct'
import ExpiringSoon from './pages/ExpiringSoon'
import Bills from './pages/Bills'
import ScanBill from './pages/ScanBill'
import Calendar from './pages/Calendar'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import LegalPage from './pages/LegalPage'
import NotFound from './pages/NotFound'

import AppLayout from './layouts/AppLayout'
import AuthLayout from './layouts/AuthLayout'
import { useAuth } from './context/AuthContext'

/** Keeps the scroll position sensible across route changes. */
function ScrollManager() {
  const location = useLocation()

  useEffect(() => {
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1))
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    window.scrollTo({ top: 0, left: 0 })
  }, [location.pathname, location.hash])

  return null
}

/** Blocks unauthenticated access to the application routes. */
function RequireAuth({ children }) {
  const { isAuthenticated, restoring } = useAuth()
  const location = useLocation()

  // A stored token is being validated against the API — don't bounce to
  // /login while the session restore is still in flight.
  if (restoring) return null

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}

/** Sends already signed-in users away from the auth pages. */
function RedirectIfAuthenticated({ children }) {
  const { isAuthenticated, restoring } = useAuth()
  if (restoring) return null
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <>
      <ScrollManager />

      <Routes>
        <Route path="/" element={<Landing />} />

        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <AuthLayout>
                <Login />
              </AuthLayout>
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthenticated>
              <AuthLayout>
                <Register />
              </AuthLayout>
            </RedirectIfAuthenticated>
          }
        />

        <Route path="/privacy" element={<LegalPage type="privacy" />} />
        <Route path="/terms" element={<LegalPage type="terms" />} />

        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/new" element={<AddProduct />} />
          <Route path="/products/:id" element={<ProductDetails />} />
          <Route path="/products/:id/edit" element={<EditProduct />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/expiring-soon" element={<ExpiringSoon />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/products/scan" element={<ScanBill />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
