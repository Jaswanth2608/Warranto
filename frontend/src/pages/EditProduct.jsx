import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, PackageX, Upload, Trash2 } from 'lucide-react'

import {
  Button,
  EmptyState,
  PageHeader,
  DetailSkeleton,
  buttonClasses,
} from '../components/ui'
import BillUploader from '../components/product/BillUploader'
import ProductForm from '../components/product/ProductForm'
import { useProductStore } from '../context/ProductStore'
import { useToast } from '../context/ToastContext'
import { useDocumentTitle } from '../hooks/useUi'

export function EditProduct() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    getProduct,
    updateProduct,
    replaceBill,
    removeBill,
    loading,
    error,
    retry,
  } = useProductStore()
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)

  const product = getProduct(id)
  useDocumentTitle(product ? `Edit ${product.name}` : 'Edit Product')

  if (loading) return <DetailSkeleton />

  if (error) {
    return (
      <EmptyState
        icon={PackageX}
        title="We could not load this product"
        description="Please try again in a moment."
        action={
          <button type="button" onClick={retry} className={buttonClasses()}>
            Try again
          </button>
        }
      />
    )
  }

  if (!product) {
    return (
      <EmptyState
        icon={PackageX}
        title="Product not found"
        description="This product may have been deleted, or the link is no longer valid."
        action={
          <Link to="/products" className={buttonClasses()}>
            Back to My Products
          </Link>
        }
      />
    )
  }

  const handleSubmit = async (values) => {
    setSubmitting(true)
    try {
      const { bill, ...fields } = values

      const updated = await updateProduct(product.id, fields)

      if (bill instanceof File) {
        try {
          await replaceBill(product.id, bill)
          toast.success(`${updated.name} and its bill were updated.`)
        } catch (uploadError) {
          setSubmitting(false)
          toast.warning(
            `Saved ${updated.name}, but the bill upload failed: ${uploadError.message}. You can retry from Edit Product.`,
            { duration: 8000 },
          )
          navigate(`/products/${product.id}`)
          return
        }
      } else if (bill === null && product.bill) {
        try {
          await removeBill(product.id)
          toast.success(`${updated.name} was updated. The bill was removed.`)
        } catch (removeError) {
          toast.error(removeError.message || 'Could not remove the bill. Please try again.')
          navigate(`/products/${product.id}`)
          return
        }
      } else {
        toast.success(`${values.name} was updated.`)
      }

      navigate(`/products/${product.id}`)
    } catch (saveError) {
      toast.error(saveError.message || 'Could not save your changes. Please try again.')
      setSubmitting(false)
    }
  }

  const initialValues = {
    name: product.name,
    brand: product.brand,
    category: product.category,
    modelNumber: product.modelNumber ?? '',
    serialNumber: product.serialNumber ?? '',
    purchaseDate: product.purchaseDate,
    purchasePrice: product.purchasePrice,
    seller: product.seller ?? '',
    warrantyMonths: product.warrantyMonths,
    warrantyType: product.warrantyType ?? 'Manufacturer Warranty',
    notes: product.notes ?? '',
    bill: product.bill ?? null,
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/products/${product.id}`}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition hover:text-brand-300"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to product details
      </Link>

      <PageHeader
        title={`Edit ${product.name}`}
        subtitle="Update the purchase details, warranty duration or attached bill."
      />

      <ProductForm
        initialValues={initialValues}
        submitLabel="Save Changes"
        submitting={submitting}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/products/${product.id}`)}
      />
    </div>
  )
}

export default EditProduct
