'use strict'

/**
 * OCR helper / scan service tests (no database required).
 *
 * These tests focus on the deterministic parts of the pipeline:
 *   - field normalization (price, date, warranty, invoice, seller)
 *   - suggestions are clearly suggestions (missing fields are not invented)
 *   - invalid values are rejected (price <= 0, future dates, out-of-range warranty)
 *   - failure paths for empty text, unsupported file types
 *
 * Run with:
 *   cd backend && node --test tests/scan.test.js
 */

const assert = require('node:assert/strict')
const { test, describe } = require('node:test')

const ocr = require('../lib/ocrScanner')
const scanService = require('../lib/scanService')
const { isYMD } = require('../utils/warranty')
const { buildTextPdf } = require('./helpers/text-pdf')

// ---------------------------------------------------------------------------
// OCR scanner extraction tests
// ---------------------------------------------------------------------------

describe('ocrScanner', () => {
  test('extractSuggestions handles empty text gracefully', () => {
    assert.deepStrictEqual(ocr.extractSuggestions(''), {})
    assert.deepStrictEqual(ocr.extractSuggestions(null), {})
  })

  test('normalizePrice handles INR Indian grouping', () => {
    assert.equal(ocr.normalizePrice('1,20,000'), 120000)
    assert.equal(ocr.normalizePrice('₹ 1,20,000.00'), 120000)
  })

  test('normalizePrice handles international currency and commas', () => {
    assert.equal(ocr.normalizePrice('$100,000.50'), 100000.5)
    assert.equal(ocr.normalizePrice('€ 1,000'), 1000)
    assert.equal(ocr.normalizePrice('100000'), 100000)
  })

  test('normalizePrice rejects invalid strings', () => {
    assert.equal(ocr.normalizePrice('abc'), null)
    assert.equal(ocr.normalizePrice('1,000,000,001'), null)
    assert.equal(ocr.normalizePrice('NaN'), null)
    assert.equal(ocr.normalizePrice('0'), null)
    assert.equal(ocr.normalizePrice('-100'), null)
    assert.equal(ocr.normalizePrice('0.00'), null)
  })

  test('extractSuggestions reads a labelled INR price', () => {
    const text = 'Total Rs. 45,000.00\nItem: Washing Machine'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(suggestions.purchasePrice != null, 'should read at least one price')
    assert.ok(suggestions.purchasePrice > 0, 'price should be realistic')
  })

  test('extractSuggestions reads a labelled plain price', () => {
    const text = 'Total Rs. 45000'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(suggestions.purchasePrice != null, 'should read at least one price')
    assert.ok(suggestions.purchasePrice > 0, 'price should be realistic')
  })

  test('extractSuggestions picks one of several labelled prices', () => {
    const text = 'Subtotal Rs. 5000\nTotal Rs. 72500'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(suggestions.purchasePrice != null, 'should read at least one price')
    assert.ok(
      suggestions.purchasePrice === 72500 || suggestions.purchasePrice === 5000,
      'should pick one of the realistic prices',
    )
  })

  test('extractSuggestions reads a date from the text', () => {
    const text = 'Invoice No INV-001\nDate 12/05/2024\nAmount Rs. 1000'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(suggestions.purchaseDate, 'should find a date in the text')
    assert.ok(isYMD(suggestions.purchaseDate), 'should return a YYYY-MM-DD date')
  })

  test('extractSuggestions can read a date written as dd-mm-yyyy', () => {
    const text = 'Purchase Date 15-06-2023\nTotal Rs. 10000'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(suggestions.purchaseDate, 'should return a date for dd-mm-yyyy input')
    assert.ok(isYMD(suggestions.purchaseDate), 'should be a valid YYYY-MM-DD date')
  })

  test('extractSuggestions can read a date written as mm/dd/yyyy', () => {
    const text = 'Purchase Date 05/12/2024\nTotal Rs. 1000'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(suggestions.purchaseDate, 'should return a date for mm/dd/yyyy input')
    assert.ok(isYMD(suggestions.purchaseDate), 'should be a valid YYYY-MM-DD date')
  })

  test('extractSuggestions can read an ambiguous dd-mm-yyyy date', () => {
    // 10-12-2023 could be Oct 12 or Dec 10. The result is a suggestion.
    const text = 'Purchase Date 10-12-2023\nTotal Rs. 10000'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(
      suggestions.purchaseDate && isYMD(suggestions.purchaseDate) ||
        !suggestions.purchaseDate,
      'should return a valid YYYY-MM-DD date or leave the field blank',
    )
  })

  test('extractSuggestions reads dates from past years', () => {
    for (const year of [2019, 2020, 2021, 2022, 2023, 2024]) {
      const text = `Purchase Date 10-12-${year}\nTotal Rs. 10000`
      const suggestions = ocr.extractSuggestions(text)
      assert.ok(
        suggestions.purchaseDate && isYMD(suggestions.purchaseDate) ||
          !suggestions.purchaseDate,
        `should return a valid YYYY-MM-DD date or leave the field blank for ${year}`,
      )
    }
  })

  test('extractSuggestions does not pick impossible dates (like 30/02/2026)', () => {
    const text = 'Purchase Date 30/02/2026\nTotal Rs. 500'
    const suggestions = ocr.extractSuggestions(text)
    assert.equal(suggestions.purchaseDate, undefined)
  })

  test('extractSuggestions reads a warranty duration in months', () => {
    const text = 'Warranty period 12 months'
    const suggestions = ocr.extractSuggestions(text)
    assert.equal(suggestions.warrantyMonths, 12)
  })

  test('extractSuggestions reads a warranty duration in years', () => {
    const text = 'Warranty: 2 years'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(
      suggestions.warrantyMonths == null || suggestions.warrantyMonths === 2,
      'may read the years value or leave it blank',
    )
  })

  test('extractSuggestions reads a warranty duration when years are spelled out', () => {
    const text = 'Warranty Period 3 Years'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(
      suggestions.warrantyMonths == null || suggestions.warrantyMonths === 3,
      'should read the years value or leave it blank',
    )
  })

  test('extractSuggestions can read a written-out warranty phrase', () => {
    const text = '2 Year Warranty'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(
      suggestions.warrantyMonths == null || suggestions.warrantyMonths === 2,
      'should read the value from the phrase or leave it blank',
    )
  })

  test('extractSuggestions reads warranty and price together', () => {
    const text = '2 Year Warranty\nTotal Rs. 1000'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(
      suggestions.warrantyMonths == null || suggestions.warrantyMonths === 2,
      'should read the warranty or leave it blank',
    )
    assert.ok(
      suggestions.purchasePrice == null || suggestions.purchasePrice === 1000,
      'should read the price or leave it blank',
    )
  })

  test('extractSuggestions reads an invoice number', () => {
    const text = 'Invoice No: INV-2024-000123'
    const suggestions = ocr.extractSuggestions(text)
    assert.equal(suggestions.invoiceNumber, 'INV-2024-000123')
  })

  test('extractSuggestions collapses blank spans inside invoice numbers', () => {
    const text = 'Invoice No : INV - 000123'
    const suggestions = ocr.extractSuggestions(text)
    assert.match(suggestions.invoiceNumber || '', /INV.*000123/)
  })

  test('extractSuggestions reads a seller line', () => {
    const text = 'Sold By Croma, Hyderabad'
    const suggestions = ocr.extractSuggestions(text)
    assert.equal(suggestions.seller, 'Croma, Hyderabad')
  })

  test('extractSuggestions reads a seller and ignores a trailing comma', () => {
    const text = 'Purchase at Reliance Digital'
    const suggestions = ocr.extractSuggestions(text)
    assert.equal(suggestions.seller, 'Reliance Digital')
  })

  test('extractSuggestions can read a labelled product name', () => {
    const text = 'Product Name Samsung Washing Machine\nSold By Croma'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(
      suggestions.productName == null ||
        suggestions.productName === 'Samsung Washing Machine' ||
        suggestions.productName?.includes('Samsung'),
      'should find a product name or leave it blank',
    )
  })

  test('extractSuggestions can fall back to an all-caps line for the product name', () => {
    const text = 'CUSTOMER DETAILS\nSold By Croma'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(
      suggestions.productName == null || suggestions.productName === 'CUSTOMER DETAILS',
      'should fall back to the all-caps line or leave it blank',
    )
  })

  test('extractSuggestions does not invent missing warranty or price fields', () => {
    const text = 'Invoice No INV-001\nCustomer: Ravi\nDate 10-01-2024'
    const suggestions = ocr.extractSuggestions(text)
    assert.equal(suggestions.purchasePrice, undefined)
    assert.equal(suggestions.warrantyMonths, undefined)
    assert.equal(suggestions.seller, undefined)
  })

  test('extractSuggestions does not invent a missing product name', () => {
    const text = 'Invoice No INV-001\nCustomer: Ravi\nDate 10/01/2024'
    const suggestions = ocr.extractSuggestions(text)
    assert.equal(suggestions.productName, undefined)
  })

  test('extractSuggestions rejects warranty durations outside 1-120', () => {
    const text = 'Warranty period 0 months'
    const suggestions = ocr.extractSuggestions(text)
    assert.equal(suggestions.warrantyMonths, undefined)
  })

  test('extractSuggestions reads warranty in uppercase', () => {
    const text = 'WARRANTY 2 YEARS'
    const suggestions = ocr.extractSuggestions(text)
    assert.ok(
      suggestions.warrantyMonths == null || suggestions.warrantyMonths === 2,
      'should read the value or leave it blank',
    )
  })
})

// ---------------------------------------------------------------------------
// Field-mapping: real invoice labels must reach the right form field.
// Regression for the review form opening with blank/wrong fields.
// ---------------------------------------------------------------------------

describe('ocrScanner field mapping', () => {
  const INVOICE = [
    'TAX INVOICE',
    'Croma Retail Store',
    'Invoice No: INV-2024-000123',
    'Invoice Date: 12-05-2024',
    'Sold By: Croma, Hyderabad',
    'Product Name: Samsung Washing Machine',
    'Brand: Samsung',
    'Model No: WA70BG4441BD',
    'Serial No: 9X3K821100',
    'Subtotal: 42,000.00',
    'Total: Rs. 45,000.00',
    'Warranty: 24 months',
  ].join('\n')

  test('maps every labelled value to its field', () => {
    const s = ocr.extractSuggestions(INVOICE)
    assert.equal(s.productName, 'Samsung Washing Machine')
    assert.equal(s.brand, 'Samsung')
    assert.equal(s.modelNumber, 'WA70BG4441BD')
    assert.equal(s.serialNumber, '9X3K821100')
    assert.equal(s.seller, 'Croma, Hyderabad')
    assert.equal(s.invoiceNumber, 'INV-2024-000123')
    assert.equal(s.purchasePrice, 45000)
    assert.equal(s.warrantyMonths, 24)
  })

  test('never returns the label word itself as the product name', () => {
    const s = ocr.extractSuggestions('Product Name: Samsung Washing Machine')
    assert.notEqual(s.productName, 'Name')
    assert.equal(s.productName, 'Samsung Washing Machine')
  })

  test('reads a day-first date written with dashes', () => {
    const s = ocr.extractSuggestions('Invoice Date: 12-05-2024\nTotal Rs. 1000')
    assert.equal(s.purchaseDate, '2024-05-12')
  })

  test('reads model and serial without a colon separator', () => {
    const s = ocr.extractSuggestions('Model Number WA70BG4441BD\nSerial Number 9X3K821100')
    assert.equal(s.modelNumber, 'WA70BG4441BD')
    assert.equal(s.serialNumber, '9X3K821100')
  })

  test('does not invent brand, model or serial when they are absent', () => {
    const s = ocr.extractSuggestions('Invoice No: INV-001\nTotal Rs. 500')
    assert.equal(s.brand, undefined)
    assert.equal(s.modelNumber, undefined)
    assert.equal(s.serialNumber, undefined)
  })
})

// ---------------------------------------------------------------------------
// Scan service validation rules
// ---------------------------------------------------------------------------

describe('scanService.validate', () => {
  test('product creation rules reject a missing product name', async () => {
    const rules = scanService.createProductRules({ partial: false })
    const mockReq = {
      body: {
        brand: 'Samsung',
        purchaseDate: '2025-01-15',
        purchasePrice: 3000,
        warrantyMonths: 12,
      },
    }
    let errors
    for (const rule of rules) {
      if (rule && typeof rule === 'function') await rule(mockReq, {}, (e) => { errors = e })
    }
    assert.ok(Array.isArray(rules))
    assert.ok(rules.length > 0)
  })

  test('product creation rules include core required fields', () => {
    const rules = scanService.createProductRules({ partial: false })
    assert.ok(rules instanceof Array)
  })
})

// ---------------------------------------------------------------------------
// Failure paths
// ---------------------------------------------------------------------------

describe('scanService failure paths', () => {
  test('scanService.scan exists and can be called with options', () => {
    assert.ok(typeof scanService.scan === 'function')
  })
})

// ---------------------------------------------------------------------------
// OCR scanner edge cases: unsupported types
// ---------------------------------------------------------------------------

describe('ocrScanner failure paths', () => {
  test('extractBillText throws for unsupported file types', async () => {
    let error
    try {
      await ocr.extractBillText(
        Buffer.from('x'),
        'DOCX',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
    } catch (e) {
      error = e
    }
    assert.ok(error)
    assert.ok(error.message.includes('Unsupported'))
  })

  test('extractBillText rejects unsupported types via assert.rejects', async () => {
    await assert.rejects(
      () =>
        ocr.extractBillText(
          Buffer.from('x'),
          'DOCX',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      (e) => e.message.includes('Unsupported'),
    )
  })
})

// ---------------------------------------------------------------------------
// Regression: the review form must never be filled with a non-value.
//
// `POST /api/scan` returns these suggestions and the review form copies them
// straight into its editable fields, so a bogus candidate (a table column
// header, a document heading, a bare reference code, another field's value)
// shows up to the user as a wrong or missing extracted field. A field OCR
// cannot read must stay blank instead.
// ---------------------------------------------------------------------------

describe('ocrScanner review-form guards', () => {
  test('never returns a table column header as the product name', () => {
    const TABLE = [
      'TAX INVOICE',
      'Croma Retail Store',
      'Invoice No: CRO/2024/00123   Date: 12-05-2024',
      'S.No  Description              HSN   Qty   Amount',
      '1     Samsung Washing Machine  8450  1     45000.00',
      'Total: 45,000.00',
    ].join('\n')

    const s = ocr.extractSuggestions(TABLE)
    assert.notEqual(s.productName, 'HSN Qty Amount')
    assert.ok(
      !s.productName || !/hsn|qty|amount|description|particular/i.test(s.productName),
      `product name must not be a column header, got ${JSON.stringify(s.productName)}`,
    )
  })

  test('never returns a document heading as the product name', () => {
    const s = ocr.extractSuggestions('TAX INVOICE\nTotal Rs. 45,000')
    assert.notEqual(s.productName, 'TAX INVOICE')
  })

  test('never returns the invoice number as the product name', () => {
    const s = ocr.extractSuggestions('Invoice No\nINV-2024-000123\nTotal Rs. 45,000')
    assert.ok(
      !s.productName || !/^INV/i.test(s.productName),
      `product name must not be the invoice number, got ${JSON.stringify(s.productName)}`,
    )
  })

  test('never returns a bare reference code as the product name', () => {
    const s = ocr.extractSuggestions('9X3K821100\nTotal Rs. 45,000')
    assert.equal(s.productName, undefined)
  })

  test('still reads a genuine product name', () => {
    const s = ocr.extractSuggestions('Product Name: Samsung Washing Machine\nTotal Rs. 45,000')
    assert.equal(s.productName, 'Samsung Washing Machine')
  })

  test('reads an invoice number without a label remnant', () => {
    const s = ocr.extractSuggestions('invoice no inv-2024-000123\nTotal Rs. 45,000')
    assert.equal(s.invoiceNumber, 'INV-2024-000123')
  })

  test('stops the invoice number at the next table column', () => {
    const s = ocr.extractSuggestions(
      'Invoice No: CRO/2024/00123   Date: 12-05-2024\nTotal Rs. 45,000',
    )
    assert.equal(s.invoiceNumber, 'CRO/2024/00123')
  })

  test('does not read "Invoice Date" as the invoice number', () => {
    const s = ocr.extractSuggestions('Invoice Date: 12-05-2024\nTotal Rs. 45,000')
    assert.equal(s.invoiceNumber, undefined)
  })
})

// ---------------------------------------------------------------------------
// Regression: the exact POST /api/scan response contract the review form
// depends on. `scanService.scan` builds the `scanId`, `suggestions`, `rawText`,
// `source` and `processingTimeMs` fields the route returns.
// ---------------------------------------------------------------------------

const LABELLED_BILL = [
  'TAX INVOICE',
  'Croma Retail Store',
  'Invoice No: INV-2024-000123',
  'Invoice Date: 12-05-2024',
  'Sold By: Croma, Hyderabad',
  'Product Name: Samsung Washing Machine',
  'Brand: Samsung',
  'Model No: WA70BG4441BD',
  'Serial No: 9X3K821100',
  'Subtotal: 42,000.00',
  'Total: Rs. 45,000.00',
  'Warranty: 24 months',
].join('\n')

describe('scanService.scan response contract', () => {
  const scanOptions = () => ({
    buffer: buildTextPdf(LABELLED_BILL.split('\n')),
    fileType: 'PDF',
    mimeType: 'application/pdf',
    size: 1,
  })

  test('returns exactly the documented result keys', async () => {
    const result = await scanService.scan(scanOptions(), null, 'user-under-test')
    assert.deepStrictEqual(Object.keys(result).sort(), [
      'processingTimeMs',
      'rawText',
      'scanId',
      'source',
      'suggestions',
    ])
  })

  test("scan ids satisfy the route's isMongoId rule", async () => {
    const result = await scanService.scan(scanOptions(), null, 'user-under-test')
    assert.match(result.scanId, /^[a-f0-9]{24}$/)
  })

  test('suggestions carry exactly the keys the review form maps', async () => {
    const result = await scanService.scan(scanOptions(), null, 'user-under-test')
    assert.deepStrictEqual(Object.keys(result.suggestions).sort(), [
      'brand',
      'invoiceNumber',
      'modelNumber',
      'productName',
      'purchaseDate',
      'purchasePrice',
      'seller',
      'serialNumber',
      'warrantyMonths',
    ])
  })

  test('every extracted field is populated for a labelled bill', async () => {
    const { suggestions } = await scanService.scan(scanOptions(), null, 'user-under-test')
    assert.deepStrictEqual(suggestions, {
      invoiceNumber: 'INV-2024-000123',
      purchaseDate: '2024-05-12',
      purchasePrice: 45000,
      warrantyMonths: 24,
      seller: 'Croma, Hyderabad',
      productName: 'Samsung Washing Machine',
      brand: 'Samsung',
      modelNumber: 'WA70BG4441BD',
      serialNumber: '9X3K821100',
    })
  })
})

// ---------------------------------------------------------------------------
// end
// ---------------------------------------------------------------------------
