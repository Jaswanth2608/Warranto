import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  FileText,
  FileX,
  Plus,
  Trash2,
  Filter,
  ArrowUpDown,
  Calendar,
  Wrench,
  Settings2,
  Check,
  Sparkles,
  Scissors,
  Heart,
} from 'lucide-react'
import { useDocumentTitle } from '../../hooks/useUi'
import { useToast } from '../../context/ToastContext'
import {
  Card,
  CardHeader,
  EmptyState,
  Button,
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  ConfirmDialog,
  Badge,
} from '../../components/ui'
import { serviceService } from '../../services'
import { formatDate, toISODate } from '../../utils/dates'
import { formatCurrency } from '../../utils/format'
import { SERVICE_TYPE_LABELS } from '../../utils/constants'

const SERVICE_ICONS = {
  repair: Wrench,
  maintenance: Settings2,
  checkup: Check,
  cleaning: Sparkles,
  servicing: Sparkles,
  parts_replacement: Scissors,
  inspection: FileText,
  support: Heart,
  other: FileText,
}

function ServiceIcon({ type }) {
  const Icon = SERVICE_ICONS[type] || FileText
  return <Icon size={13} aria-hidden="true" />
}

/** Compact record row used by the history list. */
function ServiceRow({ record, onEdit, confirmDelete }) {
  const serviceLabel = SERVICE_TYPE_LABELS[record.serviceType] || record.serviceType

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-[10px] border border-line bg-surface-2/70 p-3.5 transition hover:bg-surface-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-surface text-muted ring-1 ring-inset ring-line">
        <ServiceIcon type={record.serviceType} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[13.5px] font-medium text-ink">{serviceLabel}</span>
          {record.invoice ? (
            <Badge variant="brand">Receipt</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          {record.serviceCentre || record.technician
            ? [record.serviceCentre, record.technician].filter(Boolean).join(' · ')
            : 'No service centre recorded'}
        </p>
        {record.issueDescription ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft line-clamp-2">
            {record.issueDescription}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-medium text-ink">{formatCurrency(record.serviceCost)}</p>
        <p className="text-[11.5px] text-muted">{formatDate(record.serviceDate)}</p>
      </div>
      <div className="shrink-0 flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onEdit?.(record)}
          aria-label={`Edit ${serviceLabel} record`}
        >
          <Plus size={14} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => confirmDelete?.(record)}
          aria-label={`Delete ${serviceLabel} record`}
          className="text-danger-700 hover:bg-danger-500/12 hover:text-danger-700"
        >
          <Trash2 size={14} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

export function ServiceHistory({ productId, productName }) {
  const toast = useToast()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [totalCost, setTotalCost] = useState(0)
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('desc')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ serviceDate: '', serviceType: 'repair', serviceCentre: '', technician: '', issueDescription: '', workPerformed: '', serviceCost: '', currency: 'INR', nextServiceDate: '', notes: '', invoice: null })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [invoicePreview, setInvoicePreview] = useState(null)

  const load = async (resetError = true) => {
    setLoading(true)
    setError(resetError ? null : error)
    try {
      const params = {}
      if (productId) params.product = productId
      if (serviceTypeFilter !== 'all') params.serviceType = serviceTypeFilter
      if (sortOrder === 'asc') params.sort = 'asc'
      const res = await serviceService.forProduct(productId, params)
      setRecords(res.data.records || [])
      setTotalCost(Number(res.data.totalCost || 0))
      if (!res.data.productName && res.data.product?.name) {
        useDocumentTitle(res.data.product.name)
      }
    } catch (err) {
      setError(err?.message || 'Could not load service history.')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [productId, serviceTypeFilter, sortOrder])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.serviceDate || !form.serviceType) return

    setSaving(true)
    try {
      const payload = {
        product: productId,
        serviceDate: form.serviceDate,
        serviceType: form.serviceType,
        serviceCentre: form.serviceCentre.trim(),
        technician: form.technician.trim(),
        issueDescription: form.issueDescription.trim(),
        workPerformed: form.workPerformed.trim(),
        serviceCost: form.serviceCost ? Number(form.serviceCost) : 0,
        currency: form.currency || 'INR',
        nextServiceDate: form.nextServiceDate || null,
        notes: form.notes.trim(),
        invoice: editing ? undefined : form.invoice,
      }

      if (editing) {
        await serviceService.update(editing.id, payload)
        toast.success('Service record updated.')
      } else {
        await serviceService.create(payload)
        toast.success('Service record added.')
      }

      setModalOpen(false)
      resetForm()
      load()
    } catch (err) {
      toast.error(err?.message || 'Could not save the service record.')
    } finally {
      setSaving(false)
    }
  }

  const removeInvoice = () => {
    setForm((prev) => ({ ...prev, invoice: null }))
    setInvoicePreview(null)
  }

  const handleInvoiceChange = async (file) => {
    if (!file) return
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Invoice must be a PDF, JPG or PNG.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Invoice must be 10 MB or smaller.')
      return
    }
    setForm((prev) => ({ ...prev, invoice: file }))
    setInvoicePreview({ name: file.name, size: file.size, type: file.type })
  }

  const deleteRecord = async (record) => {
    setDeleting(record.id)
    try {
      await serviceService.remove(record.id)
      toast.success('Service record deleted.')
      setDeleting(null)
      load()
    } catch (err) {
      toast.error(err?.message || 'Could not delete the service record.')
      setDeleting(null)
    }
  }

  const startEdit = (record) => {
    setEditing(record)
    setForm({ serviceDate: record.serviceDate || '', serviceType: record.serviceType || 'repair', serviceCentre: record.serviceCentre || '', technician: record.technician || '', issueDescription: record.issueDescription || '', workPerformed: record.workPerformed || '', serviceCost: record.serviceCost != null ? String(record.serviceCost) : '', currency: record.currency || 'INR', nextServiceDate: record.nextServiceDate || '', notes: record.notes || '', invoice: record.invoice ? { fileName: record.invoice.fileName } : null })
    setModalOpen(true)
  }

  const resetForm = () => {
    setEditing(null)
    setForm({ serviceDate: '', serviceType: 'repair', serviceCentre: '', technician: '', issueDescription: '', workPerformed: '', serviceCost: '', currency: 'INR', nextServiceDate: '', notes: '', invoice: null })
    setInvoicePreview(null)
  }

  const isEditing = Boolean(editing?.id)
  const actionLabel = isEditing ? 'Save changes' : 'Add service record'
  const modalTitle = isEditing
    ? `Edit service record for ${productName}`
    : `Add service record for ${productName}`

  return (
    <>
      <Card>
        <CardHeader
          title="Service history"
          description={`${productName || 'This product'} service and repair record`}
          action={
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => setModalOpen(true)}>
              Add service
            </Button>
          }
        />

        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-[10px] bg-surface-2" />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon={FileX}
              title="Could not load service history"
              description={error}
            />
          ) : records.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No service records yet"
              description="Every repair, check-up or maintenance visit helps you understand how this product has been cared for."
              action={
                <Button variant="secondary" size="sm" icon={Plus} onClick={() => setModalOpen(true)}>
                  Add first record
                </Button>
              }
            />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-[12.5px] text-muted">
                  <Filter size={13} aria-hidden="true" />
                  <span className="text-[11.5px] uppercase tracking-[0.06em]">Filter</span>
                  <select
                    className="h-7 rounded-[6px] border border-line bg-surface-2 px-2 text-[12px] text-ink"
                    value={serviceTypeFilter}
                    onChange={(e) => setServiceTypeFilter(e.target.value)}
                  >
                    <option value="all">All types</option>
                    {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 text-[12.5px] text-muted">
                  <ArrowUpDown size={13} aria-hidden="true" />
                  <span className="text-[11.5px] uppercase tracking-[0.06em]">Sort</span>
                  <select
                    className="h-7 rounded-[6px] border border-line bg-surface-2 px-2 text-[12px] text-ink"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                  >
                    <option value="desc">Newest first</option>
                    <option value="asc">Oldest first</option>
                  </select>
                </div>
                <div className="ml-auto flex items-center gap-2 rounded-[7px] border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] text-muted">
                  <Calendar size={13} aria-hidden="true" />
                  <span className="text-[11.5px] uppercase tracking-[0.06em]">Total</span>
                  <span className="font-medium text-ink">{formatCurrency(totalCost)}</span>
                </div>
              </div>

              <div className="space-y-2.5">
                {records.map((record) => (
                  <ServiceRow
                    key={record.id}
                    record={record}
                    onEdit={startEdit}
                    confirmDelete={deleteRecord}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          resetForm()
        }}
        title={modalTitle}
        description="Record the service date, centre, cost and any notes. You can attach a receipt too."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModalOpen(false); resetForm() }}>
              Cancel
            </Button>
            <Button type="submit" form="service-form" loading={saving}>
              {actionLabel}
            </Button>
          </>
        }
      >
        <form id="service-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service date" required>
              <Input
                type="date"
                value={form.serviceDate}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceDate: e.target.value }))}
                max={toISODate(new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000))}
              />
            </Field>
            <Field label="Service type" required>
              <Select
                value={form.serviceType}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceType: e.target.value }))}
              >
                {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service centre">
              <Input
                placeholder="e.g. Regional service centre"
                value={form.serviceCentre}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceCentre: e.target.value }))}
              />
            </Field>
            <Field label="Technician">
              <Input
                placeholder="Technician name, if known"
                value={form.technician}
                onChange={(e) => setForm((prev) => ({ ...prev, technician: e.target.value }))}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Issue">
              <Textarea
                rows={3}
                placeholder="What went wrong?"
                value={form.issueDescription}
                onChange={(e) => setForm((prev) => ({ ...prev, issueDescription: e.target.value }))}
              />
            </Field>
            <Field label="Work performed">
              <Textarea
                rows={3}
                placeholder="What was done to fix it"
                value={form.workPerformed}
                onChange={(e) => setForm((prev) => ({ ...prev, workPerformed: e.target.value }))}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Service cost">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.serviceCost}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceCost: e.target.value }))}
              />
            </Field>
            <Field label="Currency">
              <Select
                value={form.currency}
                onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </Select>
            </Field>
            <Field label="Next service">
              <Input
                type="date"
                value={form.nextServiceDate}
                onChange={(e) => setForm((prev) => ({ ...prev, nextServiceDate: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea
              rows={3}
              placeholder="Any extra context, warranty references, or follow-up items"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </Field>

          {!isEditing && (
            <Field label="Attach receipt" hint="PDF, JPG or PNG, up to 10 MB.">
              <div className="flex flex-col gap-2 rounded-[8px] border border-dashed border-line bg-surface-2 p-3">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  id="service-invoice-file"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    handleInvoiceChange(file || null)
                  }}
                />
                {invoicePreview ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-ink-soft truncate">{invoicePreview.name}</span>
                    <div className="flex gap-2">
                      <span className="text-[11.5px] text-muted">
                        {(invoicePreview.size / 1024).toFixed(1)} KB
                      </span>
                      <button
                        type="button"
                        className="text-[12.5px] text-danger-700 hover:underline"
                        onClick={removeInvoice}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    htmlFor="service-invoice-file"
                    className="cursor-pointer flex items-center gap-2 text-[13px] text-muted hover:text-ink transition"
                  >
                    <FileText size={14} aria-hidden="true" />
                    Choose receipt file
                  </label>
                )}
              </div>
            </Field>
          )}

          {isEditing && editing?.invoice ? (
            <div className="flex items-center justify-between rounded-[8px] border border-line bg-surface-2 px-3 py-2.5">
              <span className="text-[13px] text-ink-soft">Attached: {editing.invoice.fileName}</span>
            </div>
          ) : null}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete service record?"
        message="This will remove the service record and its attached receipt. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={Boolean(deleting)}
        onConfirm={() => {
          const record = records.find((r) => r.id === deleting)
          if (record) deleteRecord(record)
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
