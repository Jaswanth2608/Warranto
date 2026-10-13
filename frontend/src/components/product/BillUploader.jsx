import { useRef, useState } from 'react'
import { FileText, Trash2, UploadCloud } from 'lucide-react'

import { BILL_ACCEPTED_TYPES, BILL_MAX_SIZE_MB } from '../../utils/constants'
import { formatFileSize } from '../../utils/format'

/**
 * Drag-and-drop purchase bill picker.
 * Files stay local (preview only) — Cloudinary upload arrives with the backend.
 */
export function BillUploader({ file, onChange, onError, id = 'bill-upload' }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const acceptCandidate = (candidate) => {
    if (!candidate) return
    const extension = candidate.name.split('.').pop()?.toUpperCase()
    if (!BILL_ACCEPTED_TYPES.includes(extension)) {
      onError?.('Unsupported file type. Please upload a PDF, JPG, JPEG or PNG.')
      return
    }
    if (candidate.size > BILL_MAX_SIZE_MB * 1024 * 1024) {
      onError?.(`File is too large. Maximum allowed size is ${BILL_MAX_SIZE_MB} MB.`)
      return
    }
    onChange?.(candidate)
  }

  const displayName = file ? (file.fileName ?? file.name) : null
  const displaySize = file ? (file.fileSize ?? file.size) : null
  const displayType = file
    ? (file.fileType ?? file.name.split('.').pop()?.toUpperCase())
    : null

  if (displayName) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-card">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-500/15">
          <FileText size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink" title={displayName}>
            {displayName}
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {displayType} · {formatFileSize(displaySize)} · File stays on this device
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange?.(null)}
          className="rounded-md p-2 text-muted transition hover:bg-danger-50 hover:text-danger-700"
          aria-label="Remove selected bill"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          acceptCandidate(event.dataTransfer.files?.[0])
        }}
        className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition ${
          dragging
            ? 'border-brand-500 bg-brand-50/70'
            : 'border-line-strong bg-canvas/60 hover:border-brand-400 hover:bg-brand-50/40'
        }`}
      >
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-brand-400 shadow-card ring-1 ring-line">
          <UploadCloud size={20} aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-ink">Upload purchase bill</p>
        <p className="mt-1 text-[13px] text-muted">
          Drag and drop, or{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-brand-400 underline underline-offset-2 hover:text-brand-300"
          >
            browse files
          </button>
        </p>
        <p className="mt-2 text-[12px] text-muted">
          Supported: PDF, JPG, JPEG, PNG · Max {BILL_MAX_SIZE_MB} MB
        </p>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="sr-only"
          onChange={(event) => {
            acceptCandidate(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

export default BillUploader
