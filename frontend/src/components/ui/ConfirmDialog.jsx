import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'

/** Confirmation dialog used before any destructive action (e.g. deleting a product). */
export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      closeOnBackdrop={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] ${
            tone === 'danger'
              ? 'bg-danger-500/12 text-danger-700 ring-1 ring-inset ring-danger-500/25'
              : 'bg-brand-500/12 text-brand-400 ring-1 ring-inset ring-brand-500/25'
          }`}
        >
          <AlertTriangle size={16} aria-hidden="true" />
        </div>
        <p className="text-[13.5px] leading-relaxed text-muted">{message}</p>
      </div>
    </Modal>
  )
}

export default ConfirmDialog
