import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { PageHeader, buttonClasses } from '../components/ui'
import ProductForm from '../components/product/ProductForm'
import BillUploader from '../components/product/BillUploader'
import { useProductStore } from '../context/ProductStore'
import { useToast } from '../context/ToastContext'
import { useDocumentTitle } from '../hooks/useUi'

export function AddProduct() {
  useDocumentTitle('Add Product')
  const navigate = useNavigate()
  const { addProduct, uploadBill } = useProductStore()
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)

  /** Creates the product, then uploads the selected bill file if one is attached. */
  const handleSubmit = async (values) => {
    setSubmitting(true)
    try {
      const { bill, ...fields } = values

      const product = await addProduct(fields)

      if (bill instanceof File) {
        try {
          await uploadBill(product.id, bill)
          toast.success(`${product.name} and its bill were added.`)
        } catch (uploadError) {
          // Undo the empty bill so the product still loads cleanly in the store.
          setSubmitting(false)
          toast.warning(
            `Added ${product.name}, but the bill upload failed: ${uploadError.message}. You can upload it from Edit Product.`,
            { duration: 8000 },
          )
          navigate(`/products/${product.id}`)
          return
        }
      } else {
        toast.success(`${product.name} was added to your account.`)
      }

      navigate(`/products/${product.id}`)
    } catch (saveError) {
      toast.error(saveError.message || 'Could not save the product. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/products"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition hover:text-brand-300"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to My Products
      </Link>

      <PageHeader
        title="Add Product"
        subtitle="Record a new purchase — Warranto will calculate the warranty expiry for you."
      />

      <ProductForm
        submitLabel="Add Product"
        submitting={submitting}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/products')}
      />
    </div>
  )
}

export default AddProduct
