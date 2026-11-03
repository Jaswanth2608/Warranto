import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { useLiveResource } from '../hooks/useLiveResource'
import { productService } from '../services/productService'
import { billService } from '../services/billService'

/**
 * Product catalogue backed by the Warranto API.
 * - Loads the signed-in user's products from the database.
 * - Create / update / delete are real API calls; each one waits for the
 *   server so pages can show accurate success and failure messages.
 * - Bill upload / replace / delete go through /api/bills and update the
 *   cached product so every page stays in sync.
 * - A live change stream (and, as a fallback, tab focus / reconnect) triggers
 *   a silent revalidation, so another tab or device appears here without a
 *   manual refresh. `syncing` is true while that background read is in flight.
 * - Products belong to the authenticated user, so signing out clears them.
 */

const ProductStoreContext = createContext(null)

const LIVE_REFRESH_DELAY = 200

export function ProductStoreProvider({ children }) {
  const { user } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(Boolean(user))
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  const requestRef = useRef(0)
  const refreshTimer = useRef(null)

  /**
   * Reads the catalogue. Silent reads keep the current screen painted and only
   * flip `syncing`, which is what live updates use.
   */
  const load = useCallback(async ({ silent = false } = {}) => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId

    if (silent) setSyncing(true)
    else {
      setLoading(true)
      setError(null)
    }

    try {
      const res = await productService.list()
      if (requestRef.current !== requestId) return
      setProducts(Array.isArray(res.data.products) ? res.data.products : [])
      setError(null)
      setLastSyncedAt(new Date().toISOString())
    } catch (loadError) {
      if (requestRef.current !== requestId) return
      // A background refresh keeps the last good data on screen; only a
      // foreground load replaces the page with the error state.
      if (!silent) {
        setError(loadError)
        setProducts([])
      }
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false)
        setSyncing(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!user) {
      // Signed out — never keep another account's products on screen.
      requestRef.current += 1
      setProducts([])
      setError(null)
      setLoading(false)
      setSyncing(false)
      setLastSyncedAt(null)
      return undefined
    }

    load()
    return undefined
  }, [user, reloadToken, load])

  /** Refresh on demand; `silent` keeps the current view rather than a skeleton. */
  const refresh = useCallback(
    (options = {}) => {
      load({ silent: options.silent !== false })
    },
    [load],
  )

  // Coalesce bursts of live changes into one read.
  const scheduleRefresh = useCallback(() => {
    if (!user) return
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null
      load({ silent: true })
    }, LIVE_REFRESH_DELAY)
  }, [user, load])

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    },
    [],
  )

  // Products embed their bill, so bill changes revalidate the catalogue too.
  useLiveResource(['products', 'bills'], scheduleRefresh)

  const retry = useCallback(() => setReloadToken((token) => token + 1), [])

  /** Saves a new product on the server and returns the stored record. */
  const addProduct = useCallback(async (payload) => {
    const res = await productService.create(payload)
    const product = res.data.product
    setProducts((current) => [product, ...current])
    return product
  }, [])

  /** Updates a product on the server and returns the stored record. */
  const updateProduct = useCallback(async (id, patch) => {
    const res = await productService.update(id, patch)
    const product = res.data.product
    setProducts((current) =>
      current.map((existing) => (existing.id === id ? product : existing)),
    )
    return product
  }, [])

  /** Deletes a product on the server. */
  const removeProduct = useCallback(async (id) => {
    await productService.remove(id)
    setProducts((current) => current.filter((product) => product.id !== id))
  }, [])

  /** Uploads a bill file for the product and syncs the cached record. */
  const uploadBill = useCallback(async (productId, file) => {
    const res = await billService.upload(productId, file)
    setProducts((current) =>
      current.map((product) => (product.id === productId ? res.data.product : product)),
    )
    return res.data.bill
  }, [])

  /** Replaces (or attaches) the product's bill with a new file. */
  const replaceBill = useCallback(async (productId, file) => {
    const res = await billService.replace(productId, file)
    setProducts((current) =>
      current.map((product) => (product.id === productId ? res.data.product : product)),
    )
    return res.data.bill
  }, [])

  /** Removes the product's bill; the product itself stays. */
  const removeBill = useCallback(async (productId) => {
    await billService.remove(productId)
    setProducts((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, bill: null } : product,
      ),
    )
  }, [])

  const getProduct = useCallback(
    (id) => products.find((product) => product.id === id),
    [products],
  )

  const value = useMemo(
    () => ({
      products,
      loading,
      syncing,
      lastSyncedAt,
      error,
      retry,
      refresh,
      addProduct,
      updateProduct,
      removeProduct,
      uploadBill,
      replaceBill,
      removeBill,
      getProduct,
    }),
    [
      products,
      loading,
      syncing,
      lastSyncedAt,
      error,
      retry,
      refresh,
      addProduct,
      updateProduct,
      removeProduct,
      uploadBill,
      replaceBill,
      removeBill,
      getProduct,
    ],
  )

  return <ProductStoreContext.Provider value={value}>{children}</ProductStoreContext.Provider>
}

export function useProductStore() {
  const context = useContext(ProductStoreContext)
  if (!context) throw new Error('useProductStore must be used inside <ProductStoreProvider>')
  return context
}

export default ProductStoreContext
