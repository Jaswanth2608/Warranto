'use strict'

const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const Tesseract = require('tesseract.js')
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs')

const { isYMD } = require('../utils/warranty')

const MAX_PDF_PAGES = 12
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const PDF_RENDER_SCALE = 2

// Local English language data so OCR never depends on a CDN round-trip.
// tesseract.js resolves `${langPath}/eng.traineddata` from disk in Node.
const LANG_PATH = path.resolve(__dirname, '..')
const LANG_FILE = path.join(LANG_PATH, 'eng.traineddata')
// If the local file is missing (fresh clone), fall back to tesseract's default
// CDN download instead of failing every scan.
const LOCAL_LANG_OPTIONS = fs.existsSync(LANG_FILE) ? { langPath: LANG_PATH, gzip: false } : {}

// pdfjs loads its worker through the ESM loader, which requires a file:// URL
// on Windows (a bare absolute "C:\..." path is rejected).
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
).href

// pdfjs looks up bundled standard fonts relative to this URL (silences the
// "standardFontDataUrl" warning and avoids fallback-font lookups failing).
const STANDARD_FONTS_URL = `${path
  .join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')
  .replace(/\\/g, '/')}/`

/**
 * Runs OCR on a rendered PDF page image.
 * pdfjs' NodeCanvasFactory uses @napi-rs/canvas (its own optional dependency),
 * so no extra packages are needed to rasterize a page.
 */
async function renderPdfPageToPng(page, canvasFactory) {
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE })
  const width = Math.max(1, Math.ceil(viewport.width))
  const height = Math.max(1, Math.ceil(viewport.height))
  const canvasAndContext = canvasFactory.create(width, height)

  try {
    await page.render({
      canvasContext: canvasAndContext.context,
      canvas: canvasAndContext.canvas,
      viewport,
      background: '#ffffff',
    }).promise
    return canvasAndContext.canvas.toBuffer('image/png')
  } finally {
    canvasFactory.destroy(canvasAndContext)
  }
}

// ---------------------------------------------------------------------------
// PDF / image text extraction
// ---------------------------------------------------------------------------

async function extractTextFromPdfBuffer(buffer) {
  const data = new Uint8Array(buffer)
  const loadingTask = pdfjs.getDocument({ data, standardFontDataUrl: STANDARD_FONTS_URL })
  const doc = await loadingTask.promise
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES)
  const parts = []

  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i)
    const text = await page.getTextContent()
    const pageText = text.items
      .map((item) => (typeof item.str === 'string' ? item.str : String(item.str)))
      .join('\n')
    parts.push(pageText)
  }

  await loadingTask.destroy()
  return parts.join('\n')
}

/**
 * Fallback for PDFs without a text layer (scans, photos, image-only PDFs):
 * rasterize each page with pdfjs and run Tesseract on the rendered image.
 */
async function extractTextFromRenderedPdf(buffer) {
  const data = new Uint8Array(buffer)
  const loadingTask = pdfjs.getDocument({ data, standardFontDataUrl: STANDARD_FONTS_URL })
  const doc = await loadingTask.promise
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES)
  const parts = []

  try {
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i)
      const png = await renderPdfPageToPng(page, doc.canvasFactory)
      const text = await extractTextFromImage(png, 'image/png')
      if (text && text.trim()) parts.push(text.trim())
    }
  } finally {
    await loadingTask.destroy()
  }

  return parts.join('\n')
}

async function extractTextFromImage(buffer, mimeType) {
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Image too large for OCR.')
  }

  if (!mimeType) mimeType = detectImageMimeType(buffer)

  // Never pass `logger: undefined` — tesseract.js merges options over its
  // defaults with an object spread, so an explicit undefined clobbers the
  // default no-op logger and every progress event throws
  // "logger is not a function", crashing the worker mid-scan.
  // `errorHandler` is required too: without it tesseract re-throws worker
  // rejections from inside its message listener ("Error attempting to read
  // image"), which is an uncaught exception that would kill the API process.
  // With it, the failure surfaces as a normal promise rejection we can map to
  // a 422 response.
  // `langPath`/`gzip: false` read eng.traineddata from disk (no network).
  const result = await Tesseract.recognize(buffer, 'eng', {
    mimeType,
    ...LOCAL_LANG_OPTIONS,
    logger: () => {},
    errorHandler: (err) => {
      // Diagnostic only — never include file contents or bill data.
      console.error('[ocr] tesseract worker error:', err && err.message ? err.message : err)
    },
  })

  return String(result.data.text || '')
}

/** Sniffs PNG / JPEG magic bytes so OCR gets a correct mimeType. */
function detectImageMimeType(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  return undefined
}

async function extractBillText(buffer, fileType, mimeType) {
  if (fileType === 'PDF') {
    const text = await extractTextFromPdfBuffer(buffer)
    if (!text || text.trim().length === 0) {
      // No text layer: read the rendered pages with OCR instead of giving up.
      const ocrText = await extractTextFromRenderedPdf(buffer)
      return { text: ocrText, source: 'pdf_no_text_layer' }
    }
    return { text, source: 'pdf' }
  }

  if (fileType === 'JPG' || fileType === 'PNG') {
    const text = await extractTextFromImage(buffer, mimeType)
    return { text, source: 'image' }
  }

  throw new Error('Unsupported file type for OCR.')
}

// ---------------------------------------------------------------------------
// Field normalization helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a raw price string into a number, or null.
 *
 * Supports:
 *  - INR Indian grouping: "1,20,000" or "1,20,000.00"
 *  - International grouping: "100,000.50"
 *  - Currency symbols: ₹ $ € £
 *  - Trailing .00 stripped
 */
function normalizePrice(raw) {
  if (!raw) return null
  const str = String(raw).trim()
  if (!str) return null

  // Handle Indian numbering: 1,20,000 / 1,20,000.00
  const indianMatch = str.match(/^(?:₹\s*)?1,(?:[0-9]{2},)?[0-9]{3}(?:\.[0-9]{1,2})?$/)
  if (indianMatch) {
    const cleaned = str.replace(/[^0-9.]/g, '')
    const num = Number(cleaned)
    if (isFinite(num) && num > 0 && num <= 100000000) {
      return Math.round(num * 100) / 100
    }
    return null
  }

  // Strip leading currency symbols and whitespace.
  const stripped = str.replace(/^[₹$€£\s]+/, '')

  // International grouping: remove commas, strip trailing .00.
  const cleaned = stripped
    .replace(/,/g, '')
    .replace(/^([0-9]+)\.0+$/, '$1')
  const num = Number(cleaned)
  if (!isFinite(num) || num <= 0 || num > 100000000) return null
  return Math.round(num * 100) / 100
}

/**
 * Extracts candidate dates from OCR text.
 *
 * Accepts DD-MM-YYYY and MM/DD/YYYY. When a value could be either ordering
 * (e.g. 10-12-2023), both interpretations are considered and the separator's
 * own convention wins (`-` → day-first, `/` → month-first), falling back to the
 * other only when the preferred one is not a real calendar date. The most
 * recent realistic date breaks ties — the result is only a suggestion.
 */
function normalizeDate(text) {
  if (!text) return null

  // The separator is captured (and must repeat) so its convention can decide
  // ambiguous dates: "12-05-2024" is day-first (DD-MM, the common form on
  // Indian invoices) while "12/05/2024" is month-first (MM/DD).
  const re = /(\d{1,2})([-/])(\d{1,2})\2(\d{2,4})/g
  const candidates = []
  let m

  while ((m = re.exec(text)) !== null) {
    const a = Number(m[1])
    const b = Number(m[3])
    const separator = m[2]
    const yearRaw = m[4]
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw)

    if (year < 1990 || year > 2035) continue

    const dayFirst = separator === '-'
    // rank 0 = the separator's own convention, rank 1 = the alternative.
    const push = (date, preferred) => {
      if (date) candidates.push({ date, rank: preferred ? 0 : 1 })
    }

    // Interpretation 1: first = day, second = month (DD-MM-YYYY).
    push(candidateDate(year, b, a), dayFirst)
    // Interpretation 2: first = month, second = day (MM-DD-YYYY).
    push(candidateDate(year, a, b), !dayFirst)
  }

  if (candidates.length === 0) return null

  // Prefer dates within the last 5 years or the next year.
  const now = new Date()
  const lower = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate())
  const upper = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())

  const realistic = candidates.filter((c) => c.date >= lower && c.date <= upper)
  const pool = realistic.length > 0 ? realistic : candidates

  // The separator's convention wins; the most recent date breaks ties.
  pool.sort((x, y) => x.rank - y.rank || y.date - x.date)
  return pool[0].date
}

function candidateDate(year, month, day) {
  // Use the same validity check the rest of the app uses.
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ---------------------------------------------------------------------------
// Field extraction (suggestions only)
// ---------------------------------------------------------------------------

const LABEL_TOTAL = /\b(?:total|amount|price|grand total|bill amount|net amount|subtotal|balance due|amount due)\b/i
const LABEL_WARRANTY = /\b(?:warranty|guarantee|waranty)\b/i

function firstLabeledNumber(text, labelRegex, unitRegex) {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!labelRegex.test(line)) continue
    // Look for a number that comes AFTER the label, not the label itself.
    const labelMatch = line.match(labelRegex)
    if (!labelMatch) continue
    const afterLabel = line.slice(labelMatch.index + labelMatch[0].length)
    const m = afterLabel.match(/(\d{1,3})\s*(months?|yrs?|years?|mnths?)?/i)
    if (!m) continue
    const value = Number(m[1])
    const unit = (m[2] || '').toLowerCase()
    if (unitRegex && !unitRegex.test(unit)) continue
    if (value < 1 || value > 120) continue
    return { value }
  }
  return null
}

function firstLabeledCurrency(text, labelRegex) {
  const lines = text.split(/\r?\n/)
  let best = null

  for (const line of lines) {
    if (!labelRegex.test(line)) continue
    const labelMatch = line.match(labelRegex)
    if (!labelMatch) continue
    const afterLabel = line.slice(labelMatch.index + labelMatch[0].length)
    // Find currency-looking numbers after the label.
    const nums = afterLabel.match(/\d[\d,\.]*/g)
    if (!nums) continue
    for (const raw of nums) {
      const val = normalizePrice(raw)
      if (val == null) continue
      if (best == null || val > best) best = val
    }
  }
  return best
}

function firstLabeledText(text, labelRegex, valueRegex) {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!labelRegex.test(line)) continue
    const labelMatch = line.match(labelRegex)
    if (!labelMatch) continue
    const afterLabel = line.slice(labelMatch.index + labelMatch[0].length)
    const m = afterLabel.match(valueRegex)
    if (!m) continue
    const value = m[1].trim()
    if (value.length < 3 || value.length > 150) continue
    return value
  }
  return null
}

/**
 * Finds the value written AFTER a label on the same line.
 *
 * Unlike `firstLabeledText`, the label match is consumed entirely and the
 * separator that follows it is stripped, so a line like
 *   "Product Name: Samsung Washing Machine"
 * yields "Samsung Washing Machine" — not the label's own trailing word
 * ("Name"), which is the bug that left the product name wrong/missing.
 *
 * Returns null when nothing usable follows the label, so a missing field is
 * left blank rather than filled with placeholder text.
 *
 * @param {string} text
 * @param {RegExp} labelRegex  Matches the label (e.g. /\bbrand\b/i).
 * @param {{ min?: number, max?: number, pattern?: RegExp, reject?: (value: string) => boolean }} [options]
 *   `reject` skips a candidate that matches structurally but is not a real
 *   value (e.g. a table column header captured as the product name).
 */
function valueAfterLabel(text, labelRegex, options = {}) {
  const min = options.min ?? 2
  const max = options.max ?? 150
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    const labelMatch = line.match(labelRegex)
    if (!labelMatch) continue

    const afterLabel = line.slice(labelMatch.index + labelMatch[0].length)
    // Drop the separator (":", "-", "#", "=") and its surrounding spacing.
    const value = afterLabel
      .replace(/^[\s:=\-–—#.]+/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[\s,;:.-]+$/, '')

    if (value.length < min || value.length > max) continue
    if (options.pattern && !options.pattern.test(value)) continue
    if (options.reject && options.reject(value)) continue
    return value
  }

  return null
}

function firstUnlabeledAllCapsLine(text, isAcceptable = () => true) {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (
      trimmed.length >= 4 &&
      trimmed.length <= 120 &&
      /^[A-Z0-9][A-Z0-9&\s.'\-]{2,119}$/.test(trimmed) &&
      isAcceptable(trimmed)
    ) {
      return trimmed
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Guards: things that look like a value but are not one
// ---------------------------------------------------------------------------

/**
 * Column headings from an invoice table. OCR regularly returns a header row as
 * the value of a "Description"/"Item" label, which used to reach the review
 * form as a bogus product name ("HSN Qty Amount"). A value made up entirely of
 * these words is never a product name.
 */
const COLUMN_HEADER_WORDS = new Set([
  'no', 'nos', 'number', 'num', 'sr', 'sl', 'sno', 's', 'description',
  'descriptions', 'particulars', 'particular', 'item', 'items', 'product',
  'products', 'goods', 'code', 'hsn', 'sac', 'qty', 'quantity', 'unit', 'units',
  'rate', 'price', 'amount', 'value', 'total', 'net', 'gross', 'tax', 'taxable',
  'gst', 'cgst', 'sgst', 'igst', 'cess', 'discount', 'mrp', 'remark', 'remarks',
  'details', 'name', 'brand', 'model', 'serial', 'type', 'category',
])

/** Words that only ever appear in a document heading, never in a product name. */
const DOCUMENT_TITLE_WORDS = new Set([
  'tax', 'invoice', 'invoices', 'receipt', 'bill', 'bills', 'statement',
  'quotation', 'quote', 'estimate', 'proforma', 'challan', 'order', 'delivery',
  'copy', 'original', 'duplicate', 'customer', 'details', 'page',
])

function wordsOf(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function everyWordIn(value, allowed) {
  const words = wordsOf(value)
  if (words.length === 0 || words.length > 6) return false
  return words.every((word) => allowed.has(word))
}

function looksLikeColumnHeader(value) {
  return everyWordIn(value, COLUMN_HEADER_WORDS)
}

function looksLikeDocumentTitle(value) {
  return everyWordIn(value, DOCUMENT_TITLE_WORDS)
}

/**
 * A bare reference code ("INV-2024-000123", "9X3K821100") is never a product
 * name. Several digits are required so a real name that merely contains a
 * digit is still accepted.
 */
function looksLikeReferenceCode(value) {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!/\d/.test(compact)) return false
  if ((compact.match(/\d/g) || []).length < 3) return false
  return /^[A-Z]{0,8}[-/]?\d[\dA-Z\s./-]*$/i.test(compact)
}

/** True when a candidate must never be used as the product name. */
function isNotProductName(value) {
  return (
    looksLikeColumnHeader(value) ||
    looksLikeDocumentTitle(value) ||
    looksLikeReferenceCode(value)
  )
}

/**
 * Reads a short labelled reference (an invoice number) from a table cell.
 *
 * Real invoices put the number in a column, so the value ends at the first wide
 * (2+ space) gap: "Invoice No: CRO/2024/00123   Date: 12-05-2024" yields
 * "CRO/2024/00123" and not the trailing column heading. A label remnant that
 * was not part of the matched label ("No", "Number", "#") is stripped too.
 *
 * Returns null when nothing usable follows the label, so an unreadable invoice
 * number is left blank instead of being guessed.
 */
function labeledReference(text, labelRegex) {
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    const labelMatch = line.match(labelRegex)
    if (!labelMatch) continue

    const rest = line.slice(labelMatch.index + labelMatch[0].length)

    // "Invoice Date"/"Bill Date" describe a date, not the reference.
    if (/^\s*(?::|-)?\s*(?:date|dt|dated)\b/i.test(rest)) continue
    // "INV-2024-000123" must not be read as the label "INV" plus "-2024-000123":
    // a label is always separated from its value.
    if (/^[-/.]\d/.test(rest)) continue

    const cell = rest.split(/\s{2,}/)[0].trim()
    const value = cell
      .replace(/^[.:=#]+/, '')
      .replace(/^[\u2013\u2014-]+\s+/, '')
      .replace(/^(?:nos?|number|num|#)\s*[:.]?\s*/i, '')
      .replace(/\s+/g, ' ')
      .replace(/[^A-Za-z0-9\-/. ]/g, '')
      .replace(/[\s,;:.-]+$/, '')
      .trim()

    if (!/\d/.test(value)) continue
    if (value.length < 4 || value.length > 60) continue
    return value
  }

  return null
}

/**
 * Extracts suggestion values from OCR text.
 *
 * The result is deliberately tolerant: a field may be missing, may be
 * approximate, and must always be confirmed by the user before anything is
 * created or updated.
 */
function extractSuggestions(text) {
  if (!text) return {}

  const matched = {}

  // Invoice number — labelled, keep only safe characters.
  const invoice = labeledReference(text, /\b(?:invoice|inv(?:oice)?|bill|receipt)\b/i)
  if (invoice) {
    const cleaned = invoice
      .replace(/\s+/g, ' ')
      .replace(/[^A-Z0-9\-/\. ]/gi, '')
      .toUpperCase()
    if (cleaned.length >= 4 && cleaned.length <= 60) {
      matched.invoiceNumber = cleaned
    }
  }

  // Purchase date — take the most realistic candidate.
  const date = normalizeDate(text)
  if (date) matched.purchaseDate = date

  // Purchase price — labelled total/amount, pick the best match on the line.
  const price = firstLabeledCurrency(text, LABEL_TOTAL)
  if (price != null) matched.purchasePrice = price

  // Warranty — prefer a value in months; if only years are present, prefer
  // the smaller number as a rough suggestion rather than multiplying.
  const warrantyMonths = firstLabeledNumber(text, LABEL_WARRANTY, /^(months?|mnths?)?$/)
  if (warrantyMonths) {
    matched.warrantyMonths = warrantyMonths.value
  } else {
    // "N years" without an explicit month marker — keep the years number as a
    // small suggestion (the real duration in months must be confirmed).
    const warrantyYears = firstLabeledNumber(text, LABEL_WARRANTY, /^(years?|yrs?)$/)
    if (warrantyYears) {
      matched.warrantyMonths = warrantyYears.value
    }
  }

  // Seller — labelled seller/store/from line, keep internal punctuation.
  const seller = firstLabeledText(
    text,
    /\b(?:sold\s*by|soldby|sold by|dealer|shop|seller|store|purchased\s*at|purchase\s*at|from)\b/i,
    /\b([A-Z][\w&.'\-,\s]{4,60})\b/,
  )
  if (seller) {
    matched.seller = seller.replace(/\s+/g, ' ').trim()
  }

  // Product name — the value after a "Product Name"/"Item"/"Description"
  // label, consumed whole so the label word itself is never returned. Values
  // that are really a table header, a document heading or a bare reference code
  // are rejected outright, so the review form never shows a fake product name.
  const productName = valueAfterLabel(
    text,
    /\b(?:product\s*(?:name|title)|item\s*(?:name|title|desc(?:ription)?)|product\s*desc(?:ription)?|item|description)\b/i,
    { min: 3, max: 120, reject: isNotProductName },
  )
  if (productName) {
    matched.productName = productName
  }

  // Brand — "Brand: Samsung" / "Make - Samsung" / "Manufacturer Samsung".
  const brand = valueAfterLabel(text, /\b(?:brand|make|manufacturer|mfg)\b/i, {
    min: 2,
    max: 80,
  })
  if (brand) matched.brand = brand

  // Model number — "Model No: WA70BG4441BD" / "Model Number ..." / "Model ...".
  const modelNumber = valueAfterLabel(
    text,
    /\b(?:model\s*(?:no\.?|number|#)?|mdl\s*(?:no\.?|#)?)\b/i,
    { min: 2, max: 100 },
  )
  if (modelNumber) matched.modelNumber = modelNumber

  // Serial number — "Serial No: 9X3K821100" / "S/N" / "IMEI".
  const serialNumber = valueAfterLabel(
    text,
    /\b(?:serial\s*(?:no\.?|number|#)?|sr\.?\s*no\.?|s\/n|imei)\b/i,
    { min: 3, max: 100 },
  )
  if (serialNumber) matched.serialNumber = serialNumber

  // Fallback: only when no labelled product name was found, use an all-caps
  // line as a hint. Never overwrite a real labelled value, and never hand back
  // a document heading or the invoice number (both are all-caps too).
  if (!matched.productName) {
    const fallback = firstUnlabeledAllCapsLine(text, (value) => !isNotProductName(value))
    if (fallback) matched.productName = fallback
  }

  return matched
}

module.exports = {
  extractBillText,
  extractSuggestions,
  normalizePrice,
  normalizeDate,
  MAX_PDF_PAGES,
  MAX_IMAGE_BYTES,
  PDF_RENDER_SCALE,
}
