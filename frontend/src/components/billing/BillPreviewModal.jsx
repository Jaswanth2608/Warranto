import { useEffect, useRef, useState } from 'react'
import { Download, EyeOff, FileText } from 'lucide-react'

import { Modal, buttonClasses } from '../ui'
import { formatDate } from '../../utils/dates'
import { formatFileSize } from '../../utils/format'
import { previewBill, downloadBill, guessExt } from '../../utils/bills'

/** Document preview dialog shared by the product and bills pages. */
export function BillPreviewModal({ open, onClose, bill, product, onDownload }) {
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState(null)
  const previewRef = useRef(null)
  const renderTimer = useRef(null)

  useEffect(() => {
    if (!open || !bill) {
      setPreviewUrl(null)
      setError(null)
      return
    }

    let active = true

    previewBill(bill?.id ? bill.id : null).then((url) => {
      if (!active) return
      if (url) setPreviewUrl(url)
    }).catch((err) => {
      if (!active) return
      setError(err.message || 'Could not load the bill preview.')
    })

    renderTimer.current = setTimeout(() => {
      if (!active) return
      // Fallback: if the preview hasn't loaded yet, show the file icon.
      setError(null)
    }, 4000)

    return () => {
      active = false
      if (renderTimer.current) clearTimeout(renderTimer.current)
    }
  }, [open, bill])

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl])

  if (!bill) return null

  const imageMatch = bill.fileType === 'PNG' || bill.fileType === 'JPG'

  const download = async () => {
    if (!product || !bill) return
    try {
      await downloadBill(product.id, bill.fileName)
      onDownload?.()
    } catch (err) {
      onDownload?.(err)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bill preview"
      description={bill.fileName}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={download}
            className={buttonClasses({ variant: 'secondary', icon: Download })}
          >
            Download
          </button>
          <button type="button" onClick={onClose} className={buttonClasses()}>
            Close
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center">
        {error && (
          <div className="mb-3 flex max-w-sm items-start gap-2.5 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
            <EyeOff size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-danger-500" />
            <span>{error}</span>
          </div>
        )}

        {previewUrl && imageMatch ? (
          <div className="relative w-full max-w-md">
            <img
              ref={previewRef}
              src={previewUrl}
              alt={bill.fileName}
              className="h-auto max-h-[420px] w-full rounded-lg border border-line bg-surface object-contain"
              style={{ ObjectFit: 'contain' }}
            />
          </div>
        ) : previewUrl ? (
          <div className="w-full max-w-md">
            <iframe
              src={previewUrl}
              title={bill.fileName}
              className="h-[420px] w-full rounded-lg border border-line"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-line bg-canvas px-6 py-10">
            <div className="flex h-44 w-36 flex-col items-center justify-center gap-2 rounded-md border border-line bg-surface shadow-card">
              <FileText size={28} className="text-danger-500" aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {bill.fileType}
              </span>
            </div>
            <p className="mt-4 max-w-sm text-center text-[13px] leading-relaxed text-muted">
              {error ? 'Preview unavailable — download the file instead.' : 'Loading preview…'}
            </p>
          </div>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-[13.5px]">
        <div>
          <dt className="text-[12px] uppercase tracking-wide text-muted">File name</dt>
          <dd className="mt-1 truncate font-medium text-ink">{bill.fileName}</dd>
        </div>
        <div>
          <dt className="text-[12px] uppercase tracking-wide text-muted">Size</dt>
          <dd className="mt-1 font-medium text-ink">{formatFileSize(bill.fileSize)}</dd>
        </div>
        <div>
          <dt className="text-[12px] uppercase tracking-wide text-muted">Uploaded</dt>
          <dd className="mt-1 font-medium text-ink">{formatDate(bill.uploadedAt)}</dd>
        </div>
        <div>
          <dt className="text-[12px] uppercase tracking-wide text-muted">Attached to</dt>
          <dd className="mt-1 truncate font-medium text-ink">{product?.name ?? '—'}</dd>
        </div>
      </dl>
    </Modal>
  )
}

export default BillPreviewModal
