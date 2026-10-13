import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  Eye,
  FileText,
  FileX,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Replace,
  Trash2,
  Upload,
} from 'lucide-react'

import {
  Card,
  CardHeader,
  DetailSkeleton,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  EmptyState,
  StatusBadge,
  buttonClasses,
} from '../components/ui'
import ProductIcon from '../components/common/ProductIcon'
import WarrantyTimeline from '../components/product/WarrantyTimeline'
import BillPreviewModal from '../components/billing/BillPreviewModal'

import { useProductStore } from '../context/ProductStore'
import { useDeleteProduct } from '../hooks/useDeleteProduct'
import { useDocumentTitle } from '../hooks/useUi'
import { useToast } from '../context/ToastContext'
import { formatDate, formatDateLong } from '../utils/dates'
import { formatCurrency, formatDuration, formatFileSize } from '../utils/format'
import { getWarrantyInfo } from '../utils/warranty'
import { CATEGORY_LABELS } from '../utils/constants'
import { downloadBill } from '../utils/bills'
import { ServiceHistory } from '../components/product/ServiceHistory'

function InfoGrid({ items }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">
            {item.label}
          </dt>
          <dd className="mt-1 text-[14px] font-medium text-ink">{item.value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ProductDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { getProduct, loading, error, retry, removeBill } = useProductStore()
  const { requestDelete, dialog } = useDeleteProduct((deleted) => {
    if (deleted.id === id) navigate('/products')
  })

  const [previewOpen, setPreviewOpen] = useState(false)

  const product = getProduct(id)
  useDocumentTitle(product ? product.name : 'Product Details')

  if (loading) return <DetailSkeleton />

  if (error) {
    return (
      <EmptyState
        icon={RefreshCw}
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
        icon={FileX}
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

  const info = getWarrantyInfo(product)

  const billActions = [
    { label: 'View Bill', icon: Eye, onClick: () => setPreviewOpen(true) },
    {
      label: 'Download',
      icon: Download,
      onClick: async () => {
        try {
          await downloadBill(product.id, product.bill.fileName)
        } catch {
          toast.error('Could not download the bill. Please try again.')
        }
      },
    },
    { label: 'Replace', icon: Replace, onClick: () => navigate(`/products/${product.id}/edit`) },
  ]

  return (
    <div className="space-y-5">
      <Link
        to="/products"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted transition hover:text-brand-400"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        Back to My Products
      </Link>

      {/* Record header */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <ProductIcon product={product} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[20px] font-semibold tracking-tight text-ink">
                  {product.name}
                </h1>
                <StatusBadge status={info.status} />
              </div>
              <p className="mt-1 text-[13px] text-muted">
                {product.brand} · {CATEGORY_LABELS[product.category] ?? 'Other'}
                {product.modelNumber ? ` · ${product.modelNumber}` : ''}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-muted">
                <span>
                  Purchased{' '}
                  <span className="font-medium text-ink-soft">
                    {formatDate(product.purchaseDate)}
                  </span>
                </span>
                <span>
                  Price{' '}
                  <span className="font-medium text-ink-soft">
                    {formatCurrency(product.purchasePrice)}
                  </span>
                </span>
                <span
                  className={`font-medium ${
                    info.status === 'expired'
                      ? 'text-danger-700'
                      : info.status === 'expiring'
                        ? 'text-warning-700'
                        : 'text-success-700'
                  }`}
                >
                  {info.dayLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              to={`/products/${product.id}/edit`}
              className={buttonClasses({ variant: 'secondary', icon: Pencil })}
            >
              Edit Product
            </Link>
            <Dropdown
              trigger={
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-line bg-surface-2 text-ink-soft transition hover:bg-line/80"
                  aria-label="More actions"
                >
                  <MoreHorizontal size={16} aria-hidden="true" />
                </button>
              }
            >
              <DropdownItem icon={Eye} onClick={() => setPreviewOpen(true)}>
                View bill
              </DropdownItem>
              <DropdownItem icon={Pencil} onClick={() => navigate(`/products/${product.id}/edit`)}>
                Edit product
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={Trash2} danger onClick={() => requestDelete(product)}>
                Delete product
              </DropdownItem>
            </Dropdown>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Purchase information" uppercase />
            <div className="p-4 sm:p-5">
              <InfoGrid
                items={[
                  { label: 'Purchase date', value: formatDateLong(product.purchaseDate) },
                  { label: 'Purchase price', value: formatCurrency(product.purchasePrice) },
                  { label: 'Seller', value: product.seller },
                  { label: 'Model number', value: product.modelNumber },
                  { label: 'Serial number', value: product.serialNumber },
                  { label: 'Category', value: CATEGORY_LABELS[product.category] },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Warranty" uppercase />
            <div className="p-4 sm:p-5">
              <InfoGrid
                items={[
                  { label: 'Warranty duration', value: formatDuration(product.warrantyMonths) },
                  { label: 'Warranty type', value: product.warrantyType },
                  { label: 'Warranty start', value: formatDateLong(product.purchaseDate) },
                  { label: 'Warranty expiry', value: formatDateLong(info.expiryDate) },
                  {
                    label: 'Days remaining',
                    value:
                      info.daysRemaining < 0 ? 'Coverage ended' : `${info.daysRemaining} days`,
                  },
                  { label: 'Current status', value: <StatusBadge status={info.status} /> },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Warranty timeline"
              description="Where your coverage stands today"
            />
            <div className="p-4 sm:p-5">
              <WarrantyTimeline product={product} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Bill"
              description={
                product.bill
                  ? 'Your proof of purchase, stored with this product'
                  : 'No bill attached to this product yet'
              }
            />
            {product.bill ? (
              <div className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="group flex h-24 w-full shrink-0 flex-col items-center justify-center gap-1.5 rounded-[10px] border border-line bg-canvas text-muted transition hover:border-brand-500/60 hover:bg-brand-500/8 sm:h-28 sm:w-24"
                    aria-label={`Preview ${product.bill.fileName}`}
                  >
                    <FileText
                      size={20}
                      className="transition group-hover:text-brand-400"
                      aria-hidden="true"
                    />
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.06em]">
                      {product.bill.fileType}
                    </span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[14px] font-medium text-ink"
                      title={product.bill.fileName}
                    >
                      {product.bill.fileName}
                    </p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                      <div className="flex gap-1.5">
                        <dt className="text-muted">Type</dt>
                        <dd className="font-medium text-ink-soft">{product.bill.fileType}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-muted">Size</dt>
                        <dd className="font-medium text-ink-soft">
                          {formatFileSize(product.bill.fileSize)}
                        </dd>
                      </div>
                      <div className="col-span-2 flex gap-1.5">
                        <dt className="text-muted">Uploaded</dt>
                        <dd className="font-medium text-ink-soft">
                          {formatDate(product.bill.uploadedAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  {billActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={action.onClick}
                      className={buttonClasses({ variant: 'secondary', size: 'sm', icon: action.icon })}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-5">
                <EmptyState
                  compact
                  icon={FileX}
                  title="No bill uploaded yet"
                  description="Attach the invoice so a warranty claim never depends on a lost receipt."
                  action={
                    <Link
                      to={`/products/${product.id}/edit`}
                      className={buttonClasses({ icon: Upload })}
                    >
                      Upload bill
                    </Link>
                  }
                />
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <div className="p-4 sm:p-5">
              {product.notes ? (
                <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink-soft">
                  {product.notes}
                </p>
              ) : (
                <p className="text-[13.5px] text-muted">
                  No notes added for this product yet. Add service details, accessories or care
                  plan information while editing.
                </p>
              )}
            </div>
          </Card>

          <ServiceHistory productId={product.id} productName={product.name} />
        </div>

        {/* Coverage summary */}
        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-line bg-surface-2/70 px-4 py-3 sm:px-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                Coverage summary
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-muted">Status</span>
                <StatusBadge status={info.status} />
              </div>

              <div className="mt-4">
                <p
                  className={`text-[30px] font-semibold leading-none tracking-tight ${
                    info.status === 'expired'
                      ? 'text-danger-700'
                      : info.status === 'expiring'
                        ? 'text-warning-700'
                        : 'text-ink'
                  }`}
                >
                  {info.daysRemaining < 0 ? Math.abs(info.daysRemaining) : info.daysRemaining}
                </p>
                <p className="mt-1.5 text-[12.5px] text-muted">
                  {info.daysRemaining < 0
                    ? 'days since coverage ended'
                    : info.daysRemaining === 0
                      ? 'coverage ends today'
                      : 'days of coverage remaining'}
                </p>
              </div>

              <dl className="mt-5 space-y-3 border-t border-line pt-4 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Expires on</dt>
                  <dd className="font-medium text-ink-soft">{formatDate(info.expiryDate)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Warranty</dt>
                  <dd className="font-medium text-ink-soft">
                    {formatDuration(product.warrantyMonths)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Bill</dt>
                  <dd className="font-medium text-ink-soft">
                    {product.bill ? `${product.bill.fileType} attached` : 'Not attached'}
                  </dd>
                </div>
              </dl>

              <Link
                to={`/products/${product.id}/edit`}
                className={buttonClasses({
                  variant: 'secondary',
                  icon: Pencil,
                  className: 'mt-5 w-full',
                })}
              >
                Edit Product
              </Link>
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-[13.5px] font-semibold text-ink">Before you claim</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Keep the bill and serial number handy — most service centres ask for both. Your
              digital copies are right here.
            </p>
            <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-muted">
              Bought from {product.seller || 'a seller not recorded'}
            </p>
          </Card>
        </aside>
      </div>

      {dialog}

      <BillPreviewModal
        open={previewOpen && Boolean(product.bill)}
        onClose={() => setPreviewOpen(false)}
        bill={product.bill}
        product={product}
        onDownload={() => {
          const { bill } = product
          if (!bill) return
          downloadBill(product.id, bill.fileName).catch(() =>
            toast.error('Could not download the bill. Please try again.'),
          )
        }}
      />
    </div>
  )
}

export default ProductDetails
