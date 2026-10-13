import { useState } from 'react'

import { ConfirmDialog } from '../components/ui'
import { useProductStore } from '../context/ProductStore'
import { useToast } from '../context/ToastContext'
import { getWarrantyInfo } from '../utils/warranty'

/**
 * Shared delete flow: opens a confirmation dialog, deletes the product on
 * the server and confirms with a toast. Failures keep the dialog usable and
 * show the real API message.
 */
export function useDeleteProduct(onDeleted) {
  const { removeProduct } = useProductStore()
  const toast = useToast()
  const [target, setTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async () => {
    if (!target || deleting) return
    const deleted = target
    setDeleting(true)
    try {
      await removeProduct(deleted.id)
      setTarget(null)
      onDeleted?.(deleted)
      toast.success(`${deleted.name} was deleted.`)
    } catch (deleteError) {
      toast.error(deleteError.message || 'Could not delete the product. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const dialog = (
    <ConfirmDialog
      open={Boolean(target)}
      title="Delete this product?"
      message={
        target
          ? `${target.name} and its bill details will be removed from your account. This cannot be undone.`
          : ''
      }
      confirmLabel="Delete product"
      loading={deleting}
      onConfirm={confirmDelete}
      onClose={() => setTarget(null)}
    />
  )

  return { requestDelete: setTarget, dialog }
}

/** Small helper for showing "expires in / expired" copy next to a status. */
export function statusCaption(product) {
  return getWarrantyInfo(product).dayLabel
}

export default useDeleteProduct
