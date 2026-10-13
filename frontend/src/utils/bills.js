import { billService } from '../services/billService'

/** Reads a stored bill through the API and triggers a browser download. */
export async function downloadBill(productId, fileName) {
  const res = await billService.getFile(productId)
  const url = URL.createObjectURL(res.data)
  const ext = guessExt(res.data)
  const baseName = fileName ? fileName.replace(/\.[^.]+$/, '') : 'bill'
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Reads a stored bill through the API and returns an object URL suitable for
 * an <img> tag (images) or an <iframe>/<object> (PDF). Returns null on error.
 */
export async function previewBill(productId) {
  const res = await billService.getFile(productId)
  return URL.createObjectURL(res.data)
}

/** Best-guess extension for a blob from its media type. */
export function guessExt(blob) {
  switch (blob.type) {
    case 'application/pdf':
      return 'pdf'
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/jpg':
      return 'jpg'
    default:
      return 'pdf'
  }
}
