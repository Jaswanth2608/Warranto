/**
 * Regression tests for the OCR response → review form mapping.
 *
 * These cover the exact seam that previously left every review field blank:
 * the property names the API returns and the form fields they fill.
 *
 * Run with:  npm test   (from the frontend folder)
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  SCAN_SUGGESTION_FIELDS,
  readScanSuggestions,
  applyScanSuggestions,
  mapScanResponseToForm,
} from './scanSuggestions.js'

/**
 * The exact `suggestions` object the deployed API returns for a labelled
 * invoice (`POST /api/scan`), captured from the live response.
 */
const API_SUGGESTIONS = {
  invoiceNumber: 'INV-2024-000123',
  purchaseDate: '2024-05-12',
  purchasePrice: 45000,
  warrantyMonths: 24,
  seller: 'Croma, Hyderabad',
  productName: 'Samsung Washing Machine',
  brand: 'Samsung',
  modelNumber: 'WA70BG4441BD',
  serialNumber: '9X3K821100',
}

const EMPTY_FORM = {
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
}

describe('readScanSuggestions', () => {
  test('reads the suggestions object from the API response body', () => {
    const body = { success: true, scanId: 'a'.repeat(24), suggestions: API_SUGGESTIONS }
    assert.deepStrictEqual(readScanSuggestions(body), API_SUGGESTIONS)
  })

  test('reads suggestions from a nested envelope', () => {
    assert.deepStrictEqual(readScanSuggestions({ data: { suggestions: API_SUGGESTIONS } }), API_SUGGESTIONS)
    assert.deepStrictEqual(readScanSuggestions({ result: { suggestions: API_SUGGESTIONS } }), API_SUGGESTIONS)
  })

  test('returns an empty object when there are no suggestions', () => {
    assert.deepStrictEqual(readScanSuggestions(undefined), {})
    assert.deepStrictEqual(readScanSuggestions(null), {})
    assert.deepStrictEqual(readScanSuggestions({}), {})
    assert.deepStrictEqual(readScanSuggestions({ suggestions: null }), {})
    assert.deepStrictEqual(readScanSuggestions({ suggestions: [] }), {})
  })
})

describe('applyScanSuggestions', () => {
  test('fills every review field the API provides', () => {
    const form = applyScanSuggestions(EMPTY_FORM, API_SUGGESTIONS)

    assert.equal(form.name, 'Samsung Washing Machine')
    assert.equal(form.brand, 'Samsung')
    assert.equal(form.modelNumber, 'WA70BG4441BD')
    assert.equal(form.serialNumber, '9X3K821100')
    assert.equal(form.seller, 'Croma, Hyderabad')
    assert.equal(form.invoiceNumber, 'INV-2024-000123')
    assert.equal(form.purchaseDate, '2024-05-12')
    assert.equal(form.purchasePrice, '45000')
    assert.equal(form.warrantyMonths, '24')
  })

  test('stringifies numbers for the text inputs', () => {
    const form = applyScanSuggestions(EMPTY_FORM, API_SUGGESTIONS)
    assert.equal(typeof form.purchasePrice, 'string')
    assert.equal(typeof form.warrantyMonths, 'string')
  })

  test('leaves fields the OCR could not read untouched — nothing is invented', () => {
    const form = applyScanSuggestions(EMPTY_FORM, { purchasePrice: 1000 })
    assert.equal(form.name, '')
    assert.equal(form.brand, '')
    assert.equal(form.modelNumber, '')
    assert.equal(form.serialNumber, '')
    assert.equal(form.seller, '')
    assert.equal(form.invoiceNumber, '')
    assert.equal(form.purchaseDate, '')
    assert.equal(form.warrantyMonths, '')
    assert.equal(form.purchasePrice, '1000')
    // Untouched fields keep their defaults too.
    assert.equal(form.category, 'electronics')
    assert.equal(form.warrantyType, 'Manufacturer Warranty')
    assert.equal(form.notes, '')
  })

  test('an empty suggestion never wipes what the user already typed', () => {
    const typed = { ...EMPTY_FORM, name: 'My own name', brand: 'MyBrand', purchasePrice: '999' }
    const form = applyScanSuggestions(typed, { productName: '', brand: null, purchasePrice: '' })
    assert.equal(form.name, 'My own name')
    assert.equal(form.brand, 'MyBrand')
    assert.equal(form.purchasePrice, '999')
  })

  test('does not mutate the previous form values', () => {
    const prev = { ...EMPTY_FORM }
    const next = applyScanSuggestions(prev, API_SUGGESTIONS)
    assert.equal(prev.name, '')
    assert.notEqual(next, prev)
  })

  test('tolerates a missing or malformed suggestions object', () => {
    assert.deepStrictEqual(applyScanSuggestions(EMPTY_FORM, undefined), EMPTY_FORM)
    assert.deepStrictEqual(applyScanSuggestions(EMPTY_FORM, null), EMPTY_FORM)
    assert.deepStrictEqual(applyScanSuggestions(EMPTY_FORM, 'nope'), EMPTY_FORM)
  })

  test('maps every advertised suggestion key onto a distinct form field', () => {
    const fields = Object.keys(SCAN_SUGGESTION_FIELDS)
    const keys = Object.values(SCAN_SUGGESTION_FIELDS)
    assert.equal(new Set(keys).size, keys.length, 'suggestion keys must be distinct')
    for (const field of fields) assert.ok(field in EMPTY_FORM, `${field} must exist on the form`)
    // The product name is the one field whose form name differs from the key.
    assert.equal(SCAN_SUGGESTION_FIELDS.name, 'productName')
  })
})

describe('mapScanResponseToForm', () => {
  test('maps the real API response onto the review form', () => {
    const body = {
      success: true,
      scanId: 'b'.repeat(24),
      file: { fileName: 'bill.pdf', fileType: 'PDF', size: 905, mimeType: 'application/pdf' },
      suggestions: API_SUGGESTIONS,
      rawText: 'TAX INVOICE\nTotal: Rs. 45,000.00',
      source: 'pdf',
      processingTimeMs: 53,
    }

    const form = mapScanResponseToForm(body, EMPTY_FORM)
    assert.equal(form.name, 'Samsung Washing Machine')
    assert.equal(form.brand, 'Samsung')
    assert.equal(form.modelNumber, 'WA70BG4441BD')
    assert.equal(form.serialNumber, '9X3K821100')
    assert.equal(form.seller, 'Croma, Hyderabad')
    assert.equal(form.invoiceNumber, 'INV-2024-000123')
    assert.equal(form.purchaseDate, '2024-05-12')
    assert.equal(form.purchasePrice, '45000')
    assert.equal(form.warrantyMonths, '24')
  })

  test('a response with no readable fields leaves the form blank and editable', () => {
    const form = mapScanResponseToForm({ success: true, suggestions: {}, rawText: '' }, EMPTY_FORM)
    assert.deepStrictEqual(form, EMPTY_FORM)
  })
})
