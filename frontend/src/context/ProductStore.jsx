import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { productService } from '../services/productService'
import { billService } from '../services/billService'

/**
 * Product catalogue backed by the Warranto API.
 * - Loads the signed-in user's products from the database.
 * - Create / update / delete are real API calls; each one waits for the
 *   server so pages can show accurate success and failure messages.
 * - Bill upload / replace / delete go through /api/bills and update the
 *   cached product so every page stays in sync.
 * - Products belong to the authenticated user, so signing out clears them.
 */

const ProductStoreContext = createContext(null)

export function ProductStoreProvider({ children }) {
  const { user } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(Boolean(user))
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!user) {
      // Signed out — never keep another account's products on screen.
      setProducts([])
      setError(null)
      setLoading(false)
      return () => {}
    }

    let active = true
    setLoading(true)
    setError(null)

    productService
      .list()
      .then((res) => {
        if (!active) return
        setProducts(Array.isArray(res.data.products) ? res.data.products : [])
        setLoading(false)
      })
      .catch((loadError) => {
        if (!active) return
        // Show the error state — never fall back to fake data silently.
        setError(loadError)
        setProducts([])
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user, reloadToken])

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
      current.map((product) => (product.id === productId ? { ...product, bill: null } : product)),
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
      error,
      retry,
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
      error,
      retry,
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
