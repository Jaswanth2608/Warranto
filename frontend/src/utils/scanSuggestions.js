/**
 * Mapping between the OCR scan response and the review form.
 *
 * This is deliberately a pure module (no React, no network) so the exact
 * contract — which response property fills which review field — is covered by
 * regression tests. It is the seam that previously left every review field
 * blank, so it must stay trivially testable.
 *
 * Rules:
 * - A value is only ever copied out of the response. A field the OCR could not
 *   read keeps whatever the user already had; nothing is invented.
 * - An empty suggestion never erases a field.
 * - Numbers are stringified because the review inputs hold text.
 */

/** Suggestion keys the API can return, and the form field each one fills. */
export const SCAN_SUGGESTION_FIELDS = Object.freeze({
  name: 'productName',
  brand: 'brand',
  modelNumber: 'modelNumber',
  serialNumber: 'serialNumber',
  seller: 'seller',
  invoiceNumber: 'invoiceNumber',
  purchaseDate: 'purchaseDate',
  purchasePrice: 'purchasePrice',
  warrantyMonths: 'warrantyMonths',
})

/**
 * Reads the suggestions object out of a scan response body.
 *
 * The API returns `{ success, scanId, suggestions, … }`. The nested fallbacks
 * exist only so that wrapping the payload in an envelope (or unwrapping it)
 * can never silently empty the review form again.
 */
export function readScanSuggestions(body) {
  const candidates = [body?.suggestions, body?.data?.suggestions, body?.result?.suggestions]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate
  }
  return {}
}

/**
 * Applies OCR suggestions on top of the current form values.
 * Pure: returns a new object and never mutates `prev`.
 */
export function applyScanSuggestions(prev, suggestions) {
  const next = { ...prev }
  if (!suggestions || typeof suggestions !== 'object') return next

  for (const [field, key] of Object.entries(SCAN_SUGGESTION_FIELDS)) {
    const value = suggestions[key]
    if (value === undefined || value === null || value === '') continue
    next[field] = String(value)
  }
  return next
}

/**
 * Convenience wrapper used by the review form: takes the raw response body
 * (the axios `res.data`) and the current form values.
 */
export function mapScanResponseToForm(body, prev) {
  return applyScanSuggestions(prev, readScanSuggestions(body))
}

export default mapScanResponseToForm
