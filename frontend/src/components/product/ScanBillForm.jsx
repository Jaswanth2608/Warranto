import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, X, Trash2 } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { useDocumentTitle } from '../../hooks/useUi'
import {
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
  Button,
  EmptyState,
  ErrorState,
  Badge,
} from '../../components/ui'
import { scanService } from '../../services/scanService'
import { formatDate } from '../../utils/dates'
import { formatCurrency } from '../../utils/format'
import { SERVICE_TYPE_LABELS } from '../../utils/constants'

const STATUS_OPTIONS = [
  { value: 'Manufacturer Warranty', label: 'Manufacturer Warranty' },
  { value: 'Extended Warranty', label: 'Extended Warranty' },
  { value: 'Store Warranty', label: 'Store Warranty' },
  { value: 'Seller Warranty', label: 'Seller Warranty' },
  { value: 'No Warranty', label: 'No Warranty' },
]

const CATEGORY_OPTIONS = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'appliances', label: 'Appliances' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'other', label: 'Other' },
]

function FieldSuggestion({ label, value, required, children }) {
  return (
    <Field label={label} required={required} error={false}>
      <div className="flex items-center gap-2">
        <div className="flex-1">{children}</div>
        {value && (
          <Badge variant="brand" className="shrink-0">
            Suggestion
          </Badge>
        )}
      </div>
    </Field>
  )
}

export function ScanBillForm({ initialProductId, onCreated }) {
  const toast = useToast()
  const { id: existingProductId } = useParams()
  const productId = initialProductId || existingProductId || ''

  const [step, setStep] = useState('upload') // upload | review | creating | done
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [scan, setScan] = useState(null)
  // Real, operation-level error. null on first open — never rendered speculatively.
  const [error, setError] = useState(null)
  const [loadingResult, setLoadingResult] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    brand: '',
    category: 'electronics',
    modelNumber: '',
    serialNumber: '',
    purchaseDate: '',
    purchasePrice: '',
    seller: '',
    warrantyMonths: '',
    warrantyType: 'Manufacturer Warranty',
    notes: '',
    invoiceNumber: '',
  })
  const [createdProduct, setCreatedProduct] = useState(null)
  const [rawTextExpanded, setRawTextExpanded] = useState(false)

  const setSuggestion = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value || prev[field] }))
  }

  const handleFileChange = (event) => {
    const input = event.target
    const file = input.files?.[0] || null
    // Reset the input so the same file can be re-selected after a rejection.
    input.value = ''
    if (!file) return
    const accepted = ['application/pdf', 'image/jpeg', 'image/png']
    if (!accepted.includes(file.type)) {
      setFile(null)
      setError('Please choose a PDF, JPG or PNG file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setFile(null)
      setError('The bill must be 10 MB or smaller.')
      return
    }
    setError(null)
    setFile(file)
  }

  const uploadAndScan = async () => {
    if (!file) return

    setUploading(true)
    setError(null) // clear any previous failure before this attempt
    try {
      const res = await scanService.scan(productId || undefined, file)
      setScan(res.data)
      setForm((prev) => ({
        ...prev,
        name: res.data.suggestions?.productName || prev.name,
        brand: res.data.suggestions?.brand || prev.brand,
        seller: res.data.suggestions?.seller || prev.seller,
        purchaseDate: res.data.suggestions?.purchaseDate || prev.purchaseDate,
        purchasePrice: res.data.suggestions?.purchasePrice != null ? String(res.data.suggestions.purchasePrice) : prev.purchasePrice,
        warrantyMonths: res.data.suggestions?.warrantyMonths != null ? String(res.data.suggestions.warrantyMonths) : prev.warrantyMonths,
        invoiceNumber: res.data.suggestions?.invoiceNumber || prev.invoiceNumber,
      }))
      setStep('review')
      toast.success('Bill scanned. Review the suggested fields below.')
    } catch (err) {
      // Real failure: keep the user on the upload step with an inline, retryable
      // error. No product or scan result is created on this path.
      setError(
        err?.message || 'We could not scan this bill. Please try another file or enter the details manually.',
      )
      console.error('[scan] bill scan failed:', err?.code || err?.name || 'Error', err?.message || err)
    } finally {
      setUploading(false)
    }
  }

  const validateForm = () => {
    if (!form.name.trim()) {
      toast.error('Product name is required.')
      return false
    }
    if (!form.brand.trim()) {
      toast.error('Brand is required.')
      return false
    }
    if (!form.purchaseDate) {
      toast.error('Purchase date is required.')
      return false
    }
    if (!form.purchasePrice || Number(form.purchasePrice) <= 0) {
      toast.error('Purchase price is required.')
      return false
    }
    if (!form.warrantyMonths || Number(form.warrantyMonths) < 1) {
      toast.error('Warranty duration is required.')
      return false
    }
    return true
  }

  const createProduct = async () => {
    if (!validateForm()) return

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        brand: form.brand.trim(),
        category: form.category,
        modelNumber: form.modelNumber.trim(),
        serialNumber: form.serialNumber.trim(),
        purchaseDate: form.purchaseDate,
        purchasePrice: Number(form.purchasePrice),
        seller: form.seller.trim(),
        warrantyMonths: Number(form.warrantyMonths),
        warrantyType: form.warrantyType,
        notes: form.notes.trim(),
      }

      const res = await scanService.createProduct(scan.scanId, payload)
      setCreatedProduct(res.data.product)
      setStep('done')
      toast.success('Product created and bill attached.')
      onCreated?.(res.data.product)
    } catch (err) {
      toast.error(err?.message || 'Could not create the product. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setStep('upload')
    setFile(null)
    setScan(null)
    setError(null)
    setForm({
      name: '',
      brand: '',
      category: 'electronics',
      modelNumber: '',
      serialNumber: '',
      purchaseDate: '',
      purchasePrice: '',
      seller: '',
      warrantyMonths: '',
      warrantyType: 'Manufacturer Warranty',
      notes: '',
      invoiceNumber: '',
    })
    setCreatedProduct(null)
    setRawTextExpanded(false)
  }

  const suggestionFor = (field) => scan?.suggestions?.[field]
  const hasSuggestion = (field) => Boolean(suggestionFor(field))

  return (
    <div className="space-y-5">
      {step === 'upload' && (
        <>
          <Card>
            <CardHeader
              title="Scan a bill"
              description="Upload the invoice or receipt. OCR reads the text and suggests fields you can edit before saving."
            />
            <div className="p-4 sm:p-5 space-y-4">
              <Field
                label="Upload bill"
                required
                hint="PDF, JPG or PNG, up to 10 MB. No text leaves this device."
              >
                <div className="flex flex-col gap-3 rounded-[10px] border border-dashed border-line bg-surface-2/80 p-4">
                  {!file ? (
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 text-center text-muted">
                      <Upload size={22} aria-hidden="true" className="text-brand-500" />
                      <span className="text-[13.5px] font-medium">Choose a bill file</span>
                      <span className="text-[12px]">PDF, JPG or PNG</span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        id="scan-bill-file"
                        onChange={handleFileChange}
                      />
                    </label>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText size={18} className="shrink-0 text-brand-500" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium text-ink">{file.name}</p>
                          <p className="text-[12px] text-muted">
                            {(file.size / 1024).toFixed(1)} KB
                            {file.type === 'application/pdf' ? ' · PDF' : file.type === 'image/jpeg' ? ' · JPG' : ' · PNG'}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={X}
                        onClick={() => {
                          setFile(null)
                          setError(null)
                        }}
                        aria-label="Remove selected file"
                      />
                    </div>
                  )}
                </div>
              </Field>

              {productId && (
                <Field label="Link to existing product">
                  <Input
                    type="text"
                    value={productId}
                    readOnly
                    className="bg-surface text-muted"
                    placeholder="Existing product id used for this scan"
                  />
                </Field>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  loading={uploading}
                  icon={Upload}
                  onClick={uploadAndScan}
                  disabled={!file}
                >
                  {uploading ? 'Scanning bill…' : 'Scan bill'}
                </Button>
              </div>
            </div>
          </Card>

          {uploading && (
            <Card>
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <Loader2 size={18} className="shrink-0 animate-spin text-brand-500" aria-hidden="true" />
                  <span className="text-[13.5px] text-ink">Scanning the bill with OCR…</span>
                </div>
                <p className="mt-2 text-[12.5px] text-muted">
                  This runs entirely in the API. The original file is stored before OCR starts.
                </p>
              </div>
            </Card>
          )}
        </>
      )}

      {step === 'review' && scan && (
        <>
          <Card>
            <CardHeader
              title="Review extracted fields"
              description="These are suggestions from OCR. Edit anything that looks wrong — nothing is saved automatically."
            />
            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldSuggestion label="Product name" required value={hasSuggestion('productName')}>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Samsung Washing Machine"
                  />
                </FieldSuggestion>
                <FieldSuggestion label="Brand" required value={hasSuggestion('brand')}>
                  <Input
                    value={form.brand}
                    onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))}
                    placeholder="e.g. Samsung"
                  />
                </FieldSuggestion>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <Select
                    value={form.category}
                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Warranty type">
                  <Select
                    value={form.warrantyType}
                    onChange={(e) => setForm((prev) => ({ ...prev, warrantyType: e.target.value }))}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldSuggestion label="Seller" value={hasSuggestion('seller')}>
                  <Input
                    value={form.seller}
                    onChange={(e) => setForm((prev) => ({ ...prev, seller: e.target.value }))}
                    placeholder="e.g. Croma, Hyderabad"
                  />
                </FieldSuggestion>
                <Field label="Model number">
                  <Input
                    value={form.modelNumber}
                    onChange={(e) => setForm((prev) => ({ ...prev, modelNumber: e.target.value }))}
                    placeholder="Model number, if shown"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldSuggestion label="Serial number" value={hasSuggestion('serialNumber')}>
                  <Input
                    value={form.serialNumber}
                    onChange={(e) => setForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
                    placeholder="Serial number, if shown"
                  />
                </FieldSuggestion>
                <FieldSuggestion label="Invoice number" value={hasSuggestion('invoiceNumber')}>
                  <Input
                    value={form.invoiceNumber}
                    onChange={(e) => setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
                    placeholder="Invoice number, if shown"
                  />
                </FieldSuggestion>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <FieldSuggestion label="Purchase date" required value={hasSuggestion('purchaseDate')}>
                  <Input
                    type="date"
                    value={form.purchaseDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))}
                  />
                </FieldSuggestion>
                <FieldSuggestion label="Purchase price" required value={hasSuggestion('purchasePrice')}>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.purchasePrice}
                    onChange={(e) => setForm((prev) => ({ ...prev, purchasePrice: e.target.value }))}
                    placeholder="0.00"
                  />
                </FieldSuggestion>
                <FieldSuggestion label="Warranty duration" required value={hasSuggestion('warrantyMonths')}>
                  <Input
                    type="number"
                    min="1"
                    max="120"
                    value={form.warrantyMonths}
                    onChange={(e) => setForm((prev) => ({ ...prev, warrantyMonths: e.target.value }))}
                    placeholder="Months"
                  />
                </FieldSuggestion>
              </div>

              <Field label="Notes">
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any extra context"
                />
              </Field>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={reset}>
                  Start over
                </Button>
                <Button onClick={createProduct} loading={saving} disabled={!scan?.scanId}>
                  Save product and attach bill
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="OCR source"
              description={
                scan.source === 'pdf'
                  ? 'Text was read directly from the PDF text layer.'
                  : scan.source === 'pdf_no_text_layer'
                    ? 'The PDF has no text layer. OCR read it as images.'
                    : 'Text was read from the image using OCR.'
              }
            />
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-muted">
                <span className="font-medium text-ink">
                  {scan.processingTimeMs != null ? `Processed in ${scan.processingTimeMs}ms` : 'Processed'}
                </span>
                {scan.rawText ? (
                  <button
                    type="button"
                    onClick={() => setRawTextExpanded(!rawTextExpanded)}
                    className="text-brand-500 hover:text-brand-400 underline"
                  >
                    {rawTextExpanded ? 'Hide extracted text' : 'Show extracted text'}
                  </button>
                ) : null}
              </div>

              {rawTextExpanded && scan.rawText ? (
                <div className="mt-3 max-h-64 overflow-auto rounded-[8px] bg-surface-2 p-3 text-[12px] text-muted whitespace-pre-wrap">
                  {scan.rawText}
                </div>
              ) : null}

              {!scan.rawText ? (
                <div className="mt-2 rounded-[8px] border border-dashed border-line bg-surface-2/80 p-3 text-[12.5px] text-muted">
                  <p className="flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0 text-warning-700" aria-hidden="true" />
                    No text was extracted from this document. You can still create the product by entering the
                    details manually.
                  </p>
                </div>
              ) : null}
            </div>
          </Card>

          {!scan.rawText && (
            <Card>
              <div className="p-4 sm:p-5">
                <EmptyState
                  compact
                  icon={AlertCircle}
                  title="No text extracted"
                  description="OCR could not read text from this file. You can still create the product manually and attach the saved bill."
                  action={
                    <Button variant="secondary" size="sm" onClick={reset}>
                      Enter details manually
                    </Button>
                  }
                />
              </div>
            </Card>
          )}
        </>
      )}

      {step === 'done' && createdProduct && (
        <Card>
          <CardHeader title="Product created" description="Your bill has been scanned, reviewed, and saved." />
          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="shrink-0 text-success-700" aria-hidden="true" />
              <span className="text-[14px] font-medium text-ink">{createdProduct.name}</span>
            </div>
            <p className="text-[13px] text-muted">
              Purchased {formatDate(createdProduct.purchaseDate)} · {formatCurrency(createdProduct.purchasePrice)} ·{' '}
              {createdProduct.warrantyMonths} months warranty
            </p>
            {createdProduct.bill && (
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                <FileText size={14} className="shrink-0 text-brand-500" aria-hidden="true" />
                <span className="truncate">{createdProduct.bill.fileName}</span>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={reset}>
                Scan another bill
              </Button>
            </div>
          </div>
        </Card>
      )}

      {error && step !== 'done' && (
        <ErrorState
          title={error.startsWith('Please choose') || error.startsWith('The bill must') ? 'Check the file' : 'Scan failed'}
          message={error}
          onRetry={() => setError(null)}
          compact
        />
      )}
    </div>
  )
}

export default ScanBillForm
