import { useState } from 'react'
import { Info, Receipt } from 'lucide-react'

import { Button, Card, Field, Input, Select, StatusBadge, Textarea } from '../ui'
import BillUploader from './BillUploader'
import { CATEGORIES, WARRANTY_DURATIONS, WARRANTY_TYPES } from '../../utils/constants'
import { formatDateLong, toISODate } from '../../utils/dates'
import { formatDuration } from '../../utils/format'
import { getWarrantyInfo } from '../../utils/warranty'

const DEFAULT_VALUES = {
  name: '',
  brand: '',
  category: 'electronics',
  modelNumber: '',
  serialNumber: '',
  purchaseDate: '',
  purchasePrice: '',
  seller: '',
  warrantyMonths: 12,
  warrantyType: 'Manufacturer Warranty',
  notes: '',
  bill: null,
}

const PRESET_DURATIONS = WARRANTY_DURATIONS.filter((option) => option.value !== 'custom').map(
  (option) => option.value,
)

function validate(values) {
  const errors = {}

  if (!values.name.trim()) errors.name = 'Product name is required.'
  if (!values.brand.trim()) errors.brand = 'Brand is required.'
  if (!values.category) errors.category = 'Choose a category.'

  if (!values.purchaseDate) {
    errors.purchaseDate = 'Purchase date is required.'
  } else if (new Date(values.purchaseDate) > new Date()) {
    errors.purchaseDate = 'Purchase date cannot be in the future.'
  }

  if (values.purchasePrice === '' || values.purchasePrice === null) {
    errors.purchasePrice = 'Purchase price is required.'
  } else if (Number.isNaN(Number(values.purchasePrice)) || Number(values.purchasePrice) < 0) {
    errors.purchasePrice = 'Enter a valid amount.'
  }

  const months = Number(values.warrantyMonths)
  if (!months || Number.isNaN(months)) {
    errors.warrantyMonths = 'Warranty duration is required.'
  } else if (months < 1 || months > 120) {
    errors.warrantyMonths = 'Enter a duration between 1 and 120 months.'
  }

  return errors
}

/**
 * Shared by Add Product and Edit Product.
 * Warranty expiry is previewed live and clearly marked as auto-calculated.
 */
export function ProductForm({
  initialValues,
  submitLabel = 'Save Product',
  onSubmit,
  onCancel,
  submitting = false,
}) {
  const [values, setValues] = useState(() => ({ ...DEFAULT_VALUES, ...initialValues }))
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState(null)

  const update = (key) => (event) => {
    const { value } = event.target
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const isCustomDuration = !PRESET_DURATIONS.includes(Number(values.warrantyMonths))
  const preview = values.purchaseDate
    ? getWarrantyInfo({
        purchaseDate: values.purchaseDate,
        warrantyMonths: Number(values.warrantyMonths) || 0,
      })
    : null

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      const firstField = document.getElementById(`pf-${Object.keys(nextErrors)[0]}`)
      firstField?.focus()
      return
    }
    onSubmit?.({
      ...values,
      name: values.name.trim(),
      brand: values.brand.trim(),
      modelNumber: values.modelNumber.trim(),
      serialNumber: values.serialNumber.trim(),
      seller: values.seller.trim(),
      notes: values.notes.trim(),
      purchasePrice: Number(values.purchasePrice),
      warrantyMonths: Number(values.warrantyMonths),
      // Bill stays as-is: null, a File (uploaded on save), or the stored bill.
      bill: values.bill ?? null,
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <FormSection title="Product information" description="What did you buy?">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Product Name"
              htmlFor="pf-name"
              required
              error={errors.name}
              className="sm:col-span-2"
            >
              <Input
                id="pf-name"
                name="name"
                value={values.name}
                onChange={update('name')}
                placeholder="e.g. Samsung Washing Machine"
                error={Boolean(errors.name)}
                autoComplete="off"
              />
            </Field>

            <Field label="Brand" htmlFor="pf-brand" required error={errors.brand}>
              <Input
                id="pf-brand"
                name="brand"
                value={values.brand}
                onChange={update('brand')}
                placeholder="e.g. Samsung"
                error={Boolean(errors.brand)}
                autoComplete="off"
              />
            </Field>

            <Field label="Category" htmlFor="pf-category" required error={errors.category}>
              <Select
                id="pf-category"
                name="category"
                value={values.category}
                onChange={update('category')}
                error={Boolean(errors.category)}
              >
                {CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Model Number" htmlFor="pf-modelNumber" hint="Optional">
              <Input
                id="pf-modelNumber"
                name="modelNumber"
                value={values.modelNumber}
                onChange={update('modelNumber')}
                placeholder="e.g. WW70TA046VB"
                autoComplete="off"
              />
            </Field>

            <Field label="Serial Number" htmlFor="pf-serialNumber" hint="Optional">
              <Input
                id="pf-serialNumber"
                name="serialNumber"
                value={values.serialNumber}
                onChange={update('serialNumber')}
                placeholder="e.g. SMW-2024-7740192"
                autoComplete="off"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Purchase information" description="When and where did you buy it?">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Purchase Date"
              htmlFor="pf-purchaseDate"
              required
              error={errors.purchaseDate}
            >
              <Input
                id="pf-purchaseDate"
                name="purchaseDate"
                type="date"
                value={values.purchaseDate}
                onChange={update('purchaseDate')}
                error={Boolean(errors.purchaseDate)}
                max={toISODate(new Date())}
              />
            </Field>

            <Field
              label="Purchase Price (₹)"
              htmlFor="pf-purchasePrice"
              required
              error={errors.purchasePrice}
            >
              <Input
                id="pf-purchasePrice"
                name="purchasePrice"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={values.purchasePrice}
                onChange={update('purchasePrice')}
                placeholder="e.g. 32490"
                error={Boolean(errors.purchasePrice)}
              />
            </Field>

            <Field
              label="Seller / Store"
              htmlFor="pf-seller"
              hint="Optional"
              className="sm:col-span-2"
            >
              <Input
                id="pf-seller"
                name="seller"
                value={values.seller}
                onChange={update('seller')}
                placeholder="e.g. Croma, Hyderabad"
                autoComplete="off"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Warranty information"
          description="The expiry date is derived from these two fields."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Warranty Duration"
              htmlFor="pf-warrantyMonths"
              required
              error={errors.warrantyMonths}
            >
              <Select
                id="pf-warrantyMonths"
                name="warrantyDuration"
                value={isCustomDuration ? 'custom' : Number(values.warrantyMonths)}
                onChange={(event) => {
                  const { value } = event.target
                  setValues((current) => ({
                    ...current,
                    warrantyMonths: value === 'custom' ? 18 : Number(value),
                  }))
                  setErrors((current) => ({ ...current, warrantyMonths: undefined }))
                }}
                error={Boolean(errors.warrantyMonths)}
              >
                {WARRANTY_DURATIONS.map((option) => (
                  <option key={String(option.value)} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            {isCustomDuration ? (
              <Field
                label="Custom Duration (months)"
                htmlFor="pf-customMonths"
                required
                error={errors.warrantyMonths}
              >
                <Input
                  id="pf-customMonths"
                  name="customMonths"
                  type="number"
                  min="1"
                  max="120"
                  value={values.warrantyMonths}
                  onChange={update('warrantyMonths')}
                  error={Boolean(errors.warrantyMonths)}
                />
              </Field>
            ) : (
              <Field label="Warranty Type" htmlFor="pf-warrantyType">
                <Select
                  id="pf-warrantyType"
                  name="warrantyType"
                  value={values.warrantyType}
                  onChange={update('warrantyType')}
                >
                  {WARRANTY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {isCustomDuration ? (
              <Field label="Warranty Type" htmlFor="pf-warrantyType" className="sm:col-span-2">
                <Select
                  id="pf-warrantyType"
                  name="warrantyType"
                  value={values.warrantyType}
                  onChange={update('warrantyType')}
                >
                  {WARRANTY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </FormSection>

        <FormSection title="Notes & bill" description="Anything worth remembering later.">
          <div className="space-y-4">
            <Field label="Notes" htmlFor="pf-notes" hint="Optional">
              <Textarea
                id="pf-notes"
                name="notes"
                value={values.notes}
                onChange={update('notes')}
                placeholder="Accessories included, service centre details, extended care plan…"
              />
            </Field>

            <Field label="Purchase Bill" htmlFor="pf-bill" hint="PDF, JPG, JPEG or PNG · max 10 MB · uploaded when you save">
              <BillUploader
                id="pf-bill"
                file={values.bill}
                onChange={(file) => setValues((current) => ({ ...current, bill: file }))}
                onError={(message) => setNotice(message)}
              />
            </Field>

            {notice ? (
              <p className="rounded-md bg-danger-50 px-3 py-2 text-[13px] font-medium text-danger-700 ring-1 ring-inset ring-danger-500/15" role="alert">
                {notice}
              </p>
            ) : null}
          </div>
        </FormSection>

        <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {submitLabel}
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="overflow-hidden">
          <div className="border-b border-line bg-canvas/70 px-5 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Warranty preview
            </p>
          </div>
          <div className="space-y-3.5 p-5">
            <PreviewRow
              label="Purchase Date"
              value={values.purchaseDate ? formatDateLong(values.purchaseDate) : '—'}
            />
            <PreviewRow
              label="Warranty"
              value={formatDuration(Number(values.warrantyMonths))}
            />
            <div className="border-t border-line pt-3.5">
              <PreviewRow
                label="Calculated Expiry"
                value={preview ? formatDateLong(preview.expiryDate) : '—'}
                emphasis
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3.5">
              <span className="text-[13px] text-muted">Status</span>
              {preview ? (
                <StatusBadge status={preview.status} />
              ) : (
                <span className="text-[13px] font-medium text-muted">—</span>
              )}
            </div>
          </div>
          <div className="flex gap-2.5 border-t border-line bg-brand-50/60 px-5 py-4">
            <Info size={15} className="mt-0.5 shrink-0 text-brand-400" aria-hidden="true" />
            <p className="text-[12.5px] leading-relaxed text-brand-300">
              The expiry date is <span className="font-semibold">calculated automatically</span>{' '}
              from your purchase date and warranty duration — no manual entry needed.
            </p>
          </div>
        </Card>

        <div className="mt-4 flex gap-2.5 rounded-xl border border-line bg-surface p-4 shadow-card">
          <Receipt size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />            <p className="text-[12.5px] leading-relaxed text-muted">
              Attach a bill and Warranto stores it securely with the product. You can preview,
              download, replace or remove it any time from the product page.
            </p>
        </div>
      </aside>
    </form>
  )
}

function FormSection({ title, description, children }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-5 border-b border-line pb-4">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function PreviewRow({ label, value, emphasis = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-muted">{label}</span>
      <span
        className={`text-right text-[13.5px] ${emphasis ? 'font-semibold text-ink' : 'font-medium text-ink-soft'}`}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Converts the locally selected file into the bill shape used by the UI.
 */

export default ProductForm
