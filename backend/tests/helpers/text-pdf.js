'use strict'

/**
 * Builds a minimal, valid PDF whose page has a real text layer.
 *
 * OCR tests need a deterministic document: a text-layer PDF is read directly
 * (source "pdf") instead of being rasterized and run through Tesseract, so the
 * assertions do not depend on OCR accuracy. No font embedding is required —
 * Helvetica is one of the PDF standard fonts.
 *
 * @param {string[]} lines  Text lines, printed top to bottom.
 * @returns {Buffer}
 */

function escapePdfText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function buildTextPdf(lines) {
  const stream =
    'BT\n/F1 12 Tf\n14 TL\n50 750 Td\n' +
    lines.map((line) => `(${escapePdfText(line)}) Tj T*`).join('\n') +
    '\nET'

  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Length ${Buffer.byteLength(stream)}>>\nstream\n${stream}\nendstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = []

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}

module.exports = { buildTextPdf, escapePdfText }
