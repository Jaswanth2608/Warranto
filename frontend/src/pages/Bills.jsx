import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Eye, FileText, Pencil, Plus, Trash2 } from 'lucide-react'

import {
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  buttonClasses,
} from '../components/ui'
import SearchInput from '../components/common/SearchInput'
import BillPreviewModal from '../components/billing/BillPreviewModal'

import { useProductStore } from '../context/ProductStore'
import { useToast } from '../context/ToastContext'
import { useDebounce } from '../hooks/useDebounce'
import { useDocumentTitle } from '../hooks/useUi'
import { getBills } from '../utils/selectors'
import { formatDate } from '../utils/dates'
import { formatFileSize } from '../utils/format'
import { downloadBill } from '../utils/bills'

const ACTION_CLASS = buttonClasses({ variant: 'secondary', size: 'sm' })

export function Bills() {
  useDocumentTitle('Digital Bills')
  const { products, loading, error, retry, removeBill } = useProductStore()
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const debouncedQuery = useDebounce(query, 250)

  const bills = getBills(products)
  const normalized = debouncedQuery.trim().toLowerCase()
  const filtered = normalized
    ? bills.filter(({ product, bill }) =>
        `${product.name} ${product.brand} ${bill.fileName}`.toLowerCase().includes(normalized),
      )
    : bills

  const confirmDeleteBill = async () => {
    if (!deleteTarget) return
    try {
      await removeBill(deleteTarget.product.id)
      toast.success(`Bill for ${deleteTarget.product.name} was deleted.`)
      setDeleteTarget(null)
    } catch (saveError) {
      toast.error(saveError.message || 'Could not delete the bill. Please try again.')
      setDeleteTarget(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <span className="skeleton block h-7 w-44" />
          <span className="skeleton mt-2.5 block h-4 w-80" />
        </div>
        <ListSkeleton rows={5} columns={4} />
      </div>
    )
  }

  if (error) return <ErrorState onRetry={retry} />

  if (bills.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Digital Bills" subtitle="Keep your purchase proof organized and accessible." />
        <EmptyState
          icon={FileText}
          title="No bills uploaded yet"
          description="Upload your purchase bills so they're always available when you need them."
          action={
            <Link to="/products/new" className={buttonClasses({ icon: Plus })}>
              Add Product
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Digital Bills"
        subtitle="Keep your purchase proof organized and accessible."
        actions={
          <Link to="/products/new" className={buttonClasses({ icon: Plus })}>
            Add Product
          </Link>
        }
      />

      <Card className="p-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search bills by product or file name..."
          label="Search bills"
        />
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          Showing <span className="font-semibold text-ink-soft">{filtered.length}</span> of{' '}
          {bills.length} bills
        </p>
        <p className="text-[13px] text-muted">
          Attached to <span className="font-semibold text-ink-soft">{bills.length}</span> products
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={FileText}
          title="No bills match your search"
          description="Try another product name or file name."
          action={
            <button
              type="button"
              onClick={() => setQuery('')}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Clear search
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ product, bill }) => (
            <Card
              key={bill.id}
              className="flex flex-col p-5 transition hover:border-line-strong"
            >
              <div className="flex items-start gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-500/15">
                  <FileText size={19} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/products/${product.id}`}
                    className="truncate text-[15px] font-semibold text-ink transition hover:text-brand-300"
                    title={product.name}
                  >
                    {product.name}
                  </Link>
                  <p className="mt-0.5 truncate text-[13px] text-muted" title={bill.fileName}>
                    {bill.fileName}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-canvas px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted ring-1 ring-line">
                  {bill.fileType}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted">Type</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-ink-soft">{bill.fileType}</dd>
                </div>
                <div className="border-x border-line">
                  <dt className="text-[11px] uppercase tracking-wide text-muted">Size</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-ink-soft">
                    {formatFileSize(bill.fileSize)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted">Uploaded</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-ink-soft">
                    {formatDate(bill.uploadedAt)}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <button
                  type="button"
                  className={ACTION_CLASS}
                  onClick={() => setPreview({ bill, product })}
                >
                  <Eye size={14} aria-hidden="true" />
                  View
                </button>
                <button
                  type="button"
                  className={ACTION_CLASS}
                  onClick={async () => {
                    if (!product || !bill) return
                    try {
                      await downloadBill(product.id, bill.fileName)
                    } catch {
                      toast.error('Could not download the bill. Please try again.')
                    }
                  }}
                >
                  <Download size={14} aria-hidden="true" />
                  Download
                </button>
                <Link
                  to={`/products/${product.id}/edit`}
                  className={ACTION_CLASS}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Replace
                </Link>
                <button
                  type="button"
                  className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'text-danger-700 hover:bg-danger-50' })}
                  onClick={() => setDeleteTarget({ bill, product })}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <BillPreviewModal
        open={Boolean(preview)}
        bill={preview?.bill}
        product={preview?.product}
        onClose={() => setPreview(null)}
        onDownload={() => {
          const { bill, product } = preview || {}
          if (!bill || !product) return
          downloadBill(product.id, bill.fileName).catch(() =>
            toast.error('Could not download the bill. Please try again.'),
          )
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this bill?"
        message={
          deleteTarget
            ? `${deleteTarget.bill.fileName} will be removed from ${deleteTarget.product.name}. The product itself stays in your account.`
            : ''
        }
        confirmLabel="Delete bill"
        onConfirm={confirmDeleteBill}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default Bills
